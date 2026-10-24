import {
  createHash,
  createPublicKey,
  verify,
} from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import {
  agentKeys,
  agents,
  directoryAttestations,
  type PublicEd25519Jwk,
} from "@/db/schema";
import {
  directoryBaseDomain,
  effectiveKeyStatus,
} from "@/lib/agent-registration";
import { findPrivateKeyMaterial } from "@/lib/key-material";

export const DIRECTORY_CONTENT_TYPE =
  "application/http-message-signatures-directory+json";
export const DIRECTORY_CACHE_CONTROL = "public, max-age=300, s-maxage=300";
export const DIRECTORY_SIGNATURE_TAG = "http-message-signatures-directory";

export class DirectoryError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

export type DirectoryKey = {
  keyId: string;
  thumbprint: string;
  publicJwk: PublicEd25519Jwk;
  agentName: string;
  purpose: string;
  status: "active" | "retiring";
  notAfter: Date | null;
};

/** RFC 9421 @authority from a Host header: lowercase, default ports removed. */
export function authorityFromHost(hostHeader: string) {
  const host = hostHeader.trim().toLowerCase();
  if (!host) return null;
  if (host.endsWith(":443") || host.endsWith(":80")) {
    return host.replace(/:(443|80)$/, "");
  }
  return host;
}

/** Account id from <accountId>.<directoryBaseDomain>[:port]. */
export function accountIdFromHost(hostHeader: string) {
  const authority = authorityFromHost(hostHeader);
  if (!authority) return null;
  const hostname = authority.includes(":")
    ? authority.slice(0, authority.lastIndexOf(":"))
    : authority;
  const base = directoryBaseDomain();
  const suffix = `.${base}`;
  if (!hostname.endsWith(suffix)) return null;
  const accountId = hostname.slice(0, -suffix.length);
  if (!accountId || accountId.includes(".")) return null;
  return accountId;
}

export function contentDigestSha256(body: string) {
  const digest = createHash("sha256").update(body, "utf8").digest("base64");
  return `sha-256=:${digest}:`;
}

export function serializeDirectoryBody(keys: DirectoryKey[]) {
  const sorted = [...keys].sort((a, b) =>
    a.thumbprint.localeCompare(b.thumbprint),
  );
  // Member order matches draft App. E.2.3. No whitespace; omit alg.
  const payload = {
    keys: sorted.map((key) => ({
      kty: "OKP" as const,
      crv: "Ed25519" as const,
      kid: key.thumbprint,
      x: key.publicJwk.x,
      use: "sig" as const,
    })),
  };
  return JSON.stringify(payload);
}

export async function listPublishedKeys(
  db: Db,
  accountId: string,
  now = new Date(),
): Promise<DirectoryKey[]> {
  const rows = await db
    .select({
      keyId: agentKeys.id,
      thumbprint: agentKeys.thumbprint,
      publicJwk: agentKeys.publicJwk,
      keyStatus: agentKeys.status,
      notAfter: agentKeys.notAfter,
      agentName: agents.name,
      purpose: agents.purpose,
      agentStatus: agents.status,
    })
    .from(agentKeys)
    .innerJoin(agents, eq(agentKeys.agentId, agents.id))
    .where(eq(agents.accountId, accountId))
    .orderBy(asc(agentKeys.thumbprint));

  return rows.flatMap((row) => {
    if (row.notAfter && row.notAfter <= now) return [];
    const status = effectiveKeyStatus(row.agentStatus, row.keyStatus);
    if (status !== "active" && status !== "retiring") return [];
    return [
      {
        keyId: row.keyId,
        thumbprint: row.thumbprint,
        publicJwk: row.publicJwk,
        agentName: row.agentName,
        purpose: row.purpose,
        status,
        notAfter: row.notAfter,
      },
    ];
  });
}

export async function lookupPublishedKeyMetadata(
  db: Db,
  accountId: string,
  thumbprint: string,
  now = new Date(),
) {
  const keys = await listPublishedKeys(db, accountId, now);
  const match = keys.find((key) => key.thumbprint === thumbprint);
  if (!match) return null;
  return {
    thumbprint: match.thumbprint,
    name: match.agentName,
    purpose: match.purpose,
    status: match.status,
  };
}

type StoredAttestation = {
  label: string;
  authority: string;
  contentDigest: string;
  signatureInput: string;
  signature: string;
  created: number;
  expires: number;
};

function parseAttestationParams(signatureInput: string) {
  const match = signatureInput.match(
    /^\("@authority";req "content-digest"\);created=(\d+);expires=(\d+);keyid="([^"]+)";tag="([^"]+)"$/,
  );
  if (!match) {
    throw new DirectoryError(
      "signature_input must cover @authority;req and content-digest with created, expires, keyid, and tag.",
      400,
    );
  }
  const created = Number(match[1]);
  const expires = Number(match[2]);
  const keyid = match[3];
  const tag = match[4];
  if (tag !== DIRECTORY_SIGNATURE_TAG) {
    throw new DirectoryError(
      `tag must be "${DIRECTORY_SIGNATURE_TAG}".`,
      400,
    );
  }
  if (!Number.isSafeInteger(created) || !Number.isSafeInteger(expires)) {
    throw new DirectoryError("created and expires must be Unix seconds.", 400);
  }
  if (expires <= created) {
    throw new DirectoryError("expires must be after created.", 400);
  }
  return { created, expires, keyid };
}

function decodeSignatureBytes(value: string) {
  const trimmed = value.trim();
  const sfBinary = trimmed.match(/^:([A-Za-z0-9+/]+=*):$/);
  const raw = sfBinary ? sfBinary[1] : trimmed;
  try {
    const asStd = Buffer.from(raw, "base64");
    if (asStd.length === 64) return asStd;
    const asUrl = Buffer.from(raw, "base64url");
    if (asUrl.length === 64) return asUrl;
  } catch {
    // fall through
  }
  throw new DirectoryError(
    "signature must be a 64-byte Ed25519 signature (base64 or base64url).",
    400,
  );
}

function directorySignatureBase(
  authority: string,
  contentDigest: string,
  signatureInput: string,
) {
  return [
    `"@authority";req: ${authority}`,
    `"content-digest": ${contentDigest}`,
    `"@signature-params": ${signatureInput}`,
  ].join("\n");
}

export function verifyDirectoryAttestation(options: {
  authority: string;
  body: string;
  publicJwk: PublicEd25519Jwk;
  thumbprint: string;
  signatureInput: string;
  signature: string;
  now?: Date;
}) {
  const nowSec = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const params = parseAttestationParams(options.signatureInput);
  if (params.keyid !== options.thumbprint) {
    throw new DirectoryError(
      "signature_input keyid must equal the key thumbprint.",
      400,
    );
  }
  // 60 s skew matches STANDARDS_NOTES §11.7.
  if (params.created > nowSec + 60) {
    throw new DirectoryError("Attestation created time is in the future.", 400);
  }
  if (params.expires <= nowSec) {
    throw new DirectoryError("Attestation has expired.", 400);
  }
  const contentDigest = contentDigestSha256(options.body);
  const base = directorySignatureBase(
    options.authority,
    contentDigest,
    options.signatureInput,
  );
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(base, "ascii"),
      createPublicKey({ key: options.publicJwk, format: "jwk" }),
      decodeSignatureBytes(options.signature),
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new DirectoryError(
      "Attestation signature does not verify for the current directory body.",
      400,
    );
  }
  return {
    contentDigest,
    created: params.created,
    expires: params.expires,
    signature: decodeSignatureBytes(options.signature).toString("base64"),
  };
}

export async function storeDirectoryAttestation(
  db: Db,
  options: {
    accountId: string;
    agentId: string;
    keyId: string;
    authority: string;
    signatureInput: string;
    signature: string;
    label?: string;
    now?: Date;
  },
) {
  if (findPrivateKeyMaterial(options).length > 0) {
    console.warn(
      "Rejected a directory attestation request containing private key material.",
    );
    throw new DirectoryError(
      "Private key material must never be sent to AgentProof.",
      400,
    );
  }

  const authority = options.authority.trim().toLowerCase();
  if (!authority || /\s/.test(authority)) {
    throw new DirectoryError("authority must be a Host/@authority value.", 400);
  }

  const [row] = await db
    .select({
      keyId: agentKeys.id,
      thumbprint: agentKeys.thumbprint,
      publicJwk: agentKeys.publicJwk,
      keyStatus: agentKeys.status,
      notAfter: agentKeys.notAfter,
      agentStatus: agents.status,
      agentAccountId: agents.accountId,
    })
    .from(agentKeys)
    .innerJoin(agents, eq(agentKeys.agentId, agents.id))
    .where(
      and(
        eq(agentKeys.id, options.keyId),
        eq(agents.id, options.agentId),
        eq(agents.accountId, options.accountId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new DirectoryError("Agent key was not found.", 404);
  }

  const now = options.now ?? new Date();
  if (row.notAfter && row.notAfter <= now) {
    throw new DirectoryError("That key has expired and cannot attest.", 400);
  }
  const status = effectiveKeyStatus(row.agentStatus, row.keyStatus);
  if (status !== "active" && status !== "retiring") {
    throw new DirectoryError(
      "Only published keys can upload directory attestations.",
      400,
    );
  }

  const published = await listPublishedKeys(db, options.accountId, now);
  const body = serializeDirectoryBody(published);
  const verified = verifyDirectoryAttestation({
    authority,
    body,
    publicJwk: row.publicJwk,
    thumbprint: row.thumbprint,
    signatureInput: options.signatureInput.trim(),
    signature: options.signature,
    now,
  });

  // Structured Field keys are lowercase (RFC 9651). Thumbprints are mixed-case
  // base64url, so derive a stable lowercase label unless the client sends one.
  const label = (
    options.label?.trim() ||
    `k${createHash("sha256").update(row.thumbprint, "utf8").digest("hex").slice(0, 24)}`
  ).toLowerCase();
  if (!/^[a-z0-9*][a-z0-9_.*-]{0,127}$/.test(label)) {
    throw new DirectoryError("label must be a structured-field key token.", 400);
  }

  const [saved] = await db
    .insert(directoryAttestations)
    .values({
      agentKeyId: row.keyId,
      label,
      authority,
      contentDigest: verified.contentDigest,
      signatureInput: options.signatureInput.trim(),
      signature: verified.signature,
      created: verified.created,
      expires: verified.expires,
      uploadedAt: now,
    })
    .onConflictDoUpdate({
      target: directoryAttestations.agentKeyId,
      set: {
        label,
        authority,
        contentDigest: verified.contentDigest,
        signatureInput: options.signatureInput.trim(),
        signature: verified.signature,
        created: verified.created,
        expires: verified.expires,
        uploadedAt: now,
      },
    })
    .returning();

  return {
    keyId: row.keyId,
    thumbprint: row.thumbprint,
    label: saved.label,
    authority: saved.authority,
    contentDigest: saved.contentDigest,
    created: saved.created,
    expires: saved.expires,
  };
}

export async function loadValidAttestations(
  db: Db,
  keys: DirectoryKey[],
  authority: string,
  contentDigest: string,
  now = new Date(),
): Promise<StoredAttestation[]> {
  if (keys.length === 0) return [];
  const nowSec = Math.floor(now.getTime() / 1000);
  const keyIds = keys.map((key) => key.keyId);
  const rows = await db
    .select()
    .from(directoryAttestations)
    .where(
      and(
        inArray(directoryAttestations.agentKeyId, keyIds),
        eq(directoryAttestations.authority, authority),
        eq(directoryAttestations.contentDigest, contentDigest),
      ),
    );

  const byKey = new Map(keys.map((key) => [key.keyId, key]));
  return rows.flatMap((row) => {
    const key = byKey.get(row.agentKeyId);
    if (!key) return [];
    if (row.expires <= nowSec) return [];
    if (row.created > nowSec + 60) return [];
    return [
      {
        label: row.label,
        authority: row.authority,
        contentDigest: row.contentDigest,
        signatureInput: row.signatureInput,
        signature: row.signature,
        created: row.created,
        expires: row.expires,
      },
    ];
  });
}

export function directoryResponseHeaders(options: {
  body: string;
  attestations: StoredAttestation[];
}) {
  const contentDigest = contentDigestSha256(options.body);
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": DIRECTORY_CACHE_CONTROL,
    "Content-Type": DIRECTORY_CONTENT_TYPE,
    "Content-Digest": contentDigest,
  });

  if (options.attestations.length === 0) return headers;

  const signatureInput = options.attestations
    .map((item) => `${item.label}=${item.signatureInput}`)
    .join(", ");
  const signature = options.attestations
    .map((item) => `${item.label}=:${item.signature}:`)
    .join(", ");
  headers.set("Signature-Input", signatureInput);
  headers.set("Signature", signature);
  return headers;
}

export async function buildDirectoryResponse(
  db: Db,
  hostHeader: string,
  now = new Date(),
) {
  const accountId = accountIdFromHost(hostHeader);
  if (!accountId) return null;
  const authority = authorityFromHost(hostHeader);
  if (!authority) return null;

  const keys = await listPublishedKeys(db, accountId, now);
  const body = serializeDirectoryBody(keys);
  const contentDigest = contentDigestSha256(body);
  const attestations = await loadValidAttestations(
    db,
    keys,
    authority,
    contentDigest,
    now,
  );
  return {
    accountId,
    authority,
    body,
    headers: directoryResponseHeaders({ body, attestations }),
    attestations,
    keys,
  };
}
