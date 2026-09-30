import {
  createHash,
  createPublicKey,
  randomBytes,
  verify,
} from "node:crypto";
import { and, count, desc, eq, gt, gte, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import {
  agentKeys,
  agents,
  registrationChallenges,
  users,
  type PublicEd25519Jwk,
  type TrustLevel,
} from "@/db/schema";
import { findPrivateKeyMaterial } from "@/lib/key-material";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const AGENT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class RegistrationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 410,
  ) {
    super(message);
  }
}

function configuredPositiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export type RegistrationLimits = {
  emailVerifiedAgents: number;
  domainVerifiedAgents: number;
  registrationsPerDay: number;
};

export function registrationLimits(): RegistrationLimits {
  return {
    emailVerifiedAgents: configuredPositiveInteger(
      "AGENT_LIMIT_EMAIL_VERIFIED",
      5,
    ),
    domainVerifiedAgents: configuredPositiveInteger(
      "AGENT_LIMIT_DOMAIN_VERIFIED",
      50,
    ),
    registrationsPerDay: configuredPositiveInteger(
      "AGENT_REGISTRATIONS_PER_DAY",
      10,
    ),
  };
}

export function directoryAuthority(accountId: string) {
  const base = (
    process.env.AGENTPROOF_DIRECTORY_DOMAIN || "id.agentproof.dev"
  )
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  return `${accountId}.${base}`;
}

export function publicJwkThumbprint(jwk: PublicEd25519Jwk) {
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
  });
  return createHash("sha256").update(canonical).digest("base64url");
}

export type RegistrationMessageFields = {
  accountId: string;
  directoryAuthority: string;
  issuedAt: number;
  nonce: string;
  purpose: string;
  thumbprint: string;
};

// These exact UTF-8 JSON bytes are the AgentProof registration proof v1.
// Keys stay in lexical order so every implementation can reproduce them.
export function registrationMessage(fields: RegistrationMessageFields) {
  return JSON.stringify({
    account_id: fields.accountId,
    directory_authority: fields.directoryAuthority,
    issued_at: fields.issuedAt,
    nonce: fields.nonce,
    purpose: fields.purpose,
    thumbprint: fields.thumbprint,
    type: "agentproof-registration-v1",
  });
}

export async function createRegistrationChallenge(
  db: Db,
  accountId: string,
  now = new Date(),
) {
  const issuedAt = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const [challenge] = await db
    .insert(registrationChallenges)
    .values({
      accountId,
      nonce: randomBytes(32).toString("base64url"),
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + CHALLENGE_TTL_MS),
    })
    .returning();

  return {
    challengeId: challenge.id,
    nonce: challenge.nonce,
    accountId,
    directoryAuthority: directoryAuthority(accountId),
    issuedAt: Math.floor(challenge.issuedAt.getTime() / 1000),
    expiresAt: challenge.expiresAt,
  };
}

function parsePublicJwk(value: unknown): PublicEd25519Jwk {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RegistrationError("public_jwk must be an Ed25519 JWK.", 400);
  }
  const jwk = value as Record<string, unknown>;
  const keys = Object.keys(jwk).sort();
  if (
    keys.join(",") !== "crv,kty,x" ||
    jwk.kty !== "OKP" ||
    jwk.crv !== "Ed25519" ||
    typeof jwk.x !== "string"
  ) {
    throw new RegistrationError(
      "public_jwk must contain only kty=OKP, crv=Ed25519, and x.",
      400,
    );
  }
  try {
    const decoded = Buffer.from(jwk.x, "base64url");
    if (decoded.length !== 32 || decoded.toString("base64url") !== jwk.x) {
      throw new Error("invalid x");
    }
  } catch {
    throw new RegistrationError(
      "public_jwk.x must be a canonical base64url Ed25519 public key.",
      400,
    );
  }
  return { kty: "OKP", crv: "Ed25519", x: jwk.x };
}

type ParsedRegistration = {
  challengeId: string;
  name: string;
  purpose: string;
  publicJwk: PublicEd25519Jwk;
  signature: string;
};

function parseRegistration(value: unknown): ParsedRegistration {
  if (findPrivateKeyMaterial(value).length > 0) {
    console.warn(
      "Rejected an agent registration request containing private key material.",
    );
    throw new RegistrationError(
      "Private key material must never be sent to AgentProof.",
      400,
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RegistrationError("A JSON registration object is required.", 400);
  }
  const input = value as Record<string, unknown>;
  if (
    typeof input.challenge_id !== "string" ||
    typeof input.name !== "string" ||
    typeof input.purpose !== "string" ||
    typeof input.signature !== "string"
  ) {
    throw new RegistrationError(
      "challenge_id, name, purpose, public_jwk, and signature are required.",
      400,
    );
  }
  if (
    !AGENT_NAME.test(input.name) ||
    input.name.length > 63 ||
    input.name !== input.name.toLowerCase()
  ) {
    throw new RegistrationError(
      "name must be a lowercase slug of up to 63 characters.",
      400,
    );
  }
  if (
    !input.purpose ||
    input.purpose.length > 500 ||
    input.purpose !== input.purpose.trim()
  ) {
    throw new RegistrationError(
      "purpose must be 1–500 characters with no surrounding whitespace.",
      400,
    );
  }
  if (
    !/^[A-Za-z0-9_-]{86}$/.test(input.signature) ||
    Buffer.from(input.signature, "base64url").length !== 64
  ) {
    throw new RegistrationError(
      "signature must be a base64url Ed25519 signature.",
      400,
    );
  }
  return {
    challengeId: input.challenge_id,
    name: input.name,
    purpose: input.purpose,
    publicJwk: parsePublicJwk(input.public_jwk),
    signature: input.signature,
  };
}

function utcDayStart(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function isUniqueViolation(error: unknown) {
  const candidate = error as {
    code?: string;
    cause?: { code?: string };
  };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}

export async function registerAgent(
  db: Db,
  account: { id: string; trustLevel: Exclude<TrustLevel, "unverified"> },
  rawInput: unknown,
  options?: {
    now?: Date;
    limits?: RegistrationLimits;
  },
) {
  const input = parseRegistration(rawInput);
  const now = options?.now ?? new Date();
  const limits = options?.limits ?? registrationLimits();
  const [challenge] = await db
    .select()
    .from(registrationChallenges)
    .where(
      and(
        eq(registrationChallenges.id, input.challengeId),
        eq(registrationChallenges.accountId, account.id),
      ),
    )
    .limit(1);

  if (!challenge) {
    throw new RegistrationError("Registration challenge was not found.", 404);
  }
  if (challenge.usedAt) {
    throw new RegistrationError(
      "Registration challenge has already been used.",
      409,
    );
  }
  if (challenge.expiresAt <= now) {
    throw new RegistrationError("Registration challenge has expired.", 410);
  }

  const thumbprint = publicJwkThumbprint(input.publicJwk);
  const message = registrationMessage({
    accountId: account.id,
    directoryAuthority: directoryAuthority(account.id),
    issuedAt: Math.floor(challenge.issuedAt.getTime() / 1000),
    nonce: challenge.nonce,
    purpose: input.purpose,
    thumbprint,
  });

  let validSignature = false;
  try {
    const publicKey = createPublicKey({
      key: input.publicJwk,
      format: "jwk",
    });
    validSignature = verify(
      null,
      Buffer.from(message, "utf8"),
      publicKey,
      Buffer.from(input.signature, "base64url"),
    );
  } catch {
    validSignature = false;
  }
  if (!validSignature) {
    throw new RegistrationError(
      "Signature does not prove possession of the submitted public key.",
      400,
    );
  }

  try {
    return await db.transaction(async (tx) => {
      // Serialize registrations per account so concurrent requests cannot both
      // observe the same remaining limit.
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, account.id))
        .for("update");

      const [consumed] = await tx
        .update(registrationChallenges)
        .set({ usedAt: now })
        .where(
          and(
            eq(registrationChallenges.id, challenge.id),
            isNull(registrationChallenges.usedAt),
            gt(registrationChallenges.expiresAt, now),
          ),
        )
        .returning({ id: registrationChallenges.id });
      if (!consumed) {
        throw new RegistrationError(
          "Registration challenge is expired or already used.",
          409,
        );
      }

      const [active] = await tx
        .select({ value: count() })
        .from(agents)
        .where(
          and(
            eq(agents.accountId, account.id),
            eq(agents.status, "active"),
          ),
        );
      const [today] = await tx
        .select({ value: count() })
        .from(agents)
        .where(
          and(
            eq(agents.accountId, account.id),
            gte(agents.createdAt, utcDayStart(now)),
          ),
        );
      const agentLimit =
        account.trustLevel === "domain_verified"
          ? limits.domainVerifiedAgents
          : limits.emailVerifiedAgents;
      const status =
        active.value >= agentLimit ||
        today.value >= limits.registrationsPerDay
          ? ("pending_review" as const)
          : ("active" as const);

      const [agent] = await tx
        .insert(agents)
        .values({
          accountId: account.id,
          name: input.name,
          purpose: input.purpose,
          status,
        })
        .returning();
      const [key] = await tx
        .insert(agentKeys)
        .values({
          agentId: agent.id,
          publicJwk: input.publicJwk,
          thumbprint,
        })
        .returning();

      return {
        id: agent.id,
        name: agent.name,
        purpose: agent.purpose,
        status: agent.status,
        createdAt: agent.createdAt,
        key: {
          id: key.id,
          publicJwk: key.publicJwk,
          thumbprint: key.thumbprint,
          status: key.status,
          createdAt: key.createdAt,
        },
      };
    });
  } catch (error) {
    if (error instanceof RegistrationError) throw error;
    if (isUniqueViolation(error)) {
      throw new RegistrationError(
        "That agent name or public-key thumbprint is already registered.",
        409,
      );
    }
    throw error;
  }
}

export function listAgents(db: Db, accountId: string) {
  return db
    .select({
      id: agents.id,
      name: agents.name,
      purpose: agents.purpose,
      status: agents.status,
      createdAt: agents.createdAt,
      lastActiveAt: agents.lastActiveAt,
      keyId: agentKeys.id,
      publicJwk: agentKeys.publicJwk,
      thumbprint: agentKeys.thumbprint,
      keyStatus: agentKeys.status,
    })
    .from(agents)
    .innerJoin(agentKeys, eq(agentKeys.agentId, agents.id))
    .where(eq(agents.accountId, accountId))
    .orderBy(desc(agents.createdAt));
}
