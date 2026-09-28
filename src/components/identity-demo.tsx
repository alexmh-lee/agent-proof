"use client";

import {
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

type Identity = {
  agentName: string;
  slug: string;
  purpose: string;
  keyId: string;
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  directoryUrl: string;
  createdAt: number;
};

type DemoStatus =
  | "idle"
  | "generating"
  | "ready"
  | "verifying"
  | "verified"
  | "error";

function base64Url(bytes: ArrayBuffer) {
  const binary = Array.from(new Uint8Array(bytes), (byte) =>
    String.fromCharCode(byte),
  ).join("");

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 42) || "my-agent"
  );
}

async function createThumbprint(jwk: JsonWebKey) {
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );

  return base64Url(digest);
}

export function IdentityDemo() {
  const [agentName, setAgentName] = useState("research-scout");
  const [purpose, setPurpose] = useState(
    "Monitors public product and market updates",
  );
  const [status, setStatus] = useState<DemoStatus>("idle");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [signature, setSignature] = useState("");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const keyPairRef = useRef<CryptoKeyPair | null>(null);

  const directory = useMemo(() => {
    if (!identity) return "";

    return JSON.stringify(
      {
        keys: [
          {
            ...identity.publicJwk,
            kid: identity.keyId,
            alg: "EdDSA",
            use: "sig",
          },
        ],
      },
      null,
      2,
    );
  }, [identity]);

  const signatureHeaders = useMemo(() => {
    if (!identity) return "";
    const created = identity.createdAt;

    return [
      `Signature-Agent: sig1="${identity.directoryUrl}"`,
      `Signature-Input: sig1=("@authority" "signature-agent";key="sig1");created=${created};expires=${created + 300};keyid="${identity.keyId}";tag="web-bot-auth"`,
      `Signature: sig1=:${signature || "<generated when tested>"}:`,
    ].join("\n");
  }, [identity, signature]);

  async function generateIdentity() {
    if (!agentName.trim()) return;

    setStatus("generating");
    setError("");
    setSignature("");

    try {
      if (!crypto?.subtle) {
        throw new Error("Web Crypto is not available in this browser.");
      }

      const keyPair = (await crypto.subtle.generateKey(
        { name: "Ed25519" },
        true,
        ["sign", "verify"],
      )) as CryptoKeyPair;
      const [publicJwk, privateJwk] = await Promise.all([
        crypto.subtle.exportKey("jwk", keyPair.publicKey),
        crypto.subtle.exportKey("jwk", keyPair.privateKey),
      ]);
      const keyId = await createThumbprint(publicJwk);
      const slug = slugify(agentName);

      keyPairRef.current = keyPair;
      setIdentity({
        agentName: agentName.trim(),
        slug,
        purpose: purpose.trim(),
        keyId,
        publicJwk,
        privateJwk,
        directoryUrl: `https://id.agentproof.dev/${slug}`,
        createdAt: Math.floor(Date.now() / 1000),
      });
      setStatus("ready");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The identity could not be generated.",
      );
      setStatus("error");
    }
  }

  async function runSelfTest() {
    if (!identity || !keyPairRef.current) return;

    setStatus("verifying");
    setError("");

    try {
      const payload = new TextEncoder().encode(
        [
          `"@authority": example.com`,
          `"signature-agent";key="sig1": "${identity.directoryUrl}"`,
          `"@created": ${Math.floor(Date.now() / 1000)}`,
        ].join("\n"),
      );
      const signed = await crypto.subtle.sign(
        { name: "Ed25519" },
        keyPairRef.current.privateKey,
        payload,
      );
      const valid = await crypto.subtle.verify(
        { name: "Ed25519" },
        keyPairRef.current.publicKey,
        signed,
        payload,
      );

      if (!valid) throw new Error("Signature verification failed.");
      setSignature(base64Url(signed));
      setStatus("verified");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The self-test failed.",
      );
      setStatus("error");
    }
  }

  async function copyValue(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  }

  function downloadBundle() {
    if (!identity) return;

    const bundle = JSON.stringify(
      {
        warning: "Private key material. Do not commit or share this file.",
        agent: {
          name: identity.agentName,
          purpose: identity.purpose,
          directory_url: identity.directoryUrl,
        },
        key_id: identity.keyId,
        public_jwk: identity.publicJwk,
        private_jwk: identity.privateJwk,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([bundle], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${identity.slug}.agentproof.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    keyPairRef.current = null;
    setIdentity(null);
    setSignature("");
    setError("");
    setStatus("idle");
  }

  const busy = status === "generating" || status === "verifying";

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-ink bg-paper-bright shadow-[7px_7px_0_#141512]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink bg-ink px-5 py-3 text-paper sm:px-7">
        <div className="flex items-center gap-2 font-mono text-xs">
          <Terminal size={14} />
          identity-lab / browser session
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-paper/65">
          <span className="live-dot size-2 rounded-full bg-lime" />
          keys stay on this device
        </div>
      </div>

      <div className="grid lg:grid-cols-[0.84fr_1.16fr]">
        <div className="border-b border-ink p-6 sm:p-8 lg:border-r lg:border-b-0">
          <div className="mb-8 flex size-11 items-center justify-center rounded-full border border-ink bg-lime">
            <Fingerprint size={21} strokeWidth={1.8} />
          </div>
          <p className="eyebrow mb-2 text-muted">Identity details</p>
          <h3 className="mb-7 text-2xl font-semibold tracking-[-0.04em]">
            Name the agent.
            <br />
            We&apos;ll make the keys.
          </h3>

          <label className="mb-5 block">
            <span className="mb-2 block text-sm font-medium">Agent name</span>
            <input
              value={agentName}
              onChange={(event) => setAgentName(event.target.value)}
              disabled={busy || Boolean(identity)}
              className="h-12 w-full rounded-xl border border-line bg-paper px-4 font-mono text-sm outline-none transition focus:border-ink focus:ring-2 focus:ring-lime disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="research-scout"
              autoComplete="off"
            />
          </label>

          <label className="mb-7 block">
            <span className="mb-2 block text-sm font-medium">Public purpose</span>
            <input
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              disabled={busy || Boolean(identity)}
              className="h-12 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition focus:border-ink focus:ring-2 focus:ring-lime disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="What does this agent do?"
              autoComplete="off"
            />
          </label>

          {!identity ? (
            <button
              type="button"
              onClick={generateIdentity}
              disabled={busy || !agentName.trim()}
              className="btn-lift flex h-12 items-center justify-center gap-2 rounded-xl border border-ink bg-lime px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "generating" ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <KeyRound size={17} />
              )}
              Generate identity
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadBundle}
                className="btn-lift flex h-11 items-center gap-2 rounded-xl border border-ink bg-lime px-4 text-sm font-semibold"
              >
                <Download size={16} />
                Download keys
              </button>
              <button
                type="button"
                onClick={reset}
                className="flex h-11 items-center gap-2 rounded-xl border border-line bg-paper px-4 text-sm font-medium transition hover:border-ink"
              >
                <RotateCcw size={15} />
                Start over
              </button>
            </div>
          )}

          {error ? (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="min-w-0 bg-paper p-6 sm:p-8">
          {!identity ? (
            <div className="flex min-h-[440px] flex-col items-center justify-center text-center">
              <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-dashed border-ink/30 bg-paper-bright">
                <ShieldCheck size={26} className="text-muted" />
              </div>
              <p className="mb-1 font-medium">Your identity will appear here</p>
              <p className="max-w-sm text-sm leading-6 text-muted">
                AgentProof uses your browser&apos;s Web Crypto API. No private
                key material is transmitted or stored.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-lime-dark" />
                    <span className="eyebrow text-muted">Identity created</span>
                  </div>
                  <h3 className="text-2xl font-semibold tracking-[-0.04em]">
                    {identity.agentName}
                  </h3>
                </div>
                <span className="rounded-full border border-line bg-paper-bright px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-wider">
                  Ed25519
                </span>
              </div>

              <div className="mb-4 rounded-xl border border-line bg-paper-bright">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Hosted directory preview
                  </span>
                  <button
                    type="button"
                    onClick={() => copyValue("directory", directory)}
                    className="text-muted transition hover:text-ink"
                    aria-label="Copy directory"
                  >
                    {copied === "directory" ? (
                      <Check size={15} />
                    ) : (
                      <Copy size={15} />
                    )}
                  </button>
                </div>
                <pre className="max-h-48 overflow-auto p-4 font-mono text-[11px] leading-5 text-ink">
                  {directory}
                </pre>
              </div>

              <div className="mb-5 rounded-xl border border-line bg-ink text-paper">
                <div className="flex items-center justify-between border-b border-white/15 px-4 py-3">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-paper/60">
                    Request headers preview
                  </span>
                  <button
                    type="button"
                    onClick={() => copyValue("headers", signatureHeaders)}
                    className="text-paper/60 transition hover:text-paper"
                    aria-label="Copy request headers"
                  >
                    {copied === "headers" ? (
                      <Check size={15} />
                    ) : (
                      <Copy size={15} />
                    )}
                  </button>
                </div>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-[11px] leading-5 text-paper/80">
                  {signatureHeaders}
                </pre>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={runSelfTest}
                  disabled={busy}
                  className="btn-lift flex h-11 items-center gap-2 rounded-xl border border-ink bg-violet px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {status === "verifying" ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : status === "verified" ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  {status === "verified"
                    ? "Signature verified"
                    : "Run sign + verify test"}
                </button>
                <span className="flex items-center gap-1 text-xs text-muted">
                  RFC 9421 foundation
                  <ChevronRight size={13} />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
