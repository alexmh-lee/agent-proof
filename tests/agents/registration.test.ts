import { generateKeyPairSync, sign as signBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db";
import { agentKeys, agents, apiKeys, users } from "@/db/schema";
import {
  authenticateApiKey,
  createApiKey,
  revokeApiKey,
} from "@/lib/api-keys";
import {
  createRegistrationChallenge,
  effectiveKeyStatus,
  listAgents,
  publicJwkThumbprint,
  registerAgent,
  registrationMessage,
  type RegistrationLimits,
} from "@/lib/agent-registration";
import { findPrivateKeyMaterial } from "@/lib/key-material";

let db: Db;

beforeAll(async () => {
  db = await createDb();
});

async function account(
  trustLevel: "email_verified" | "domain_verified" = "email_verified",
) {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `${id}@example.com`,
    emailVerified: new Date(),
    trustLevel,
  });
  return { id, trustLevel };
}

async function signedRegistration(
  accountId: string,
  name: string,
  purpose: string,
  pair = generateKeyPairSync("ed25519"),
) {
  const challenge = await createRegistrationChallenge(db, accountId);
  const exported = pair.publicKey.export({ format: "jwk" });
  const publicJwk = {
    kty: "OKP" as const,
    crv: "Ed25519" as const,
    x: exported.x!,
  };
  const thumbprint = publicJwkThumbprint(publicJwk);
  const message = registrationMessage({
    accountId,
    directoryAuthority: challenge.directoryAuthority,
    issuedAt: challenge.issuedAt,
    nonce: challenge.nonce,
    purpose,
    thumbprint,
  });
  return {
    pair,
    challenge,
    body: {
      challenge_id: challenge.challengeId,
      name,
      purpose,
      public_jwk: publicJwk,
      signature: signBytes(
        null,
        Buffer.from(message),
        pair.privateKey,
      ).toString("base64url"),
    },
  };
}

describe("account API keys", () => {
  it("stores only a hash and stops authenticating after revocation", async () => {
    const owner = await account();
    const created = await createApiKey(db, owner.id, "Integration test");
    expect(created.rawKey).toMatch(/^ap_[A-Za-z0-9_-]+$/);

    const [stored] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, created.record.id));
    expect(stored.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.keyHash).not.toContain(created.rawKey);
    expect(stored.lastFour).toBe(created.rawKey.slice(-4));
    expect(JSON.stringify(stored)).not.toContain(created.rawKey);

    const accepted = await authenticateApiKey(
      db,
      `Bearer ${created.rawKey}`,
    );
    expect(accepted.ok).toBe(true);

    expect(await revokeApiKey(db, owner.id, created.record.id)).toBe(true);
    const rejected = await authenticateApiKey(
      db,
      `Bearer ${created.rawKey}`,
    );
    expect(rejected).toMatchObject({ ok: false, status: 401 });
  });
});

describe("agent registration proof", () => {
  it("generates a key locally, verifies possession, and stores only public data", async () => {
    const owner = await account();
    const request = await signedRegistration(
      owner.id,
      "research-agent",
      "Summarizes public research.",
    );
    const registered = await registerAgent(db, owner, request.body);

    expect(registered.status).toBe("active");
    expect(registered.key.thumbprint).toBe(
      publicJwkThumbprint(request.body.public_jwk),
    );
    expect(findPrivateKeyMaterial(registered)).toEqual([]);
    const [stored] = await db
      .select()
      .from(agentKeys)
      .where(eq(agentKeys.id, registered.key.id));
    expect(stored.publicJwk).toEqual(request.body.public_jwk);
    expect(findPrivateKeyMaterial(stored)).toEqual([]);
    expect(JSON.stringify(stored)).not.toContain(
      request.pair.privateKey
        .export({ format: "jwk" })
        .d!,
    );
  });

  it("rejects a reused challenge", async () => {
    const owner = await account();
    const request = await signedRegistration(
      owner.id,
      "single-use",
      "Exercises challenge replay protection.",
    );
    await registerAgent(db, owner, request.body);
    await expect(registerAgent(db, owner, request.body)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects and does not log a submitted private JWK", async () => {
    const owner = await account();
    const request = await signedRegistration(
      owner.id,
      "private-key",
      "Must never upload private key data.",
    );
    const privateJwk = request.pair.privateKey.export({ format: "jwk" });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      registerAgent(db, owner, {
        ...request.body,
        public_jwk: privateJwk,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(warning).toHaveBeenCalledWith(
      "Rejected an agent registration request containing private key material.",
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain(privateJwk.d);
    warning.mockRestore();
  });

  it("rejects an expired challenge", async () => {
    const owner = await account();
    const request = await signedRegistration(
      owner.id,
      "expired-proof",
      "Exercises challenge expiry.",
    );
    await expect(
      registerAgent(db, owner, request.body, {
        now: new Date(request.challenge.expiresAt.getTime() + 1),
      }),
    ).rejects.toMatchObject({ status: 410 });
  });

  it("stores registrations over the account limit as pending review", async () => {
    const owner = await account();
    const limits: RegistrationLimits = {
      emailVerifiedAgents: 1,
      domainVerifiedAgents: 2,
      registrationsPerDay: 10,
    };
    const first = await signedRegistration(
      owner.id,
      "first-agent",
      "Uses the final active slot.",
    );
    expect(
      (await registerAgent(db, owner, first.body, { limits })).status,
    ).toBe("active");

    const second = await signedRegistration(
      owner.id,
      "second-agent",
      "Waits for manual review.",
    );
    const result = await registerAgent(db, owner, second.body, { limits });
    expect(result.status).toBe("pending_review");
    expect(result.key.status).toBe("pending_review");

    const [stored] = await db
      .select({ status: agents.status })
      .from(agents)
      .where(eq(agents.id, result.id));
    expect(stored.status).toBe("pending_review");

    const listed = await listAgents(db, owner.id);
    expect(
      listed.find((agent) => agent.id === result.id)?.keyStatus,
    ).toBe("pending_review");
    expect(
      listed.find((agent) => agent.name === "first-agent")?.keyStatus,
    ).toBe("active");
  });

  it("never reports a key of a non-active agent as active", () => {
    expect(effectiveKeyStatus("pending_review", "active")).toBe(
      "pending_review",
    );
    expect(effectiveKeyStatus("pending_review", "retiring")).toBe(
      "pending_review",
    );
    expect(effectiveKeyStatus("revoked", "active")).toBe("revoked");
    expect(effectiveKeyStatus("active", "active")).toBe("active");
    expect(effectiveKeyStatus("active", "retiring")).toBe("retiring");
  });

  it("enforces global thumbprint uniqueness", async () => {
    const firstOwner = await account();
    const secondOwner = await account();
    const pair = generateKeyPairSync("ed25519");
    const first = await signedRegistration(
      firstOwner.id,
      "first-owner",
      "Registers a globally unique key.",
      pair,
    );
    await registerAgent(db, firstOwner, first.body);
    const duplicate = await signedRegistration(
      secondOwner.id,
      "second-owner",
      "Attempts to reuse that key.",
      pair,
    );
    await expect(
      registerAgent(db, secondOwner, duplicate.body),
    ).rejects.toMatchObject({ status: 409 });
  });
});
