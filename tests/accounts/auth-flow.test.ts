import { Auth } from "@auth/core";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { sessions, users, verificationTokens } from "@/db/schema";
import { createAuthConfig } from "@/lib/auth-config";

const ORIGIN = "http://localhost:3000";
const EMAIL = "dev@example.com";

let db: Db;
let sentLinks: string[];
let cookies: Map<string, string>;

function handle(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set(
    "cookie",
    [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
  );
  const config = createAuthConfig({
    db,
    secret: "test-secret",
    email: {
      async sendMagicLink({ url }) {
        sentLinks.push(url);
      },
    },
  });
  return Auth(new Request(new URL(path, ORIGIN), { ...init, headers }), {
    ...config,
    basePath: "/api/auth",
  }).then((response) => {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const [name, value] = pair.split("=");
      if (value) cookies.set(name, value);
      else cookies.delete(name);
    }
    return response;
  });
}

async function postForm(path: string, fields: Record<string, string>) {
  const { csrfToken } = await (await handle("/api/auth/csrf")).json();
  return handle(path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...fields, csrfToken }),
  });
}

async function requestMagicLink() {
  const response = await postForm("/api/auth/signin/email", {
    email: EMAIL,
    callbackUrl: `${ORIGIN}/account`,
  });
  expect(response.headers.get("location")).toContain("/verify-request");
  return sentLinks.at(-1)!;
}

async function currentSessionEmail() {
  const session = await (await handle("/api/auth/session")).json();
  return session?.user?.email ?? null;
}

beforeEach(async () => {
  db = await createDb();
  sentLinks = [];
  cookies = new Map();
});

describe("magic-link accounts", () => {
  it("signs up, verifies the email, logs out, and logs back in", async () => {
    const link = await requestMagicLink();
    expect(await db.select().from(users)).toEqual([]);

    const callback = await handle(link);
    expect(callback.headers.get("location")).toBe(`${ORIGIN}/account`);
    expect(await currentSessionEmail()).toBe(EMAIL);
    const session = await (await handle("/api/auth/session")).json();
    expect(session).toEqual({
      expires: expect.any(String),
      user: { id: expect.any(String), email: EMAIL },
    });

    const [user] = await db.select().from(users);
    expect(user.email).toBe(EMAIL);
    expect(user.emailVerified).toBeInstanceOf(Date);
    expect(user.trustLevel).toBe("email_verified");

    await postForm("/api/auth/signout", {});
    expect(await currentSessionEmail()).toBeNull();
    expect(await db.select().from(sessions)).toEqual([]);

    await handle(await requestMagicLink());
    expect(await currentSessionEmail()).toBe(EMAIL);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("stores only a hash of the magic-link token", async () => {
    const link = await requestMagicLink();
    const token = new URL(link).searchParams.get("token")!;
    const [stored] = await db.select().from(verificationTokens);
    expect(stored.token).not.toBe(token);
    expect(stored.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a link that has already been used", async () => {
    const link = await requestMagicLink();
    await handle(link);
    cookies.clear();

    const reuse = await handle(link);
    expect(reuse.headers.get("location")).toContain("/login?error=Verification");
    expect(await currentSessionEmail()).toBeNull();
  });

  it("rejects an expired link and consumes it", async () => {
    const link = await requestMagicLink();
    await db
      .update(verificationTokens)
      .set({ expires: new Date(Date.now() - 1000) })
      .where(eq(verificationTokens.identifier, EMAIL));

    const response = await handle(link);
    expect(response.headers.get("location")).toContain(
      "/login?error=Verification",
    );
    expect(await currentSessionEmail()).toBeNull();
    expect(await db.select().from(users)).toEqual([]);
    expect(await db.select().from(verificationTokens)).toEqual([]);
  });

  it("sets link expiry to 15 minutes", async () => {
    const before = Date.now();
    await requestMagicLink();
    const [stored] = await db.select().from(verificationTokens);
    const ttl = stored.expires.getTime() - before;
    expect(ttl).toBeGreaterThan(14 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });
});
