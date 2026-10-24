import {
  createHash,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import {
  contentDigestSha256,
  DIRECTORY_SIGNATURE_TAG,
} from "@/lib/directory";

/** Builds and signs a directory attestation the way the CLI/SDK will. */
export function signDirectoryAttestation(options: {
  authority: string;
  body: string;
  thumbprint: string;
  privateKey: KeyObject;
  created: number;
  expires: number;
  label?: string;
}) {
  const contentDigest = contentDigestSha256(options.body);
  const signatureInput =
    `("@authority";req "content-digest");created=${options.created};expires=${options.expires};keyid="${options.thumbprint}";tag="${DIRECTORY_SIGNATURE_TAG}"`;
  const signatureBase = [
    `"@authority";req: ${options.authority}`,
    `"content-digest": ${contentDigest}`,
    `"@signature-params": ${signatureInput}`,
  ].join("\n");
  const signature = sign(
    null,
    Buffer.from(signatureBase, "ascii"),
    options.privateKey,
  ).toString("base64");
  const label =
    options.label ??
    `k${createHash("sha256").update(options.thumbprint, "utf8").digest("hex").slice(0, 24)}`;

  return {
    label,
    authority: options.authority,
    contentDigest,
    signature_input: signatureInput,
    signature,
    signatureBase,
  };
}

/** Independent check that directory response signatures verify (no AgentProof libs beyond digest format). */
export function verifyDirectoryResponseSignatures(options: {
  authority: string;
  body: string;
  contentDigestHeader: string | null;
  signatureInputHeader: string | null;
  signatureHeader: string | null;
  publicKeysByThumbprint: Map<string, { kty: "OKP"; crv: "Ed25519"; x: string }>;
  nowSec?: number;
}) {
  if (!options.contentDigestHeader) {
    return { ok: false as const, reason: "missing Content-Digest" };
  }
  const expectedDigest = contentDigestSha256(options.body);
  if (options.contentDigestHeader !== expectedDigest) {
    return { ok: false as const, reason: "Content-Digest mismatch" };
  }
  if (!options.signatureInputHeader || !options.signatureHeader) {
    return { ok: false as const, reason: "missing Signature headers" };
  }

  const inputMembers = options.signatureInputHeader.split(", ").map((part) => {
    const eq = part.indexOf("=");
    return { label: part.slice(0, eq), value: part.slice(eq + 1) };
  });
  const sigMembers = options.signatureHeader.split(", ").map((part) => {
    const eq = part.indexOf("=");
    return { label: part.slice(0, eq), value: part.slice(eq + 1) };
  });
  if (inputMembers.length === 0 || inputMembers.length !== sigMembers.length) {
    return { ok: false as const, reason: "label count mismatch" };
  }

  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
  for (const input of inputMembers) {
    const sig = sigMembers.find((member) => member.label === input.label);
    if (!sig) {
      return { ok: false as const, reason: `missing signature for ${input.label}` };
    }
    const params = input.value.match(
      /^\("@authority";req "content-digest"\);created=(\d+);expires=(\d+);keyid="([^"]+)";tag="http-message-signatures-directory"$/,
    );
    if (!params) {
      return { ok: false as const, reason: `bad Signature-Input for ${input.label}` };
    }
    const created = Number(params[1]);
    const expires = Number(params[2]);
    const keyid = params[3];
    if (expires <= nowSec || created > nowSec + 60) {
      return { ok: false as const, reason: `attestation for ${input.label} outside validity window` };
    }
    const jwk = options.publicKeysByThumbprint.get(keyid);
    if (!jwk) {
      return { ok: false as const, reason: `unknown keyid ${keyid}` };
    }
    const binary = sig.value.match(/^:([A-Za-z0-9+/]+=*):$/);
    if (!binary) {
      return { ok: false as const, reason: `bad Signature encoding for ${input.label}` };
    }
    const base = [
      `"@authority";req: ${options.authority}`,
      `"content-digest": ${expectedDigest}`,
      `"@signature-params": ${input.value}`,
    ].join("\n");
    const valid = verify(
      null,
      Buffer.from(base, "ascii"),
      createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(binary[1], "base64"),
    );
    if (!valid) {
      return { ok: false as const, reason: `signature verify failed for ${input.label}` };
    }
  }
  return { ok: true as const };
}
