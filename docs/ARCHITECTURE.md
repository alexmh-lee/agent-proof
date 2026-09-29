# AgentProof Architecture

Status: Phase 0 audit (2026-09-29). This document describes the codebase as it
is today, marks what is placeholder or demo code, and states the key custody
rule every later phase must follow. The protocol details live in
[`STANDARDS_NOTES.md`](./STANDARDS_NOTES.md).

## Key custody rule

This rule applies to every phase. Any code that breaks it is a bug.

- Private keys are generated on the developer's machine (by our CLI, our SDK,
  or in the browser with WebCrypto). They are never sent to AgentProof servers.
- The server stores public keys only: a JWK with `kty: "OKP"`,
  `crv: "Ed25519"`, and `x`. Any API payload that contains a `d` field, a PEM
  private key, or anything else that looks like private key material is
  rejected with a 400 error. Log a warning that this happened, but never log
  the payload itself.
- Never log request bodies on endpoints that handle keys.
- Registration requires proof of possession. The server issues a one-time
  challenge, the developer signs it locally with the private key, and the
  server checks the signature against the submitted public key before storing
  anything.
- Anything that requires the private key, including directory signatures
  (Phase 3), happens in the CLI or SDK on the developer's side. The server only
  verifies and stores the results.
- An automated test fails if any database table or API response contains a
  field that could hold private key material.

"Private key material" means, at minimum: the JWK members `d`, `p`, `q`, `dp`,
`dq`, `qi`, `oth`, and `k` (RFC 7518 §6, RFC 8037 §2), and any string containing
a `-----BEGIN ... PRIVATE KEY-----` PEM header. The check lives in
`tests/helpers/private-key-material.ts`. `tests/key-custody/` runs it against
every API response that returns key data, and each phase adds its new
endpoints and tables there.

Design consequence: because signing happens on the developer's side,
AgentProof cannot see requests an agent sends to third-party websites. Audit
logs and anomaly detection can only use what we observe: registrations, key
changes, directory fetches, test-endpoint verifications, and opt-in SDK
telemetry.

## Stack

| Concern | Choice (version in `package.json`) |
| --- | --- |
| Framework | Next.js 16.3.6, App Router, Turbopack builds |
| UI | React 19.2.8, Tailwind CSS 4 (`@tailwindcss/postcss`), `lucide-react` icons |
| Fonts | Geist and Geist Mono via `next/font/google` |
| Language | TypeScript 5, `strict: true`, path alias `@/*` → `src/*` |
| Lint | ESLint 9 flat config: `eslint-config-next` core-web-vitals + typescript |
| Tests | Vitest 4 (Node environment), added in Phase 0 |
| Runtime deps | `next`, `react`, `react-dom`, `lucide-react` only. No database, auth, or external services. |

Next.js 16 differs from older versions in places. Before writing framework
code, read the matching guide in `node_modules/next/dist/docs/` (see
`AGENTS.md`). Two things that matter here:

- Route types (`LayoutProps`, `PageProps`, `RouteContext`) are generated into
  `.next/types`. `npm run typecheck` runs `next typegen` first so type checking
  works on a clean checkout.
- `GET` route handlers are dynamic by default (the directory route shows as
  `ƒ` in `next build` output).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | `next dev` |
| `npm run build` | `next build` |
| `npm run lint` | `eslint` |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run test` | `vitest run` |
| `npm run test:watch` | `vitest` (watch mode) |
| `npm run check` | lint, then typecheck, then tests. Must pass before a phase is reported done. |

## Routes

| Route | File | Type | What it does |
| --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | Static (prerendered) | Marketing landing page. Server Component that embeds the client-side `IdentityDemo` lab at `#lab`. |
| `/.well-known/http-message-signatures-directory` | `src/app/.well-known/http-message-signatures-directory/route.ts` | Dynamic `GET` handler | **Hardcoded demo directory** (see below). |
| `/_not-found` | Next.js built-in | Static | Default 404. |
| `/favicon.ico` | `src/app/favicon.ico` | Static asset | |

`src/app/layout.tsx` sets metadata with `metadataBase: https://agentproof.dev`.
`src/app/globals.css` holds the Tailwind theme tokens (`ink`, `paper`, `lime`,
`violet`, `orange`) and the marquee and noise effects. `public/` contains only
the unused default Next.js SVGs (`file.svg`, `globe.svg`, `next.svg`,
`vercel.svg`, `window.svg`).

There are no API routes, no middleware or proxy file, no server actions, no
database, no authentication, and no environment variables.

## Deployment

- Hosted on Vercel through the GitHub integration on
  `alexmh-lee/agent-proof`. `vercel[bot]` creates a Production deployment for
  every push to `main` and a Preview deployment for other branches.
- Live URL: <https://agent-proof-app.vercel.app>. The layout metadata
  references `agentproof.dev`, but this repo has no evidence that domain is
  attached to the Vercel project.
- No `vercel.json`, no custom `next.config.ts` options, no cron jobs, no
  environment variables. `.vercel/` is gitignored, and the Vercel CLI is not
  installed on the audit machine.
- Vercel serves the directory with `cache-control: public, max-age=300`
  (Vercel strips `s-maxage` from the client-facing header).

## Placeholder and demo code

Everything below is either marketing copy for features that don't exist yet
or demo code that must not be mistaken for a working implementation.

### 1. Hardcoded directory stub (replace in Phase 3)

`src/app/.well-known/http-message-signatures-directory/route.ts` returns a
constant JWKS with one Ed25519 public key:

```json
{"keys":[{"kty":"OKP","crv":"Ed25519","x":"xXsYx3DYkQTI5gXXLHw3SA-v6gdJINtdyPaPxZO_XrQ","kid":"ZMAe8LHEPuxRsPoFaLFQ6WvJKf0NDbUX3sbGYsodW54","alg":"EdDSA","use":"sig"}]}
```

- It serves the right media type, `Access-Control-Allow-Origin: *`, and
  `Cache-Control: public, max-age=300, s-maxage=300`.
- `kid` is the correct RFC 7638 thumbprint of `x`. `tests/app/directory-stub.test.ts`
  checks this.
- It is not connected to any account or agent. It is one global directory at
  the app origin. Nothing records who holds the private key, and no request
  signed with it is known to exist.
- It sends no directory response signature (`Signature-Input`, `Signature`,
  `Content-Digest`). The current draft makes those optional; see
  `STANDARDS_NOTES.md` §8.
- It includes `"alg": "EdDSA"`. The current draft says a directory's `alg`
  is "restricted to algorithms registered in the HTTP Signature Algorithms"
  registry, where the Ed25519 name is `ed25519`, not the JOSE name `EdDSA`.
  Cloudflare's reference implementation, on the other hand, rejects any value
  other than `EdDSA`. Phase 3 should omit `alg` from served keys (see
  `STANDARDS_NOTES.md` §11).

### 2. In-browser identity lab (replace in Phase 5)

`src/components/identity-demo.tsx` (client component) is shown at `/#lab`.

What it does correctly:

- It generates an Ed25519 key pair in the browser with
  `crypto.subtle.generateKey({ name: "Ed25519" })`. Nothing is sent to a
  server, and the component makes no network requests.
- It computes the RFC 7638 thumbprint with the right member order
  (`crv`, `kty`, `x`) and base64url.
- "Download keys" saves a local JSON bundle that contains the private JWK.
  This happens only in the browser, so it is consistent with the key custody
  rule.

What is demo-only or wrong. None of this interoperates with a real verifier:

- **The self-test proves nothing about interoperability.** `runSelfTest()`
  signs a made-up string and verifies it with the same in-memory key pair.
  The string is not a valid RFC 9421 signature base: it uses a nonexistent
  `"@created"` component, has no `"@signature-params"` line, and hardcodes
  `example.com` as the authority.
- **The header preview doesn't match the signed bytes.** The displayed
  `Signature` value was computed over the made-up string above, not over the
  displayed `Signature-Input`, so copying the preview headers produces a
  signature that fails verification.
- **The `Signature-Agent` URL is invalid under the current draft.**
  `https://id.agentproof.dev/<slug>` has a path. A `type=directory` member
  must be a bare origin, and verifiers must ignore anything else
  (`STANDARDS_NOTES.md` §9). That host is not served by this app either.
- The preview's `Signature-Input` omits `alg` and `nonce`, and uses a
  300-second expiry. The Phase 4 profile uses `alg="ed25519"`, a nonce, and
  roughly 60 seconds.
- The "Hosted directory preview" adds `alg: "EdDSA"`, which has the same
  problem as the stub.

### 3. Marketing copy for features that don't exist yet

In `src/app/page.tsx`:

- The "Lifecycle, handled" card (rotate, revoke, expire, monitor) describes
  Phase 6 and Phase 7 features.
- The "Compatibility checks" card describes Phase 5.
- The "Keys you control" card says "connect your own KMS". Customer-operated
  KMS is compatible with the custody rule, but it isn't built. Managed custody
  by AgentProof is out of scope (see the build plan).
- The "Request check" panel in the "Why now" section is a static
  illustration, not a live check.
- The "Private preview" badge and the "Publish" step describe a hosted
  directory that doesn't exist yet.
- The README "Next production milestones" list predates the build plan. The
  build plan takes precedence.

Phase 0 changed none of this. Later phases update the copy as features ship.

## Tests (Phase 0)

| File | What it covers |
| --- | --- |
| `tests/standards/vectors.test.ts` | RFC 7638/8037 thumbprints, RFC 9421 B.2.6, and draft-ietf-webbotauth-httpsig-protocol-00 E.2.1–E.2.3 test vectors, verified with Node's built-in crypto. |
| `tests/key-custody/private-key-material.test.ts` | The private-key-material detector, run against every API response that returns keys (currently only the directory stub). |
| `tests/app/directory-stub.test.ts` | Pins the stub's current headers and body, so Phase 0 can show nothing changed. Delete it along with the stub in Phase 3. |

## Directory layout

```
src/app/                    Next.js App Router (pages, layouts, route handlers)
src/components/             Client components (identity lab)
tests/                      Vitest suites (standards vectors, key custody, app)
tests/helpers/              Shared test helpers
docs/                       ARCHITECTURE.md, STANDARDS_NOTES.md
AGENTPROOF_BUILD_PLAN.md    Phase plan (source of truth)
```
