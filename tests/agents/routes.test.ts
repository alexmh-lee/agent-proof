import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  accountWithApiKey,
  apiRequest,
  signedRegistrationBody,
  type ChallengeResponse,
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

async function challengeFor(authorization: string) {
  const response = await createChallenge(
    apiRequest("/api/v1/agents/challenge", { authorization }),
  );
  expect(response.status).toBe(201);
  return (await response.json()) as ChallengeResponse;
}

async function verifiedAccount() {
  return accountWithApiKey(await getDb(), "email_verified");
}

const routes = [
  [
    "POST /api/v1/agents/challenge",
    (authorization?: string) =>
      createChallenge(
        apiRequest("/api/v1/agents/challenge", { authorization }),
      ),
  ],
  [
    "POST /api/v1/agents",
    (authorization?: string) =>
      registerAgent(apiRequest("/api/v1/agents", { authorization, body: {} })),
  ],
  [
    "GET /api/v1/agents",
    (authorization?: string) =>
      listAgents(
        apiRequest("/api/v1/agents", { method: "GET", authorization }),
      ),
  ],
] as const;

describe("agent API authentication", () => {
  it.each(routes)("%s returns 401 without a bearer key", async (_, call) => {
    expect((await call()).status).toBe(401);
  });

  it.each(routes)("%s returns 401 for an invalid key", async (_, call) => {
    expect((await call("Bearer ap_notARealKey")).status).toBe(401);
    expect((await call("Basic ap_notARealKey")).status).toBe(401);
  });

  it.each(routes)("%s returns 403 for an unverified account", async (_, call) => {
    const owner = await accountWithApiKey(await getDb(), "unverified");
    expect((await call(owner.authorization)).status).toBe(403);
  });
});

describe("agent registration routes", () => {
  it("registers a valid agent and lists it", async () => {
    const owner = await verifiedAccount();
    const body = signedRegistrationBody(
      await challengeFor(owner.authorization),
      "route-agent",
      "Checks the real route handlers.",
    );

    const created = await registerAgent(
      apiRequest("/api/v1/agents", { authorization: owner.authorization, body }),
    );
    expect(created.status).toBe(201);
    const agent = await created.json();
    expect(agent).toMatchObject({
      name: "route-agent",
      status: "active",
      key: { public_jwk: body.public_jwk, status: "active" },
    });

    const listed = await listAgents(
      apiRequest("/api/v1/agents", {
        method: "GET",
        authorization: owner.authorization,
      }),
    );
    expect(listed.status).toBe(200);
    expect((await listed.json()).agents).toEqual([
      expect.objectContaining({ id: agent.id, name: "route-agent" }),
    ]);
  });

  it("returns 409 for a reused challenge", async () => {
    const owner = await verifiedAccount();
    const challenge = await challengeFor(owner.authorization);
    const register = (body: unknown) =>
      registerAgent(
        apiRequest("/api/v1/agents", {
          authorization: owner.authorization,
          body,
        }),
      );

    const first = signedRegistrationBody(challenge, "reuse-one", "First use.");
    expect((await register(first)).status).toBe(201);
    const second = signedRegistrationBody(challenge, "reuse-two", "Replay.");
    expect((await register(second)).status).toBe(409);
  });
});

describe("registration rejects private or non-Ed25519 keys", () => {
  async function rejected(publicJwk: unknown) {
    const owner = await verifiedAccount();
    const pair = generateKeyPairSync("ed25519");
    const body = {
      ...signedRegistrationBody(
        await challengeFor(owner.authorization),
        "rejected-agent",
        "Must be rejected.",
        pair.privateKey,
      ),
      public_jwk: publicJwk,
    };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await registerAgent(
      apiRequest("/api/v1/agents", { authorization: owner.authorization, body }),
    );
    const logged = JSON.stringify(warning.mock.calls);
    warning.mockRestore();
    return { response, logged, pair };
  }

  it("returns 400 for a key containing a d field and does not log it", async () => {
    const pair = generateKeyPairSync("ed25519");
    const privateJwk = pair.privateKey.export({ format: "jwk" });
    const { response, logged } = await rejected(privateJwk);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Private key material/);
    expect(logged).not.toContain(privateJwk.d);
  });

  it("returns 400 for a PEM private key and does not log it", async () => {
    const pem = generateKeyPairSync("ed25519")
      .privateKey.export({ format: "pem", type: "pkcs8" })
      .toString();
    const { response, logged } = await rejected(pem);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Private key material/);
    expect(logged).not.toContain("PRIVATE KEY");
  });

  it.each([
    ["an X25519 key", () => generateKeyPairSync("x25519")],
    ["a P-256 key", () => generateKeyPairSync("ec", { namedCurve: "P-256" })],
  ])("returns 400 for %s", async (_, generate) => {
    const publicJwk = generate().publicKey.export({ format: "jwk" });
    const { response } = await rejected(publicJwk);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/kty=OKP, crv=Ed25519/);
  });
});
