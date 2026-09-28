# AgentProof

An early product concept for giving AI agents portable cryptographic identities
using Web Bot Auth and HTTP Message Signatures.

## Current launch slice

- Product landing page
- Client-side Ed25519 key generation
- Public/private JWK export
- RFC 7638-style key thumbprints
- Web Bot Auth directory and request-header previews
- Browser-based sign/verify self-test
- Example directory at
  `/.well-known/http-message-signatures-directory`

The identity lab is intentionally local-only. It does not upload, persist, host,
or register generated keys. A valid signature proves control of a key; it does
not grant an agent permission or trusted status on third-party sites.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify

```bash
npm run lint
npm run build
```

## Next production milestones

1. Persistent hosted directories on customer-controlled domains.
2. Account authentication and tenant isolation.
3. TypeScript request-signing SDK with protocol conformance fixtures.
4. Rotation, revocation, and cache-aware key status.
5. Registration guidance for supported verifier ecosystems.
6. Optional KMS-backed signing for teams.

AgentProof is a provisional working name and should be checked for trademark and
domain availability before a commercial launch.
