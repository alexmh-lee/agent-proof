# AgentProof Architecture

Status: updated for Phase 2 (2026-09-30). This document describes the
codebase as it is today, marks what is placeholder or demo code, and states
the key custody rule every later phase must follow. The protocol details live in
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
`src/lib/key-material.ts`, and registration uses it to reject requests.
`tests/key-custody/` runs it against
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
| Auth | Auth.js (`next-auth@5.0.0-beta.32`, `@auth/core@0.41.3`), email magic links, database sessions (Phase 1) |
| Database | Drizzle ORM 0.45.3 + drizzle-kit migrations in `drizzle/`. Neon Postgres on Vercel; embedded PGlite Postgres for local development and tests. |
| External services | Neon stores account data. Resend delivers magic links; the temporary `onboarding@resend.dev` test sender can deliver only to the Resend account owner. |

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
| `npm run db:generate` | Generate a SQL migration in `drizzle/` after editing `src/db/schema.ts`. |
| `npm run db:migrate` | Apply committed migrations to the database selected by `DATABASE_URL`. PGlite applies them automatically when it opens. |

## Routes

| Route | File | Type | What it does |
| --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | Static (prerendered) | Marketing landing page. Server Component that embeds the client-side `IdentityDemo` lab at `#lab`. |
| `/.well-known/http-message-signatures-directory` | `src/app/.well-known/http-message-signatures-directory/route.ts` | Dynamic `GET` handler | **Hardcoded demo directory** (see below). |
| `/login` | `src/app/login/page.tsx` | Dynamic | Magic-link sign-in / sign-up form, or "not configured". |
| `/login/check-email` | `src/app/login/check-email/page.tsx` | Static | Shown after a link is sent. |
| `/account` | `src/app/account/page.tsx` | Dynamic | Signed-in users: trust level, API keys (`email_verified` and above), domain verification, sign out. |
| `/agents` | `src/app/agents/page.tsx` | Dynamic | Lists the account's agents. Requires `email_verified`. |
| `/api/auth/*` | `src/app/api/auth/[...nextauth]/route.ts` | Dynamic | Auth.js endpoints. `503` when sign-in is not configured. |
| `/api/v1/agents/challenge` | `src/app/api/v1/agents/challenge/route.ts` | Dynamic `POST` | Issues a single-use, five-minute registration challenge. Bearer API key; `401` missing or invalid, `403` below `email_verified`. |
| `/api/v1/agents` | `src/app/api/v1/agents/route.ts` | Dynamic `GET`, `POST` | `GET` lists the account's agents and public keys. `POST` registers an agent with proof of possession. Same bearer-key rules. |
| `/_not-found` | Next.js built-in | Static | Default 404. |
| `/favicon.ico` | `src/app/favicon.ico` | Static asset | |

`src/app/layout.tsx` sets metadata with `metadataBase: https://agentproof.dev`.
`src/app/globals.css` holds the Tailwind theme tokens (`ink`, `paper`, `lime`,
`violet`, `orange`) and the marquee and noise effects. `public/` contains only
the unused default Next.js SVGs (`file.svg`, `globe.svg`, `next.svg`,
`vercel.svg`, `window.svg`).

There is no proxy (middleware) file. Pages and server actions check access
through `src/lib/access.ts`. The `/api/v1/agents` routes authenticate bearer
API keys through `src/lib/api-keys.ts`.

## Accounts (Phase 1)

- **Tables** (`src/db/schema.ts`): `user`, `account`, `session`,
  `verificationToken`, in the shape `@auth/drizzle-adapter` expects. `user`
  also has `trust_level` and a single domain claim (`domain`, `domain_token`,
  `domain_verified_at`).
- **Sign-up and login** are the same flow: enter an email, open the magic
  link. Links expire after 15 minutes and work once. Auth.js deletes the token
  row on first use, even when it has expired, and stores only
  SHA-256(token + `AUTH_SECRET`).
- **Trust levels:** `unverified` → `email_verified` (set when a magic-link
  sign-in completes) → `domain_verified` (set when the TXT check passes).
  Changing the domain drops a `domain_verified` account back to
  `email_verified`. Magic-link sign-up creates the user only when the link is
  opened, so `unverified` users only appear if another sign-in method is added
  later. The gate still enforces it.
- **Access helper:** `requirePageUser(level)` redirects to `/login` or
  `/account`. `requireApiUser(level)` returns `401` or `403`. Agent pages
  require `email_verified`; the agent APIs enforce the same level on the
  API key's account (see Agent registration).
- **Domain verification:** the account adds TXT
  `_agentproof.<domain>` = `agentproof-verify=<token>`, and the server checks it
  with `dns.resolveTxt` (`src/lib/domain.ts`).
- **Where sign-in works:** sign-in is enabled only when `AUTH_SECRET`, a
  database, and an email sender exist. Local `next dev` defaults to PGlite in
  `.data/pglite` and prints links to the developer's terminal. Vercel uses the
  connected Neon database and Resend; magic links are never logged in a
  deployed environment.
- **Email:** `src/lib/email.ts` implements `EmailSender` with Resend when
  `RESEND_API_KEY` and `EMAIL_FROM` exist. The initial test sender is
  `AgentProof <onboarding@resend.dev>` and is deliberately temporary because
  Resend restricts it to the account owner's address.
- **Session response:** `/api/auth/session` returns only `expires`,
  `user.id`, and `user.email`. The default Auth.js database session would
  include the raw session token.

## Environment variables

See `.env.example`. Locally, only `AUTH_SECRET` is needed; `DATABASE_URL` and
Resend are optional. Vercel Preview and Production require `AUTH_SECRET`,
`DATABASE_URL`, `RESEND_API_KEY`, and `EMAIL_FROM`. Neon supplies
`DATABASE_URL` through its Marketplace integration. Secret values are never
committed.

## Deployment

- Hosted on Vercel (project `agent-proof-app`, team
  `severus-technologies-projects`) through the GitHub integration on
  `alexmh-lee/agent-proof`. `vercel[bot]` creates a Production deployment for
  every push to `main` and a Preview deployment for other branches, and posts
  the preview URL on the pull request.
- Preview deployments are behind Vercel Deployment Protection (Vercel
  Authentication). Anonymous requests get a `302` to the Vercel login page.
  That is fine for people reviewing previews, but external verifiers can't
  fetch a directory from a protected preview. Phase 3 and Phase 5 testing on
  previews will need a protection bypass or an unprotected test domain.
- Live URL: <https://agent-proof-app.vercel.app>. The layout metadata
  references `agentproof.dev`, but this repo has no evidence that domain is
  attached to the Vercel project.
- The Vercel project is connected to a Neon Marketplace database, and the
  Phase 1 migration has been applied. There is no `vercel.json` or cron job.
  `next.config.ts` marks PGlite as a server external package for local use.
  `.vercel/` and pulled environment files are gitignored.
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

## Agent registration

Verified accounts can create `ap_` API keys on `/account`. Only each key's
SHA-256 hash and last four characters are stored; the raw key is returned once.
The registration endpoints authenticate with `Authorization: Bearer <key>`:

- `POST /api/v1/agents/challenge` creates a single-use, five-minute nonce.
- `POST /api/v1/agents` verifies an Ed25519 proof and registers the agent.
- `GET /api/v1/agents` lists that account's agents and public keys.

Registration signs the UTF-8 bytes of one compact JSON object. Property order is
part of version 1 and is lexical:

```json
{"account_id":"<account id>","directory_authority":"<account id>.id.agentproof.dev","issued_at":<unix seconds>,"nonce":"<challenge nonce>","purpose":"<declared purpose>","thumbprint":"<RFC 7638 thumbprint>","type":"agentproof-registration-v1"}
```

The server computes the thumbprint from the submitted public JWK and derives
the directory authority from the authenticated account. It accepts and stores
only `{ "kty": "OKP", "crv": "Ed25519", "x": "..." }`. Requests containing a
private JWK member or PEM private key are rejected before signature handling
and their bodies are never logged.

Email-verified accounts default to five active agents, domain-verified accounts
to 50, and all accounts to ten registrations per UTC day. Registrations above
either threshold are retained as `pending_review` and will not be published.
Their key rows keep the stored status `active`, so code must read key status
through `effectiveKeyStatus()` in `src/lib/agent-registration.ts`, which reports
the agent's status for keys of any agent that is not `active`.
The values and directory base domain are configurable with the environment
variables documented in `.env.example`.

## Tests

| File | What it covers |
| --- | --- |
| `tests/standards/vectors.test.ts` | RFC 7638/8037 thumbprints, RFC 9421 B.2.6, and draft-ietf-webbotauth-httpsig-protocol-00 E.2.1–E.2.3 test vectors, verified with Node's built-in crypto. |
| `tests/key-custody/private-key-material.test.ts` | The private-key-material detector, run against every API response that returns keys (the directory stub and the three `/api/v1/agents` routes), and a check that no column in any table in `src/db/schema.ts` could hold private keys. |
| `tests/accounts/auth-flow.test.ts` | Runs the real Auth.js handler against in-memory PGlite: sign up, verify, log out, log in again, reused link, expired link, hashed token storage, and a minimal session response. |
| `tests/accounts/access.test.ts` | The agents page and the agent APIs reject signed-out (no API key) and `unverified` users and admit verified ones. |
| `tests/accounts/domain.test.ts` | Domain verification with mocked DNS: correct TXT passes, a missing or wrong TXT fails. |
| `tests/agents/registration.test.ts` | Hashed and revocable API keys, local key generation, proof-of-possession registration, public-only persistence, challenge expiry/replay, global thumbprint uniqueness, pending-review limits, and that keys of non-active agents are never reported as active. |
| `tests/agents/routes.test.ts` | Calls the real agent route handlers: `401` for a missing or invalid key, `403` for unverified accounts, successful registration and listing, `409` for a reused challenge, and `400` for a `d` field, a PEM private key, or a non-Ed25519 key. |
| `tests/app/directory-stub.test.ts` | Pins the stub's current headers and body, so Phase 0 can show nothing changed. Delete it along with the stub in Phase 3. |

## Directory layout

```
src/app/                    Next.js App Router (pages, layouts, route handlers)
src/components/             Client components (identity lab)
src/auth.ts                 Auth.js instance, authConfigured(), getCurrentUser()
src/db/                     Drizzle schema and PGlite connection
src/lib/                    Auth config, access checks, domain verification, email
drizzle/                    SQL migrations (generated by drizzle-kit)
tests/                      Vitest suites (standards vectors, key custody, app)
tests/helpers/              Shared test helpers
docs/                       ARCHITECTURE.md, STANDARDS_NOTES.md
AGENTPROOF_BUILD_PLAN.md    Phase plan (source of truth)
```
