import {
  getTableColumns,
  getTableName,
  isTable,
  type Table,
} from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { GET as getDirectory } from "@/app/.well-known/http-message-signatures-directory/route";
import * as schema from "@/db/schema";
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
const { GET: listAgents, POST: registerAgent } = (await import(
  "@/app/api/v1/agents/route"
)) as Record<"GET" | "POST", RouteHandler>;
const { POST: createChallenge } = await import(
  "@/app/api/v1/agents/challenge/route"
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
  it("GET /.well-known/http-message-signatures-directory", async () => {
    const response = getDirectory();
    const body = await response.json();

    expect(findPrivateKeyMaterial(body)).toEqual([]);
  });

  it("POST /api/v1/agents/challenge, POST /api/v1/agents, GET /api/v1/agents", async () => {
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
    expect(findPrivateKeyMaterial(await registered.json())).toEqual([]);

    const listed = await listAgents(
      apiRequest("/api/v1/agents", { method: "GET", authorization }),
    );
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    expect(listedBody.agents).toHaveLength(1);
    expect(findPrivateKeyMaterial(listedBody)).toEqual([]);
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
