import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import { connection } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { users } from "@/db/schema";
import { createAuthConfig } from "@/lib/auth-config";
import { getEmailSender } from "@/lib/email";

export function authConfigured(): boolean {
  return Boolean(
    process.env.AUTH_SECRET && isDatabaseConfigured() && getEmailSender(),
  );
}

const nextAuth = NextAuth(async () =>
  createAuthConfig({
    db: await getDb(),
    email: getEmailSender()!,
    secret: process.env.AUTH_SECRET!,
  }),
);

export const { handlers, signIn, signOut } = nextAuth;

export type CurrentUser = Pick<
  typeof users.$inferSelect,
  "id" | "email" | "trustLevel" | "domain" | "domainToken" | "domainVerifiedAt"
>;

export async function getCurrentUser(): Promise<CurrentUser | null> {
  await connection();
  if (!authConfigured()) return null;
  const session = await nextAuth.auth();
  const id = session?.user?.id;
  if (!id) return null;

  const db = await getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      trustLevel: users.trustLevel,
      domain: users.domain,
      domainToken: users.domainToken,
      domainVerifiedAt: users.domainVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, id));
  return user ?? null;
}
