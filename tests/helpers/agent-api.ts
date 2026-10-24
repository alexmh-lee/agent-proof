import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import type { Db } from "@/db";
import { users, type TrustLevel } from "@/db/schema";
import { createApiKey } from "@/lib/api-keys";
import {
  publicJwkThumbprint,
  registrationMessage,
} from "@/lib/agent-registration";

// The agents route's inferred return type includes undefined, although every
// path returns a Response.
export type RouteHandler = (request: Request) => Promise<Response>;

export async function accountWithApiKey(db: Db, trustLevel: TrustLevel) {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `${id}@example.com`,
    emailVerified: trustLevel === "unverified" ? null : new Date(),
    trustLevel,
  });
  const { rawKey } = await createApiKey(db, id, "Route test");
  return { id, authorization: `Bearer ${rawKey}` };
}

export function apiRequest(
  path: string,
  init: { method?: string; authorization?: string; body?: unknown } = {},
) {
  const headers = new Headers();
  if (init.authorization) headers.set("authorization", init.authorization);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost${path}`, {
    method: init.method ?? "POST",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export type ChallengeResponse = {
  challenge_id: string;
  nonce: string;
  account_id: string;
  directory_authority: string;
  issued_at: number;
};

// Signs the registration proof locally, as the developer's CLI or SDK would.
export function signedRegistrationBody(
  challenge: ChallengeResponse,
  name: string,
  purpose: string,
  privateKey: KeyObject = generateKeyPairSync("ed25519").privateKey,
) {
  const exported = privateKey.export({ format: "jwk" });
  const publicJwk = {
    kty: "OKP" as const,
    crv: "Ed25519" as const,
    x: exported.x!,
  };
  const message = registrationMessage({
    accountId: challenge.account_id,
    directoryAuthority: challenge.directory_authority,
    issuedAt: challenge.issued_at,
    nonce: challenge.nonce,
    purpose,
    thumbprint: publicJwkThumbprint(publicJwk),
  });
  return {
    challenge_id: challenge.challenge_id,
    name,
    purpose,
    public_jwk: publicJwk,
    signature: sign(null, Buffer.from(message), privateKey).toString(
      "base64url",
    ),
  };
}
