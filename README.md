# AgentProof

An early product concept for giving AI agents portable cryptographic identities
using Web Bot Auth and HTTP Message Signatures.

**Live demo:** [agent-proof-app.vercel.app](https://agent-proof-app.vercel.app)

## Current launch slice

- Product landing page
- Client-side Ed25519 key generation
- Public/private JWK export
- RFC 7638-style key thumbprints
- Web Bot Auth directory and request-header previews
- Browser-based sign/verify self-test
- Passwordless developer accounts and optional DNS domain verification
- Hashed, revocable `ap_` API keys
- Ed25519 agent registration with one-time proof-of-possession challenges
- Example directory at
  `/.well-known/http-message-signatures-directory`

The identity lab remains local-only and never uploads generated private keys.
The registration API accepts only public Ed25519 JWKs after verifying a
developer-side signature. A valid signature proves control of a key; it does
not grant an agent permission or trusted status on third-party sites.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify

```bash
npm run check   # lint, typecheck, and tests
npm run build
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/STANDARDS_NOTES.md`](docs/STANDARDS_NOTES.md).

## Next production milestones

1. Persistent hosted directories on customer-controlled domains.
2. TypeScript request-signing SDK with protocol conformance fixtures.
3. Rotation, revocation, and cache-aware key status.
4. Registration guidance for supported verifier ecosystems.

AgentProof is a provisional working name and should be checked for trademark and
domain availability before a commercial launch.
