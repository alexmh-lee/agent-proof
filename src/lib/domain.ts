import { randomBytes } from "node:crypto";
import { resolveTxt as dnsResolveTxt } from "node:dns/promises";
import { domainToASCII } from "node:url";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { users } from "@/db/schema";

export type ResolveTxt = (hostname: string) => Promise<string[][]>;

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function normalizeDomain(input: string): string | null {
  const ascii = domainToASCII(input.trim().toLowerCase().replace(/\.$/, ""));
  if (!ascii || ascii.length > 253) return null;
  const labels = ascii.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  if (/^\d+$/.test(labels[labels.length - 1])) return null;
  return ascii;
}

export function txtRecordName(domain: string) {
  return `_agentproof.${domain}`;
}

export function txtRecordValue(token: string) {
  return `agentproof-verify=${token}`;
}

export async function startDomainVerification(
  db: Db,
  userId: string,
  input: string,
): Promise<{ domain: string; token: string } | { error: string }> {
  const domain = normalizeDomain(input);
  if (!domain) return { error: "Enter a domain name such as example.com." };
  const token = randomBytes(24).toString("base64url");
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  await db
    .update(users)
    .set({
      domain,
      domainToken: token,
      domainVerifiedAt: null,
      ...(user?.trustLevel === "domain_verified"
        ? { trustLevel: "email_verified" as const }
        : {}),
    })
    .where(eq(users.id, userId));
  return { domain, token };
}

export async function checkDomainVerification(
  db: Db,
  userId: string,
  resolveTxt: ResolveTxt = dnsResolveTxt,
): Promise<{ verified: boolean; error?: string }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user?.domain || !user.domainToken) {
    return { verified: false, error: "Add a domain first." };
  }
  if (user.trustLevel === "unverified") {
    return { verified: false, error: "Verify your email first." };
  }

  let records: string[][];
  try {
    records = await resolveTxt(txtRecordName(user.domain));
  } catch {
    records = [];
  }
  const expected = txtRecordValue(user.domainToken);
  if (!records.some((chunks) => chunks.join("").trim() === expected)) {
    return {
      verified: false,
      error: `No TXT record ${txtRecordName(user.domain)} with value ${expected} was found. DNS changes can take a few minutes.`,
    };
  }

  await db
    .update(users)
    .set({ domainVerifiedAt: new Date(), trustLevel: "domain_verified" })
    .where(eq(users.id, userId));
  return { verified: true };
}
