# AgentProof Build Plan

This file is the source of truth for building AgentProof. Read it fully before writing code, and re-read the relevant phase before starting it.

## How to work through this plan

1. Work on one phase at a time, in order. Do not start work from a later phase, even if it looks quick.
2. Create a branch per phase (for example `phase-1-accounts`) and open a pull request when the phase is done.
3. A phase is finished only when every item under "Done when" passes. Run `npm run check` (lint, typecheck, tests), run the app locally, and confirm it works on a Vercel preview deployment.
4. When a phase is finished, write a report using the template at the bottom of this file, then STOP and wait for the reply "continue" before starting the next phase.
5. If a check fails, fix it before reporting. Do not report a phase as done with known failures. List anything you could not verify.
6. Keep the existing landing page. Extend it; do not rewrite it unless a phase asks for that.
7. When a detail of the standards is unclear, check the current IETF drafts and write down what you found. Do not guess. Flag the ambiguity in your report.
8. Ask before adding any paid service or new third-party dependency that holds user data.

## The core rule: developers hold their own private keys

This rule applies to every phase. Any code that breaks it is a bug.

- Private keys are generated on the developer's machine (by our CLI, our SDK, or in the browser with WebCrypto). They are never sent to AgentProof servers.
- The server stores public keys only: a JWK with `kty: "OKP"`, `crv: "Ed25519"`, and `x`. Any API payload that contains a `d` field, a PEM private key, or anything else that looks like private key material is rejected with a 400 error. Log a warning that this happened, but never log the payload itself.
- Never log request bodies on endpoints that handle keys.
- Registration requires proof of possession. The server issues a one-time challenge, the developer signs it locally with the private key, and the server checks the signature against the submitted public key before storing anything.
- Anything that requires the private key, including directory signatures (see Phase 3), happens in the CLI or SDK on the developer's side. The server only verifies and stores the results.
- Add an automated test that fails if any database table or API response contains a field that could hold private key material.

One consequence to design around: because signing happens on the developer's side, AgentProof cannot see the requests an agent sends to third-party websites. Audit logs and anomaly detection must be built on what we can actually observe (registrations, key changes, directory fetches, test verifications) plus optional, opt-in SDK telemetry. Do not build features that assume we see all agent traffic.

---

## Phase 0: Audit and foundations

Goal: understand the codebase and the standards before building anything.

Tasks:
- Review the repo and list in `docs/ARCHITECTURE.md` the framework, current routes, deployment setup, and anything that is placeholder or demo code (including the hardcoded directory stub and the in-browser lab).
- Read the current versions of these specs and summarize the exact requirements in `docs/STANDARDS_NOTES.md`:
  - RFC 9421 (HTTP Message Signatures)
  - The Web Bot Auth architecture draft (draft-meunier-web-bot-auth-architecture)
  - The HTTP message signatures directory draft (draft-meunier-http-message-signatures-directory)
  - RFC 7638 (JWK thumbprints, used as the `keyid`)
  - RFC 8037 (Ed25519 keys as JWK)
- In the notes, record: the exact format of the `Signature-Agent`, `Signature-Input`, and `Signature` headers; the required signature components and parameters (`created`, `expires`, `nonce`, `keyid`, `tag`); the directory path, content type, and JSON shape; what the directory response signature must cover; and whether `Signature-Agent` may point to a URL with a path or must be a bare origin. Note any places where recent draft versions changed.
- Check whether maintained reference implementations exist (for example Cloudflare's `web-bot-auth` repository and related npm packages). Decide whether to use them or to write our own code that mirrors their behavior, and record the decision and the reason.
- Set up Vitest and a single `npm run check` script that runs lint, typecheck, and tests.
- Write the key custody rule from this file into `docs/ARCHITECTURE.md`.

Done when:
- `npm run check` passes.
- `docs/ARCHITECTURE.md` and `docs/STANDARDS_NOTES.md` exist and are specific enough that someone else could implement signing from them.
- No product behavior has changed.

---

## Phase 1: Database and accounts with an identity check

Goal: real accounts, with a verified identity before anyone can register an agent.

Tasks:
- Add Postgres (Neon through the Vercel Marketplace is the default choice) and an ORM with migrations (Drizzle or Prisma). Create only the tables this phase needs: users, accounts, sessions, and email verification tokens. Later phases add their own tables.
- Add sign-up and login using email magic links or email and password with verification (Auth.js is fine).
- Give every account a trust level: `unverified`, then `email_verified`, then later `domain_verified`.
- Add optional domain verification: the account adds a DNS TXT record (for example `_agentproof.example.com` with value `agentproof-verify=<token>`), and the server checks it. Domain verification raises limits in Phase 2.
- Unverified accounts cannot reach any agent registration page or API.
- Document every environment variable in `.env.example`. List the ones that must also be added in the Vercel project settings.
- In local development, print verification links to the console instead of sending email.

Done when:
- A new user can sign up, verify their email, log in, and log out.
- Unverified users are blocked from protected pages and APIs (covered by tests).
- Verification tokens expire and cannot be used twice (covered by tests).
- Domain verification succeeds with a correct TXT record and fails without one (the DNS lookup is mocked in tests).
- All of the above works on a Vercel preview deployment.

---

## Phase 2: Account API keys and agent registration

Goal: a developer can register agents under their account, proving they hold each private key, without us ever receiving it.

Tasks:
- **Account API keys.** Generate random keys with a prefix such as `ap_` and show each one only once. Store only a SHA-256 hash, the last four characters, the creation date, the last-used date, and the revoked status. Add a minimal settings page to create and revoke keys. The API authenticates with `Authorization: Bearer <key>`.
- **Tables:**
  - `agents`: id, account_id, name (a slug unique per account), purpose, status (`active`, `pending_review`, `revoked`), created_at, last_active_at.
  - `agent_keys`: id, agent_id, public_jwk (only `kty`, `crv`, `x`), thumbprint (the RFC 7638 base64url value, used as the `keyid`), status (`active`, `retiring`, `revoked`), created_at, not_after, revoked_at.
- **Registration with proof of possession:**
  1. `POST /api/v1/agents/challenge` returns a random nonce that is single use and expires after 5 minutes.
  2. The developer signs a message containing the nonce, the account id, and the key thumbprint locally with the private key.
  3. `POST /api/v1/agents` receives the name, purpose, public JWK, challenge id, and signature. The server verifies the signature and then stores the agent and its key.
- **Validation.** Reject any `d` field, any key that is not Ed25519, reused or expired challenges, and thumbprints already registered anywhere on the platform.
- **Limits.** Make these configurable. Suggested defaults: email-verified accounts get 5 agents and 10 registrations per day; domain-verified accounts get 50 agents. A registration that exceeds a threshold is stored as `pending_review`, which is not published anywhere. Postgres-backed counters are fine for now.

Done when:
- A test script generates a key pair locally, registers an agent, and the database contains only public key data.
- Reusing a challenge fails, submitting a key with a `d` field fails, and going over a limit results in `pending_review` (all covered by tests).
- API keys work, are stored hashed, and stop working once revoked.

---

## Phase 3: Hosted key directory

Goal: replace the hardcoded stub with real, per-account directories generated from the database.

Tasks:
- **Directory location.** Base this on Phase 0's finding. If `Signature-Agent` must be a bare origin, give each account its own subdomain (for example `<account-slug>.id.agentproof.dev`) served at `/.well-known/http-message-signatures-directory`. This needs a wildcard custom domain on Vercel, so document the setup steps. If a path is allowed, a path per account is fine. Record the decision.
- **One directory per account**, containing every active key for that account's agents, each identified by its thumbprint. Provide a separate metadata endpoint that maps a keyid to the agent's name and purpose.
- **Response format.** Use the content type and JSON shape from `STANDARDS_NOTES.md` (a `keys` array of public JWKs). Include only `active` and `retiring` keys. Never include `revoked`, expired, or `pending_review` keys. Set a short `Cache-Control` max-age (for example 300 seconds) so revocations propagate quickly.
- **Directory signatures under the key custody rule.** The draft expects the directory response to be signed by the keys it lists. We cannot produce that signature ourselves, so:
  - Add `POST /api/v1/agents/:agentId/keys/:keyId/attestation`. The developer's CLI or SDK produces the directory signature locally and uploads it.
  - The server verifies the uploaded signature against the stored public key before accepting it, then stores it with its expiry.
  - When the server serves the directory, it attaches the stored, valid signatures as `Signature-Input` and `Signature` headers (one label per key). Expired attestations are dropped.
  - Check in Phase 0's notes exactly what the directory signature covers. If it covers only request components such as `@authority` plus time parameters, one attestation stays valid until it expires. If it also covers the response body, every change to the directory invalidates it, so design how the SDK refreshes. Record which case applies.
  - Decide what happens to a key whose attestation has expired: keep it listed but show a warning in the dashboard, or remove it. Recommend one option in your report.
- Delete the hardcoded stub.

Done when:
- A key registered in Phase 2 appears in the directory. Revoked and pending keys never appear (covered by tests).
- A valid uploaded attestation appears in the response headers, and an independent verification script confirms it. An expired attestation is not served.
- The response format matches the draft exactly.
- It works on a Vercel preview, or the report documents the wildcard domain steps and a working fallback.

---

## Phase 4: CLI and signing SDK

Goal: a developer goes from nothing to signed requests in under 10 minutes, and the private key never leaves their machine.

Tasks:
- Create a workspace package (for example `packages/sdk`) that provides both a Node SDK and a CLI called `agentproof`.
- **CLI commands:**
  - `agentproof keygen --out ./agentproof-key.json` generates an Ed25519 key pair locally, sets file permissions to 600, prints the public JWK and thumbprint, warns the user never to commit the file, and adds it to `.gitignore` if one exists.
  - `agentproof register --name <name> --purpose <text>` reads `AGENTPROOF_API_KEY` and runs the challenge flow from Phase 2.
  - `agentproof attest` creates the directory signature locally and uploads it (Phase 3).
- **SDK:**
  - `createSigner()` loads the private key from `AGENTPROOF_PRIVATE_KEY` or a file path.
  - `signedFetch(url, init)` adds `Signature-Agent`, `Signature-Input`, and `Signature` exactly as specified in `STANDARDS_NOTES.md`. That includes the required components (at minimum `@authority` and `signature-agent`), `created`, a short `expires` (for example 60 seconds), a random `nonce`, `keyid` set to the thumbprint, the `web-bot-auth` tag, and `alg="ed25519"`.
  - Signing is fully local. The SDK does not call AgentProof on each request.
  - An optional `autoAttest: true` setting refreshes the directory attestation before it expires. This is the only way the SDK talks to our servers.
  - Never log or print the private key.
- Write a quickstart in the package README.

Done when:
- Unit tests check signature base construction against the RFC 9421 examples and any examples in the drafts.
- A request signed by the SDK verifies with an independent verifier (the reference implementation, if one exists).
- On a clean machine, following only the README, a new user can run keygen, register, attest, and send a signed request (time it and include the time in the report).
- Tests confirm the SDK never sends private key material over the network.

---

## Phase 5: A real test endpoint, and a fixed demo lab

Goal: developers can confirm their setup works against a real server-side verifier.

Tasks:
- Add a public verification endpoint (for example `/api/v1/verify-test`) that accepts any signed request and checks, in order:
  1. The `Signature-Agent`, `Signature-Input`, and `Signature` headers parse correctly.
  2. The tag, algorithm, and `created`/`expires` window are valid, allowing for 30 to 60 seconds of clock skew.
  3. The nonce has not been seen before within its validity window.
  4. The directory can be fetched from the `Signature-Agent` URL, with safeguards: HTTPS only, private and internal IP addresses blocked, a 3 second timeout, a 64 KB size limit, and caching that respects max-age.
  5. The directory's own signatures verify.
  6. The key matching `keyid` is found, the signature base is rebuilt, and the Ed25519 signature verifies.
- Return a JSON report showing each step as pass or fail, with a plain-language explanation. If the agent is hosted by AgentProof, include its name.
- Add a test page in the dashboard that shows recent results for the account's agents.
- **Fix the lab.** Replace the current in-browser "sign and verify against itself" demo:
  - Generate the key pair in the browser with WebCrypto and offer the private key as a download.
  - Send a real signed request to the test endpoint and display the step-by-step report.
  - The private key never leaves the browser.
- Record each test verification so Phase 7 can show last-active times and Phase 8 can log it.

Done when these cases all behave correctly and are covered by tests:
- A request signed by the SDK passes.
- A tampered header fails at the correct step.
- An expired signature fails.
- A replayed nonce fails.
- A revoked key fails.
- A directory hosted on another server (run a local test server) verifies correctly.
- Requests to `http://169.254.169.254` and to private IP ranges are blocked.

---

## Phase 6: Key lifecycle (revocation, rotation, expiry)

Goal: developers stay in control of their keys over time. Revocation is the most important control in the product.

Tasks:
- **Revoke.** Available through the API, a dashboard button, and `agentproof revoke`. The key is removed from the directory immediately and a reason is recorded. Revocation is permanent; recovering means registering a new key. State the cache window honestly in the UI: verifiers may keep using a cached directory for up to max-age.
- **Rotate.** `agentproof rotate` generates a new key locally and registers it under the same agent with proof of possession. The old and new keys are both served during an overlap window (default 24 hours). The old key then moves to `retiring` and is removed. The SDK can load the new key without code changes.
- **Expiry.** Each key can have an optional `not_after` date (suggested default 90 days). Send warning emails 14 days and 3 days before expiry. A scheduled job (Vercel Cron) removes expired keys from the directory.
- **Emergency revoke.** A single action revokes every key on an account.
- Document the key state machine in `docs/ARCHITECTURE.md`.

Done when:
- Every state transition has a test.
- A revoked key fails the Phase 5 test endpoint once the cache window has passed.
- A rotation completes with no period in which the agent fails verification.

---

## Phase 7: Dashboard

Goal: a non-technical person can understand and manage their agents.

Tasks:
- **Agents list:** name, purpose, created date, last active, key status, attestation status, and expiry. Label where the last-active time comes from (directory fetch, test verification, or telemetry).
- **Agent detail page:** keys and their history, a revoke button, and a rotate button. Because keys are generated locally, rotate shows the CLI command to run instead of generating a key in the browser. Also include a copyable setup snippet.
- **Account page:** API keys, verification status, current limits, and the path to domain verification.
- Include clear empty states and plain-language labels throughout.

Done when:
- Every action works end to end.
- Someone unfamiliar with the project can register their first agent by following only the on-screen instructions. Write down where they got stuck.

---

## Phase 8: Audit log

Goal: a tamper-evident record of what AgentProof can actually observe.

Tasks:
- Log account events, API key use, agent registrations, every key state change, attestation uploads, directory fetches (verifier IP or network, user agent, timestamp, keys served), and test endpoint results.
- **`audit_events` table.** It is append-only, and each row stores a hash of its own content combined with the previous row's hash for that account (a hash chain). Prevent updates and deletes with database permissions or a trigger.
- Add a script that verifies the chain and pinpoints any row that was altered.
- Add CSV and JSON export.
- **Optional SDK telemetry, off by default.** When a developer turns it on, the SDK reports metadata about signed requests: timestamp, target host, HTTP method, and keyid. It never reports bodies, query strings, or headers. The dashboard shows clearly whether telemetry is on.
- Describe this as a "tamper-evident log designed to support record-keeping." Do not claim EU AI Act compliance anywhere in the product.

Done when:
- Altering any row is detected by the verification script (covered by tests).
- Exports work.
- Tests confirm telemetry is off by default and sends nothing when disabled.

---

## Phase 9: Abuse controls and anomaly detection

Goal: protect the trust of the whole directory. One abusive account can damage every legitimate developer's reputation.

Tasks:
- **Registration signals:** many agents registered in a short time, many accounts from the same IP, and disposable email domains. Any of these sends new registrations to `pending_review`.
- **Usage signals:** directory fetches for a key jumping well above its 7-day baseline, a sudden burst of new verifiers, and request volume spikes (for accounts with telemetry on).
- **Internal admin review page:** approve or reject pending registrations, and suspend an account, which immediately removes all of its keys from its directory.
- Email alerts to account owners when their agents trigger an anomaly.
- Start with simple, configurable rules. Do not use machine learning.

Done when:
- Scripts that simulate abuse trigger review and alerts.
- Suspension removes every key for the account.
- Normal usage from the Phase 4 quickstart triggers nothing.

---

## Out of scope for now

Do not build these yet. Do make sure the data model will not block them later.

- Enforcing scoped permissions. Store only the declared purpose and an optional `declared_scopes` field on agents.
- Billing, pricing tiers, and usage metering.
- Team roles and multi-user accounts.
- A compliance logging add-on.
- A paid lookup or reputation service for verifiers.
- Managed key custody. This is a possible future premium tier backed by a hardware security module, and it requires a separate security review first.

---

## Report template (use after every phase)

1. **What was built:** a short summary and a list of files changed.
2. **How to test it manually:** exact steps and commands.
3. **Automated tests:** what was added and the result of `npm run check`.
4. **Standards decisions:** anything ambiguous in the specs and how you resolved it.
5. **Key custody check:** confirm that no private key material is sent, stored, or logged, and how you verified it.
6. **Known gaps or risks.**
7. **Setup needed from us:** environment variables, Vercel settings, and DNS records.

Then stop and wait for "continue".
