import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import type { NextAuthConfig } from "next-auth";
import type { Db } from "@/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import type { EmailSender } from "./email";

export const MAGIC_LINK_MAX_AGE_SECONDS = 15 * 60;

export function createAuthConfig({
  db,
  email,
  secret,
}: {
  db: Db;
  email: EmailSender;
  secret: string;
}): NextAuthConfig {
  return {
    secret,
    trustHost: true,
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    session: { strategy: "database" },
    providers: [
      {
        id: "email",
        type: "email",
        name: "Email",
        maxAge: MAGIC_LINK_MAX_AGE_SECONDS,
        async sendVerificationRequest({ identifier, url, expires }) {
          await email.sendMagicLink({ to: identifier, url, expires });
        },
      },
    ],
    pages: {
      signIn: "/login",
      verifyRequest: "/login/check-email",
      error: "/login",
    },
    callbacks: {
      // The default database session object includes the raw session token,
      // which /api/auth/session would expose to page scripts.
      session({ session, user }) {
        return {
          expires: session.expires,
          user: { id: user.id, email: user.email },
        };
      },
    },
    events: {
      // Completing a magic-link sign-in proves control of the address.
      async signIn({ user }) {
        if (!user.id) return;
        await db
          .update(users)
          .set({ trustLevel: "email_verified" })
          .where(and(eq(users.id, user.id), eq(users.trustLevel, "unverified")));
      },
    },
  };
}
