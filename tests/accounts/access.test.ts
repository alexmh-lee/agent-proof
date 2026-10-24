import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/auth";
import type { TrustLevel } from "@/db/schema";
import {
  accountWithApiKey,
  apiRequest,
  type RouteHandler,
} from "../helpers/agent-api";

const getCurrentUser = vi.fn<() => Promise<CurrentUser | null>>();
vi.mock("@/auth", () => ({ getCurrentUser }));
vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  const db = await actual.createDb();
  return { ...actual, getDb: async () => db };
});

const { getDb } = await import("@/db");
const { default: AgentsPage } = await import("@/app/agents/page");
const { GET, POST } = (await import("@/app/api/v1/agents/route")) as Record<
  "GET" | "POST",
  RouteHandler
>;
const { POST: POST_CHALLENGE } = await import(
  "@/app/api/v1/agents/challenge/route"
);

function signedInAs(trustLevel: TrustLevel | null) {
  getCurrentUser.mockResolvedValue(
    trustLevel && {
      id: "user-1",
      email: "dev@example.com",
      trustLevel,
      domain: null,
      domainToken: null,
      domainVerifiedAt: null,
    },
  );
}

async function redirectTarget(render: () => Promise<unknown>) {
  try {
    await render();
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2];
    throw error;
  }
  return null;
}

beforeEach(() => getCurrentUser.mockReset());

describe("agents page requires a verified email", () => {
  it("sends signed-out visitors to /login", async () => {
    signedInAs(null);
    expect(await redirectTarget(() => AgentsPage())).toBe("/login");
  });

  it("sends unverified accounts to /account", async () => {
    signedInAs("unverified");
    expect(await redirectTarget(() => AgentsPage())).toBe("/account");
  });

  it("renders for email-verified accounts", async () => {
    signedInAs("email_verified");
    expect(await redirectTarget(() => AgentsPage())).toBeNull();
  });
});

describe("agent registration API requires a verified email", () => {
  const handlers = [
    ["GET /api/v1/agents", GET, "GET", "/api/v1/agents"],
    ["POST /api/v1/agents", POST, "POST", "/api/v1/agents"],
    [
      "POST /api/v1/agents/challenge",
      POST_CHALLENGE,
      "POST",
      "/api/v1/agents/challenge",
    ],
  ] as const;

  it.each(handlers)("%s returns 401 without an API key", async (_, handler, method, path) => {
    expect((await handler(apiRequest(path, { method }))).status).toBe(401);
  });

  it.each(handlers)(
    "%s returns 403 for an unverified account",
    async (_, handler, method, path) => {
      const owner = await accountWithApiKey(await getDb(), "unverified");
      const response = await handler(
        apiRequest(path, { method, authorization: owner.authorization }),
      );
      expect(response.status).toBe(403);
    },
  );

  it.each(
    handlers.flatMap(([name, handler, method, path]) =>
      (["email_verified", "domain_verified"] as const).map(
        (level) => [name, level, handler, method, path] as const,
      ),
    ),
  )(
    "%s lets %s accounts through the gate",
    async (_, level, handler, method, path) => {
      const owner = await accountWithApiKey(await getDb(), level);
      const response = await handler(
        apiRequest(path, { method, authorization: owner.authorization }),
      );
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    },
  );
});
