import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/auth";
import type { TrustLevel } from "@/db/schema";

const getCurrentUser = vi.fn<() => Promise<CurrentUser | null>>();
vi.mock("@/auth", () => ({ getCurrentUser }));
vi.mock("@/db", () => ({ getDb: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/agent-registration", () => ({
  listAgents: vi.fn().mockResolvedValue([]),
}));

const { default: AgentsPage } = await import("@/app/agents/page");

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
