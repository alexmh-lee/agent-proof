import { generateKeyPairSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { agentKeys, agents } from "@/db/schema";
import {
  directoryAuthority,
  publicJwkThumbprint,
} from "@/lib/agent-registration";
import {
  contentDigestSha256,
  serializeDirectoryBody,
} from "@/lib/directory";
import {
  accountWithApiKey,
  apiRequest,
  signedRegistrationBody,
  type ChallengeResponse,
  type RouteHandler,
} from "../helpers/agent-api";
import {
  signDirectoryAttestation,
  verifyDirectoryResponseSignatures,
} from "../helpers/directory-attestation";

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  const db = await actual.createDb();
  return { ...actual, getDb: async () => db };
});

const { getDb } = await import("@/db");
const { GET: getDirectory } = await import(
  "@/app/.well-known/http-message-signatures-directory/route"
);
const { GET: getKeyMetadata } = await import(
  "@/app/api/v1/keys/[thumbprint]/route"
);
const { POST: createChallenge } = await import(
  "@/app/api/v1/agents/challenge/route"
);
const { POST: registerAgent } = (await import(
  "@/app/api/v1/agents/route"
)) as { POST: RouteHandler };
const { POST: uploadAttestation } = await import(
  "@/app/api/v1/agents/[agentId]/keys/[keyId]/attestation/route"
);

function directoryRequest(accountId: string, port?: number) {
  const host = port
    ? `${directoryAuthority(accountId)}:${port}`
    : directoryAuthority(accountId);
  return new Request(
    `http://${host}/.well-known/http-message-signatures-directory`,
    { headers: { host } },
  );
}

function metadataRequest(accountId: string, thumbprint: string) {
  const host = directoryAuthority(accountId);
  return {
    request: new Request(`http://${host}/api/v1/keys/${thumbprint}`, {
      headers: { host },
    }),
    context: {
      params: Promise.resolve({ thumbprint }),
    },
  };
}

async function registerWithKey(
  authorization: string,
  name: string,
  purpose: string,
  pair = generateKeyPairSync("ed25519"),
) {
  const challengeRes = await createChallenge(
    apiRequest("/api/v1/agents/challenge", { authorization }),
  );
  expect(challengeRes.status).toBe(201);
  const challenge = (await challengeRes.json()) as ChallengeResponse;
  const body = signedRegistrationBody(challenge, name, purpose, pair.privateKey);
  const registered = await registerAgent(
    apiRequest("/api/v1/agents", { authorization, body }),
  );
  expect(registered.status).toBe(201);
  const agent = await registered.json();
  return { pair, challenge, agent, publicJwk: body.public_jwk };
}

beforeAll(async () => {
  await getDb();
});

describe("hosted key directory", () => {
  it("defaults directory hosts to <account>.id.localhost", () => {
    const accountId = "11111111-1111-1111-1111-111111111111";
    expect(directoryAuthority(accountId)).toBe(
      `${accountId}.id.localhost`,
    );
  });

  it("lists active keys and omits revoked and pending_review keys", async () => {
    const db = await getDb();
    const { id: accountId, authorization } = await accountWithApiKey(
      db,
      "email_verified",
    );

    const active = await registerWithKey(
      authorization,
      "active-bot",
      "Published agent for directory tests.",
    );
    const pending = await registerWithKey(
      authorization,
      "pending-bot",
      "Should stay out of the directory.",
    );
    await db
      .update(agents)
      .set({ status: "pending_review" })
      .where(eq(agents.id, pending.agent.id));

    const revoked = await registerWithKey(
      authorization,
      "revoked-bot",
      "Revoked key must not appear.",
    );
    await db
      .update(agentKeys)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(agentKeys.id, revoked.agent.key.id));

    const response = await getDirectory(directoryRequest(accountId));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/http-message-signatures-directory+json",
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=300",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    const bodyText = await response.text();
    const body = JSON.parse(bodyText) as {
      keys: Array<Record<string, string>>;
    };
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).toEqual({
      kty: "OKP",
      crv: "Ed25519",
      kid: active.agent.key.thumbprint,
      x: active.publicJwk.x,
      use: "sig",
    });
    expect(body.keys[0]).not.toHaveProperty("alg");
    expect(body.keys[0].kid).toBe(publicJwkThumbprint(active.publicJwk));
    expect(bodyText).toBe(
      serializeDirectoryBody([
        {
          keyId: active.agent.key.id,
          thumbprint: active.agent.key.thumbprint,
          publicJwk: active.publicJwk,
          agentName: "active-bot",
          purpose: "Published agent for directory tests.",
          status: "active",
          notAfter: null,
        },
      ]),
    );
    expect(response.headers.get("content-digest")).toBe(
      contentDigestSha256(bodyText),
    );
    expect(response.headers.get("signature")).toBeNull();
  });

  it("returns 404 on the app origin without an account subdomain", async () => {
    const response = await getDirectory(
      new Request(
        "http://localhost:3000/.well-known/http-message-signatures-directory",
        { headers: { host: "localhost:3000" } },
      ),
    );
    expect(response.status).toBe(404);
  });

  it("maps a published keyid to agent name and purpose", async () => {
    const db = await getDb();
    const { id: accountId, authorization } = await accountWithApiKey(
      db,
      "email_verified",
    );
    const { agent } = await registerWithKey(
      authorization,
      "meta-bot",
      "Metadata lookup purpose.",
    );

    const { request, context } = metadataRequest(
      accountId,
      agent.key.thumbprint,
    );
    const response = await getKeyMetadata(request, context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      thumbprint: agent.key.thumbprint,
      name: "meta-bot",
      purpose: "Metadata lookup purpose.",
      status: "active",
    });

    const missing = metadataRequest(accountId, "missing-thumbprint");
    expect(
      (await getKeyMetadata(missing.request, missing.context)).status,
    ).toBe(404);
  });

  it("serves a valid uploaded attestation and drops an expired one", async () => {
    const db = await getDb();
    const { id: accountId, authorization } = await accountWithApiKey(
      db,
      "email_verified",
    );
    const { pair, agent, publicJwk } = await registerWithKey(
      authorization,
      "attest-bot",
      "Attestation coverage.",
    );

    const host = directoryAuthority(accountId);
    const unsigned = await getDirectory(directoryRequest(accountId));
    const body = await unsigned.text();
    const nowSec = Math.floor(Date.now() / 1000);
    const attested = signDirectoryAttestation({
      authority: host,
      body,
      thumbprint: agent.key.thumbprint,
      privateKey: pair.privateKey,
      created: nowSec,
      expires: nowSec + 3600,
    });

    const uploaded = await uploadAttestation(
      apiRequest(
        `/api/v1/agents/${agent.id}/keys/${agent.key.id}/attestation`,
        {
          authorization,
          body: {
            authority: attested.authority,
            signature_input: attested.signature_input,
            signature: attested.signature,
            label: attested.label,
          },
        },
      ),
      { params: Promise.resolve({ agentId: agent.id, keyId: agent.key.id }) },
    );
    expect(uploaded.status).toBe(201);

    const served = await getDirectory(directoryRequest(accountId));
    expect(served.status).toBe(200);
    const servedBody = await served.text();
    expect(servedBody).toBe(body);
    expect(served.headers.get("signature-input")).toContain(attested.label);
    expect(served.headers.get("signature")).toContain(attested.label);

    const verified = verifyDirectoryResponseSignatures({
      authority: host,
      body: servedBody,
      contentDigestHeader: served.headers.get("content-digest"),
      signatureInputHeader: served.headers.get("signature-input"),
      signatureHeader: served.headers.get("signature"),
      publicKeysByThumbprint: new Map([
        [agent.key.thumbprint, publicJwk],
      ]),
    });
    expect(verified).toEqual({ ok: true });

    const expired = signDirectoryAttestation({
      authority: host,
      body,
      thumbprint: agent.key.thumbprint,
      privateKey: pair.privateKey,
      created: nowSec - 7200,
      expires: nowSec - 60,
      label: attested.label,
    });
    // Upload is rejected while expired; store a soon-to-expire one then serve later.
    const rejectExpired = await uploadAttestation(
      apiRequest(
        `/api/v1/agents/${agent.id}/keys/${agent.key.id}/attestation`,
        {
          authorization,
          body: {
            authority: expired.authority,
            signature_input: expired.signature_input,
            signature: expired.signature,
            label: expired.label,
          },
        },
      ),
      { params: Promise.resolve({ agentId: agent.id, keyId: agent.key.id }) },
    );
    expect(rejectExpired.status).toBe(400);

    const shortLived = signDirectoryAttestation({
      authority: host,
      body,
      thumbprint: agent.key.thumbprint,
      privateKey: pair.privateKey,
      created: nowSec - 10,
      expires: nowSec + 30,
      label: attested.label,
    });
    const shortUpload = await uploadAttestation(
      apiRequest(
        `/api/v1/agents/${agent.id}/keys/${agent.key.id}/attestation`,
        {
          authorization,
          body: {
            authority: shortLived.authority,
            signature_input: shortLived.signature_input,
            signature: shortLived.signature,
            label: shortLived.label,
          },
        },
      ),
      { params: Promise.resolve({ agentId: agent.id, keyId: agent.key.id }) },
    );
    expect(shortUpload.status).toBe(201);

    // Freeze time past expiry: attestation must not be served.
    vi.useFakeTimers();
    vi.setSystemTime(new Date((nowSec + 120) * 1000));
    try {
      const afterExpiry = await getDirectory(directoryRequest(accountId));
      expect(afterExpiry.headers.get("signature")).toBeNull();
      expect(afterExpiry.headers.get("signature-input")).toBeNull();
      expect(await afterExpiry.text()).toBe(body);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects attestation uploads that include private key material", async () => {
    const db = await getDb();
    const { id: accountId, authorization } = await accountWithApiKey(
      db,
      "email_verified",
    );
    const { agent, pair } = await registerWithKey(
      authorization,
      "private-reject",
      "Must reject d.",
    );
    const response = await uploadAttestation(
      apiRequest(
        `/api/v1/agents/${agent.id}/keys/${agent.key.id}/attestation`,
        {
          authorization,
          body: {
            authority: directoryAuthority(accountId),
            signature_input: "x",
            signature: "y",
            d: pair.privateKey.export({ format: "jwk" }).d,
          },
        },
      ),
      { params: Promise.resolve({ agentId: agent.id, keyId: agent.key.id }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Private key material must never be sent to AgentProof.",
    });
  });
});
