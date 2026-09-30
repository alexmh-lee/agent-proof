import type { AdapterAccountType } from "next-auth/adapters";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const TRUST_LEVELS = [
  "unverified",
  "email_verified",
  "domain_verified",
] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const trustLevel = pgEnum("trust_level", TRUST_LEVELS);

// The first seven columns are the shape @auth/drizzle-adapter expects.
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  trustLevel: trustLevel("trust_level").notNull().default("unverified"),
  domain: text("domain"),
  domainToken: text("domain_token"),
  domainVerifiedAt: timestamp("domain_verified_at", { mode: "date" }),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// Auth.js stores SHA-256(token + AUTH_SECRET) here, never the raw token.
export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const AGENT_STATUSES = [
  "active",
  "pending_review",
  "revoked",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export const agentStatus = pgEnum("agent_status", AGENT_STATUSES);

export const AGENT_KEY_STATUSES = ["active", "retiring", "revoked"] as const;
export type AgentKeyStatus = (typeof AGENT_KEY_STATUSES)[number];
export const agentKeyStatus = pgEnum("agent_key_status", AGENT_KEY_STATUSES);

export type PublicEd25519Jwk = {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
};

export const apiKeys = pgTable(
  "api_key",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    keyHash: text("key_hash").notNull(),
    lastFour: text("last_four").notNull(),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
  },
  (key) => [
    uniqueIndex("api_key_hash_unique").on(key.keyHash),
    index("api_key_account_idx").on(key.accountId),
  ],
);

export const agents = pgTable(
  "agent",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    purpose: text("purpose").notNull(),
    status: agentStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    lastActiveAt: timestamp("last_active_at", { mode: "date" }),
  },
  (agent) => [
    uniqueIndex("agent_account_name_unique").on(agent.accountId, agent.name),
    index("agent_account_status_idx").on(agent.accountId, agent.status),
    index("agent_account_created_idx").on(agent.accountId, agent.createdAt),
  ],
);

export const agentKeys = pgTable(
  "agent_key",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    publicJwk: jsonb("public_jwk").$type<PublicEd25519Jwk>().notNull(),
    thumbprint: text("thumbprint").notNull(),
    status: agentKeyStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    notAfter: timestamp("not_after", { mode: "date" }),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
  },
  (key) => [
    uniqueIndex("agent_key_thumbprint_unique").on(key.thumbprint),
    index("agent_key_agent_idx").on(key.agentId),
  ],
);

export const registrationChallenges = pgTable(
  "registration_challenge",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nonce: text("nonce").notNull(),
    issuedAt: timestamp("issued_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { mode: "date" }),
  },
  (challenge) => [
    uniqueIndex("registration_challenge_nonce_unique").on(challenge.nonce),
    index("registration_challenge_account_idx").on(challenge.accountId),
  ],
);
