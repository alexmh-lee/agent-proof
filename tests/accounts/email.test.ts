import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { getEmailSender } from "@/lib/email";

const originalEnv = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  VERCEL: process.env.VERCEL,
};

beforeEach(() => {
  send.mockReset();
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "AgentProof <onboarding@resend.dev>";
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("production email sender", () => {
  it("sends a one-time magic link through Resend", async () => {
    send.mockResolvedValue({ data: { id: "email-1" }, error: null });
    const sender = getEmailSender();

    await sender?.sendMagicLink({
      to: "developer@example.com",
      url: "https://agentproof.example/api/auth/callback?token=a&email=b",
      expires: new Date("2026-09-30T12:00:00.000Z"),
    });

    expect(send).toHaveBeenCalledWith({
      from: "AgentProof <onboarding@resend.dev>",
      to: "developer@example.com",
      subject: "Sign in to AgentProof",
      text: expect.stringContaining(
        "https://agentproof.example/api/auth/callback?token=a&email=b",
      ),
      html: expect.stringContaining("token=a&amp;email=b"),
    });
  });

  it("fails closed when Resend rejects a message", async () => {
    send.mockResolvedValue({
      data: null,
      error: { message: "Only the account owner can receive test mail" },
    });

    await expect(
      getEmailSender()?.sendMagicLink({
        to: "other@example.com",
        url: "https://agentproof.example/sign-in",
        expires: new Date("2026-09-30T12:00:00.000Z"),
      }),
    ).rejects.toThrow("Only the account owner can receive test mail");
  });

  it("does not enable deployed auth without email credentials", () => {
    delete process.env.RESEND_API_KEY;
    process.env.VERCEL = "1";

    expect(getEmailSender()).toBeNull();
  });
});
