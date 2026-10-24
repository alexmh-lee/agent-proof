import {
  getTableColumns,
  getTableName,
  isTable,
  type Table,
} from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { directoryAuthority } from "@/lib/agent-registration";
import {
  findPrivateKeyMaterial,
  PRIVATE_JWK_MEMBERS,
} from "@/lib/key-material";
import {
  accountWithApiKey,
  apiRequest,
  signedRegistrationBody,
  type RouteHandler,
} from "../helpers/agent-api";

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  const db = await actual.createDb();
  return { ...actual, getDb: async () => db };
});

const { getDb } = await import("@/db");
const { GET: getDirectory } = await import(
  "@/app/.well-known/http-message-signatures-directory/route"
);
const { GET: listAgents, POST: registerAgent } = (await import(
  "@/app/api/v1/agents/route"
)) as Record<"GET" | "POST", RouteHandler>;
const { POST: createChallenge } = await import(
  "@/app/api/v1/agents/challenge/route"
);
const { POST: uploadAttestation } = await import(
  "@/app/api/v1/agents/[agentId]/keys/[keyId]/attestation/route"
);
const { GET: getKeyMetadata } = await import(
  "@/app/api/v1/keys/[thumbprint]/route"
);

describe("findPrivateKeyMaterial", () => {
  it("flags a private JWK member anywhere in a payload", () => {
    const payload = {
      agent: { name: "scout" },
      keys: [{ kty: "OKP", crv: "Ed25519", x: "abc", d: "secret" }],
    };
    expect(findPrivateKeyMaterial(payload)).toEqual(["$.keys[0].d"]);
  });

  it("flags PEM-encoded private keys in string values", () => {
    const payload = {
      key: "-----BEGIN PRIVATE KEY-----\nMC4CAQAw\n-----END PRIVATE KEY-----",
    };
    expect(findPrivateKeyMaterial(payload)).toEqual(["$.key"]);
  });

  it("accepts a public-only Ed25519 JWK", () => {
    expect(
      findPrivateKeyMaterial({ kty: "OKP", crv: "Ed25519", x: "abc", kid: "t" }),
    ).toEqual([]);
  });
});

// Every API response that returns key data belongs in this list. Later
// phases add database tables and new endpoints here.
describe("API responses contain no private key material", () => {
  it("GET /.well-known/http-message-signatures-directory and key metadata", async () => {
    const db = await getDb();
    const { id: accountId, authorization } = await accountWithApiKey(
      db,
      "email_verified",
    );
    const challenge = await createChallenge(
      apiRequest("/api/v1/agents/challenge", { authorization }),
    );
    const challengeBody = await challenge.json();
    const registered = await registerAgent(
      apiRequest("/api/v1/agents", {
        authorization,
        body: signedRegistrationBody(
          challengeBody,
          "custody-directory",
          "Directory custody check.",
        ),
      }),
    );
    const agent = await registered.json();
    const host = directoryAuthority(accountId);

    const directory = await getDirectory(
      new Request(
        `http://${host}/.well-known/http-message-signatures-directory`,
        { headers: { host } },
      ),
    );
    expect(directory.status).toBe(200);
    expect(findPrivateKeyMaterial(await directory.json())).toEqual([]);

    const metadata = await getKeyMetadata(
      new Request(`http://${host}/api/v1/keys/${agent.key.thumbprint}`, {
        headers: { host },
      }),
      {
        params: Promise.resolve({ thumbprint: agent.key.thumbprint }),
      },
    );
    expect(metadata.status).toBe(200);
    expect(findPrivateKeyMaterial(await metadata.json())).toEqual([]);
  });

  it("POST /api/v1/agents/challenge, POST /api/v1/agents, GET /api/v1/agents, attestation", async () => {
    const { authorization } = await accountWithApiKey(
      await getDb(),
      "email_verified",
    );

    const challenge = await createChallenge(
      apiRequest("/api/v1/agents/challenge", { authorization }),
    );
    expect(challenge.status).toBe(201);
    const challengeBody = await challenge.json();
    expect(findPrivateKeyMaterial(challengeBody)).toEqual([]);

    const registered = await registerAgent(
      apiRequest("/api/v1/agents", {
        authorization,
        body: signedRegistrationBody(
          challengeBody,
          "custody-agent",
          "Checks API responses for private key members.",
        ),
      }),
    );
    expect(registered.status).toBe(201);
    const registeredBody = await registered.json();
    expect(findPrivateKeyMaterial(registeredBody)).toEqual([]);

    const listed = await listAgents(
      apiRequest("/api/v1/agents", { method: "GET", authorization }),
    );
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    expect(listedBody.agents).toHaveLength(1);
    expect(findPrivateKeyMaterial(listedBody)).toEqual([]);

    const attestation = await uploadAttestation(
      apiRequest(
        `/api/v1/agents/${registeredBody.id}/keys/${registeredBody.key.id}/attestation`,
        {
          authorization,
          body: {
            authority: challengeBody.directory_authority,
            signature_input: "not-a-real-signature",
            signature: "also-not-real",
          },
        },
      ),
      {
        params: Promise.resolve({
          agentId: registeredBody.id,
          keyId: registeredBody.key.id,
        }),
      },
    );
    // Invalid attestation is rejected before any key material could leak back.
    expect(attestation.status).toBe(400);
    expect(findPrivateKeyMaterial(await attestation.json())).toEqual([]);
  });
});

// Every table in src/db/schema.ts is checked automatically.
describe("database tables have no column that could hold private keys", () => {
  const tables = (Object.values(schema) as unknown[]).filter(
    (value): value is Table => isTable(value),
  );

  it("finds the tables", () => {
    expect(tables.map(getTableName).sort()).toEqual([
      "account",
      "agent",
      "agent_key",
      "api_key",
      "directory_attestation",
      "registration_challenge",
      "session",
      "user",
      "verificationToken",
    ]);
  });

  it.each(tables.map((table) => [getTableName(table), table] as const))(
    "%s",
    (_name, table) => {
      const suspicious = Object.values(getTableColumns(table))
        .map((column) => column.name)
        .filter(
          (name) =>
            PRIVATE_JWK_MEMBERS.includes(name.toLowerCase()) ||
            /private|secret|pem/i.test(name) ||
            (/jwk/i.test(name) && name !== "public_jwk"),
        );
      expect(suspicious).toEqual([]);
    },
  );
});
