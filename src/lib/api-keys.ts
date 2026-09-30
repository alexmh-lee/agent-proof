import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { apiKeys, users } from "@/db/schema";

const API_KEY_PREFIX = "ap_";

function hashApiKey(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function createApiKey(
  db: Db,
  accountId: string,
  requestedLabel: string,
) {
  const label = requestedLabel.trim();
  if (!label || label.length > 60) {
    throw new Error("API key label must be between 1 and 60 characters.");
  }

  const rawKey = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const [record] = await db
    .insert(apiKeys)
    .values({
      accountId,
      label,
      keyHash: hashApiKey(rawKey),
      lastFour: rawKey.slice(-4),
    })
    .returning({
      id: apiKeys.id,
      label: apiKeys.label,
      lastFour: apiKeys.lastFour,
      createdAt: apiKeys.createdAt,
    });

  return { rawKey, record };
}

export function listApiKeys(db: Db, accountId: string) {
  return db
    .select({
      id: apiKeys.id,
      label: apiKeys.label,
      lastFour: apiKeys.lastFour,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.accountId, accountId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(
  db: Db,
  accountId: string,
  keyId: string,
) {
  const [revoked] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.accountId, accountId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });
  return Boolean(revoked);
}

export type ApiKeyAuthentication =
  | {
      ok: true;
      keyId: string;
      account: {
        id: string;
        email: string;
        trustLevel: "email_verified" | "domain_verified";
      };
    }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
    };

export async function authenticateApiKey(
  db: Db,
  authorization: string | null,
): Promise<ApiKeyAuthentication> {
  const match = authorization?.match(/^Bearer (ap_[A-Za-z0-9_-]+)$/);
  if (!match) {
    return {
      ok: false,
      status: 401,
      error: "A valid AgentProof bearer API key is required.",
    };
  }

  const [result] = await db
    .select({
      keyId: apiKeys.id,
      accountId: users.id,
      email: users.email,
      trustLevel: users.trustLevel,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.accountId, users.id))
    .where(
      and(
        eq(apiKeys.keyHash, hashApiKey(match[1])),
        isNull(apiKeys.revokedAt),
      ),
    )
    .limit(1);

  if (!result || !result.email) {
    return { ok: false, status: 401, error: "API key is invalid or revoked." };
  }
  if (result.trustLevel === "unverified") {
    return {
      ok: false,
      status: 403,
      error: "The account email must be verified.",
    };
  }

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, result.keyId));

  return {
    ok: true,
    keyId: result.keyId,
    account: {
      id: result.accountId,
      email: result.email,
      trustLevel: result.trustLevel,
    },
  };
}

export const apiKeyInternals = { hashApiKey };
