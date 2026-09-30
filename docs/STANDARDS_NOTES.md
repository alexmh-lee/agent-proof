# Standards Notes

Status: Phase 0 (researched 2026-09-29). These notes are meant to be enough to
implement Web Bot Auth signing and verification without rereading the specs.
Where a spec is ambiguous or specs disagree with each other, §11 says what we
decided and why. Every test vector quoted here is verified in
`tests/standards/vectors.test.ts`.

## 0. Sources and versions

The two drafts named in the build plan have been **superseded**. Both
individual drafts stopped at revision 05 (2 March 2026) and expired on
3 September 2026. Their content now lives in one working-group document.

| Document | Version read | Date | Status |
| --- | --- | --- | --- |
| RFC 9421, HTTP Message Signatures | RFC | Feb 2024 | Proposed Standard |
| RFC 7638, JWK Thumbprint | RFC | Sep 2015 | Proposed Standard |
| RFC 8037, CFRG curves in JOSE (Ed25519 JWK) | RFC | Jan 2017 | Proposed Standard |
| RFC 9651, Structured Field Values for HTTP | RFC | Sep 2024 | Proposed Standard (obsoletes RFC 8941) |
| RFC 9530, Digest Fields (`Content-Digest`) | RFC | Feb 2024 | Proposed Standard |
| **draft-ietf-webbotauth-httpsig-protocol-00** | -00 | 1 Sep 2026 | **Current, WG-adopted. This is the normative source for AgentProof.** |
| draft-meunier-webbotauth-httpsig-protocol | -02 | 18 Aug 2026 | Replaced by the WG draft; text is identical except for editorial changes |
| draft-meunier-web-bot-auth-architecture | -05 | 2 Mar 2026 | Expired; renamed to httpsig-protocol |
| draft-meunier-http-message-signatures-directory | -05 | 2 Mar 2026 | Expired; replaced by httpsig-directory |
| draft-meunier-webbotauth-httpsig-directory | -00 | 26 Jun 2026 | Folded into httpsig-protocol-01 |
| draft-meunier-webbotauth-registry | -03 | 26 Jun 2026 | Informative (Signature Agent Cards, registries) |
| draft-singh-webbotauth-hosted-directories | -00 | 19 Jul 2026 | Informative individual draft; describes our exact model (hosted directories, tenant-held keys) |

Lineage:

```
draft-meunier-web-bot-auth-architecture-05 ──► draft-meunier-webbotauth-httpsig-protocol-00/-01/-02 ──► draft-ietf-webbotauth-httpsig-protocol-00
draft-meunier-http-message-signatures-directory-05 ──► draft-meunier-webbotauth-httpsig-directory-00 ──► (folded into httpsig-protocol-01)
```

Section numbers below refer to draft-ietf-webbotauth-httpsig-protocol-00
("the draft") unless another document is named. Editor's copy:
<https://thibmeu.github.io/http-message-signatures-directory/draft-ietf-webbotauth-httpsig-protocol.html>.
Check it and the datatracker at the start of each phase. The draft expires
5 March 2027 and will change.

## 1. The AgentProof profile at a glance

Every signed agent request carries three headers:

```
Signature-Agent: sig1="https://<account>.id.agentproof.dev"
Signature-Input: sig1=("@authority" "signature-agent";key="sig1");created=<now>;keyid="<thumbprint>";alg="ed25519";expires=<now+60>;nonce="<64 random bytes, base64>";tag="web-bot-auth"
Signature: sig1=:<64-byte Ed25519 signature, base64>:
```

The key directory is served at
`https://<account>.id.agentproof.dev/.well-known/http-message-signatures-directory`
with `Content-Type: application/http-message-signatures-directory+json` and a
body of `{"keys":[<public Ed25519 JWKs with kid = thumbprint>]}`.

The subdomain-per-account shape follows from §9. Phase 3 confirms the domain
name.

## 2. RFC 9421 essentials

### 2.1 Covered components

A signature covers an ordered list of *component identifiers*. Each is an
`sf-string` (always double-quoted), optionally followed by parameters:

- **Derived components** start with `@`. The ones we use:
  - `"@authority"` (RFC 9421 §2.2.3): host and optional port of the target URI,
    **lowercased, with the default port removed**. For
    `https://Example.COM:443/x` the value is `example.com`. In HTTP/1.1 it
    comes from `Host`; in HTTP/2 and HTTP/3 from `:authority`.
  - `"@target-uri"` (§2.2.2): the full URI including scheme, path, and query.
  - `"@method"` (§2.2.1), `"@path"` (§2.2.6), `"@query-param";name="…"` (§2.2.8):
    optional extras that narrow what the signature covers.
- **HTTP fields** use the lowercase field name, for example `"content-digest"`.
- **Dictionary member of a field** (§2.1.2) uses `"<field>";key="<member-key>"`.
  The value is the member's value **and its parameters**, re-serialized
  strictly per RFC 9651 §4, **without the member key**. So for
  `Signature-Agent: sig1="https://a.example"` the value of
  `"signature-agent";key="sig1"` is `"https://a.example"`, with the quotes
  included. If the member were `sig1="https://a.example";type=directory`, the
  value would be `"https://a.example";type=directory`.
- **`;req` flag** (§2.4): used only in a *response* signature. It means "take
  this component from the request that produced this response". It MUST NOT
  be used in a request signature.

### 2.2 Signature parameters (§2.3)

Signature parameters are serialized as parameters on the inner list, in the
order the signer chooses. Once chosen, the order can't change, because it is
part of the signed bytes.

| Param | Type | Meaning |
| --- | --- | --- |
| `created` | Integer (Unix seconds) | Creation time. No sub-second precision. |
| `expires` | Integer (Unix seconds) | Expiry time. |
| `nonce` | String | Random unique value per signature. |
| `alg` | String | Algorithm from the HTTP Signature Algorithms registry. Ed25519 is `ed25519`. |
| `keyid` | String | Key identifier. For Web Bot Auth, the RFC 7638 thumbprint. |
| `tag` | String | Application tag. `web-bot-auth` for requests, `http-message-signatures-directory` for directory responses. |

Integers are bare (`created=1735689600`). Strings are double-quoted with `\`
and `"` escaped. Tokens are not used for these params.

### 2.3 Signature base (§2.5)

For each covered component, in order, append:

```
<component-identifier>: <component-value>\n
```

Then append the final line **without** a trailing newline:

```
"@signature-params": <inner-list serialization of components + params>
```

Rules:

- The base must be ASCII only; anything else is an error.
- A component that appears twice (including parameters) is an error.
- A covered component that is missing from the message is an error. This
  includes a dictionary key that isn't present.
- `"@signature-params"` is never listed in the covered components.
- The `@signature-params` value is exactly the `Signature-Input` member value
  for this label, **without the label and `=`**.
- Signature labels (such as `sig1`) never appear in the base. The `key="sig1"`
  parameter of a `signature-agent` component does, because it is part of that
  component's identifier.

### 2.4 Ed25519 (§3.3.6)

Sign the raw base bytes (no pre-hash) with Ed25519 (RFC 8032 §5.1.6). The
signature is 64 bytes (R‖S). Indicated by `alg="ed25519"`. In WebCrypto and
Node, use `{ name: "Ed25519" }` and `crypto.sign(null, …)`.

### 2.5 Header fields (§4)

- `Signature-Input` (§4.1): a Dictionary. Each member is
  `<label>=<inner-list with params>`.
- `Signature` (§4.2): a Dictionary. Each member is `<label>=:<base64>:`, an
  sf-binary Byte Sequence in **standard base64 with padding**.
- Every label must appear in both fields. Labels must be unique in a message.
  Multiple field lines combine into one dictionary.

### 2.6 Verification (§3.2)

1. Parse `Signature` and `Signature-Input`, choose a label, and require it to
   be present in both.
2. Parse the inner list: covered components and params.
3. Decode the signature bytes.
4. Check application requirements (§3.2.1): required components and params,
   tag, and the `created`/`expires` window.
5. Resolve the key from `keyid`. An unknown or untrusted key means the
   verification MUST fail.
6. Determine the algorithm from the allowed set. `alg`, if present, must match
   the key type. If sources disagree, fail.
7. Rebuild the base from the received message, using the received
   `Signature-Input` member value as `@signature-params`.
8. Verify.

### 2.7 Replay (§7.2.2)

`nonce` lets a verifier detect a reused signature. `created` and `expires`
bound how long a captured signature is useful. The RFC defines no clock-skew
allowance; that is left to the application.

## 3. Web Bot Auth request headers, exactly

### 3.1 `Signature-Agent` (draft §5.2.1)

- A **Dictionary** structured field (RFC 9651 §3.2).
- Member **values MUST be sf-strings containing a URI with scheme `https`**.
  If any value isn't a valid URI-reference, the whole field MAY be ignored.
- Each member may carry a `type` parameter (a Token). If it's absent, the type
  is `directory`. Defined types: `directory`, `jwks_uri`, `cimd` (§5.5). A
  verifier that doesn't support a type MUST ignore that member and MUST NOT
  guess the mechanism from the URL path or content.
- **Signers MUST send the dictionary form.** The legacy form is a bare
  sf-string: `Signature-Agent: "https://…"`. Verifiers MAY accept it and treat
  it as a single member keyed by the covering signature's label. The two forms
  are easy to tell apart: a legacy value starts with `"`.
- **A signed request MUST carry `Signature-Agent`.** Each signature MUST cover
  the member whose key equals its own label: the label `sig1` covers
  `"signature-agent";key="sig1"`. (This became mandatory in
  httpsig-protocol-02; before that it was only RECOMMENDED.)
- **With multiple signatures** (§5.2.2), each signer provides its own member.
  An outer signer that covers `"signature";key=X` must also cover
  `"signature-input";key=X` and every component X covers.
- An intermediary MUST NOT rename a `Signature-Agent` member key that a
  signature it can't recompute covers (§6.6.1).

Examples from the draft:

```
Signature-Agent: sig1="https://signature-agent.test"
Signature-Agent: sig1="https://signature-agent.test/jwks.json";type=jwks_uri
Signature-Agent: sig1="https://signature-agent.test/card";type=cimd
```

### 3.2 Required components and parameters (draft §5.2)

| Item | Requirement |
| --- | --- |
| `@authority` **or** `@target-uri` | MUST include at least one. We always include `@authority` (§11.6). |
| `"signature-agent";key="<label>"` | MUST (§5.2.1). |
| `created` | MUST. |
| `expires` | MUST. RECOMMENDED no more than 24 hours after `created`. The build plan uses about 60 seconds. |
| `keyid` | MUST be the base64url JWK SHA-256 thumbprint (RFC 7638 §3.2; for Ed25519, RFC 8037 App. A.3). See §5. |
| `tag` | MUST be `web-bot-auth`. |
| `alg` | Not required by the draft (RFC 9421: optional). All draft test vectors and the reference implementation include `alg="ed25519"`. **We include it.** |
| `nonce` | The current draft defers to RFC 9421 §7.2.2, which makes it optional. The architecture draft (-05 and earlier) said agents SHOULD send a 64-byte random nonce, unique within the validity window. **We always include one** (§11.1). |
| `@method`, `@path`, `@target-uri`, `@query-param` | SHOULD be covered by signers who want to narrow the signature's scope. |
| Body | Not covered unless the agent sends and covers `Content-Digest` (RFC 9530). Not required. |

Parameter order convention: the draft's vectors and the reference
implementation use `created;keyid;alg;expires;nonce;tag`. We use the same
order, so our output can be compared byte for byte with theirs.

### 3.3 Worked example (draft App. E.2.1; verified in tests)

Key: RFC 9421 App. B.1.4 test key, `x = JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs`,
thumbprint `poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U`. This is a test key;
never use it in production (§6.8).

Request: `Host: example.com`, `Signature-Agent: agent2="https://signature-agent.test"`.

Signature base (three lines, no trailing newline):

```
"@authority": example.com
"signature-agent";key="agent2": "https://signature-agent.test"
"@signature-params": ("@authority" "signature-agent";key="agent2");created=1735689600;keyid="poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U";alg="ed25519";expires=4889289600;nonce="n9p433xm+NJ3ph3upfBIGmsuwHw387YV7Q/F+6BSpGCVjYCqQw6rznNA8PVVLySrAWsv0hQtFioQb6E1YsauiA==";tag="web-bot-auth"
```

Headers:

```
Signature-Agent: agent2="https://signature-agent.test"
Signature-Input: sig2=("@authority" "signature-agent";key="agent2");created=1735689600;keyid="poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U";alg="ed25519";expires=4889289600;nonce="n9p433xm+NJ3ph3upfBIGmsuwHw387YV7Q/F+6BSpGCVjYCqQw6rznNA8PVVLySrAWsv0hQtFioQb6E1YsauiA==";tag="web-bot-auth"
Signature: sig2=:RdNFx5Bj6au3YgAMQL/RzmUlZE8QZLIaXGRpw985hWnwPfMxT228NMk6ehRS1PSl4e8PhbNZACSanGdhEwYCCg==:
```

In this vector the signature label (`sig2`) differs from the member key
(`agent2`). The current draft requires the covered member key to equal the
signature's label, so this pairing is no longer conformant for new signers.
The signature itself is valid. Our signer always uses the same name, `sig1`,
for both.

Legacy form (App. E.2.2) differs only in that the header is
`Signature-Agent: "https://signature-agent.test"` and the component is
`"signature-agent"` with no `key` parameter.

## 4. Verifier rules specific to Web Bot Auth (draft §5.4, §4, §6)

- If `Signature`, `Signature-Input`, or `Signature-Agent` fails to parse, the
  origin MAY respond `400`.
- The origin MAY discard signatures whose `tag` isn't `web-bot-auth`.
- **Look keys up by the (Signature-Agent URL, keyid) pair, never by keyid
  alone.** Otherwise a request can claim any URL while using a key learned
  from another directory.
- A verifier MUST NOT attribute a request to a Signature-Agent URL unless it
  resolved that URL itself (or has valid redistributed proof, §5.5.3). Until
  resolved, the URL is only a claim.
- Three outcomes (App. C.1): **verified**, **invalid** (bad signature,
  components, key, or freshness), and **unverified** (couldn't decide, for
  example because the directory fetch failed).
- A directory that fails to resolve MUST NOT evict a cached entry. A directory
  that resolves without the key is evidence that the key was removed (§6.10).
- Origins may request a signature with `Accept-Signature` (RFC 9421 §5) and a
  `403`. For a replayed signature or nonce: `429` (§5.3).
- An origin SHOULD refuse `Signature` headers sent over plain HTTP (§6.1).
- HMAC shared secrets MUST NOT be used (§6.4). Known test keys SHOULD be
  rejected (§6.8).

SSRF protections for directory fetches (§6.7, App. C.3, C.5): cap the response
size after decoding, cap the key count, set a wall-clock timeout, **follow no
redirects** (§5.5: "MUST NOT automatically follow HTTP redirects"), block
private, loopback, and link-local addresses, coalesce concurrent fetches, and
expire negative-cache entries within 5 minutes. The build plan's Phase 5
limits (HTTPS only, 3 s timeout, 64 KB) fit within this.

## 5. `keyid`: JWK thumbprint (RFC 7638 + RFC 8037 App. A.3)

1. Take the required public members for the key type. For OKP they are
   **`crv`, `kty`, `x`**, and nothing else (no `kid`, `alg`, `use`).
2. Serialize them as JSON with the members in **lexicographic order**, **no
   whitespace**, and values as JSON strings:
   `{"crv":"Ed25519","kty":"OKP","x":"<x>"}`
3. SHA-256 the UTF-8 bytes.
4. base64url-encode without padding. The result is the `keyid`, and the
   directory `kid` if one is included.

Test vectors:

| `x` | Thumbprint |
| --- | --- |
| `11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo` (RFC 8037 A.1) | `kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k` |
| `JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs` (RFC 9421 B.1.4) | `poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U` |

## 6. Ed25519 as JWK (RFC 8037 §2)

- `kty` MUST be `"OKP"`. `crv` is `"Ed25519"`.
- `x` is the 32-byte public key, base64url without padding (43 chars).
- `d` is the 32-byte **private** key. **A public JWK MUST NOT contain `d`**;
  the public form "just omits d" (App. A.2). AgentProof rejects any payload
  containing `d` (see the key custody rule in `ARCHITECTURE.md`).
- The JOSE algorithm name is `alg: "EdDSA"`. That is a different registry
  from the HTTP signature algorithm `ed25519`; see §11.3.
- Validation we apply: `kty === "OKP"`, `crv === "Ed25519"`, `x` decodes to
  exactly 32 bytes, and no private members are present.

## 7. The key directory (draft §5.5, §5.5.1, §8)

| Item | Requirement |
| --- | --- |
| Path | `/.well-known/http-message-signatures-directory` (registered well-known URI, §8.1). |
| Scheme | MUST be HTTPS. |
| Status | MUST be `200`. Verifiers treat any other status as a discovery failure and MUST NOT follow redirects. |
| Content type | MUST be `application/http-message-signatures-directory+json` when served at the well-known URI. |
| Body | A JWK Set (RFC 7517 §5): `{"keys":[ … ]}`. |
| `kid` | MAY be present. If present at the well-known URI it MUST equal the thumbprint (§5), so verifiers match `keyid` against `kid`. |
| `alg` | "Restricted to algorithms registered in the HTTP Signature Algorithms" registry. See §11.3: **we omit `alg`**. |
| Other members | The example uses `use: "sig"`, `nbf`, and `exp` (Unix seconds). These are optional JWK metadata. |
| Caching | Verifiers use normal HTTP caching (Cache-Control, ETag, and so on). Removing a key takes effect when caches expire. The draft example uses `max-age=86400`; the hosted-directories draft recommends minutes for hosted directories. **We use 300 s.** |
| Accessibility | Don't require Web Bot Auth or bot protection to fetch it. Support GET; HEAD, ETag, and conditional requests are encouraged. `Access-Control-Allow-Origin: *` is fine (App. C.2, C.11). |
| Content | Only keys actively used for signing (§7.4). Avoid logging personal data from directory requests. |
| Revocation | The protocol defines none (§5.5.2, §6.3). Removing the key from the directory is the only remedy, bounded by cache lifetime. |

Example (draft §5.5.1):

```
HTTP/1.1 200 OK
Content-Type: application/http-message-signatures-directory+json
Cache-Control: max-age=86400

{"keys":[{"kty":"OKP","crv":"Ed25519","kid":"NFcWBst6DXG-N35nHdzMrioWntdzNZghQSkjHNMMSjw","x":"JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs","use":"sig","nbf":1712793600,"exp":1715385600}]}
```

This example's `kid` (`NFcW…`) is **not** the thumbprint of its `x`, which is
`poqk…`. That breaks the draft's own "MUST equal the thumbprint" rule; it looks
like a leftover from older versions. App. E.2.3 uses the correct value. Treat
§5.5.1's example as illustrative only.

## 8. The directory response signature (draft App. B)

**What it covers: the request's `@authority` and the response body.** Any
change to the directory body invalidates every signature on it.

| Item | Requirement |
| --- | --- |
| Status | RECOMMENDED, not required. Since httpsig-protocol-02 it is "optional for directly resolved keys". It is needed only to prove a domain binding, or when key material is redistributed (§5.5.3). |
| Count | One signature per key, each made with that key (SHOULD). |
| Covered components (MUST) | `"@authority";req` (the authority the verifier used to fetch the directory) and `"content-digest"` (a response field, RFC 9530, over the response body bytes). |
| Params (MUST) | `created`, `expires`, `keyid` (thumbprint), `tag="http-message-signatures-directory"`. |
| Response headers | `Content-Digest`, `Signature-Input`, `Signature`, with one label per key. |
| Verifier | Must verify with a key from that same directory **and** check `Content-Digest` against the body. If either fails, the proof is invalid. MUST reject a signature whose `created` is in the future. Where evidence conflicts, the newer `created` wins (§4.4). |
| Lifetime | App. C.8: when a key set is redistributed, a short `expires` costs availability and gains nothing, so set it well beyond any republication interval. |

Worked example (draft App. E.2.3; verified in tests). The request is
`GET /.well-known/http-message-signatures-directory` with
`Host: signature-agent.test`. The body is exactly these bytes, with no
trailing newline:

```
{"keys":[{"kty":"OKP","crv":"Ed25519","kid":"poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U","x":"JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs","use":"sig"}]}
```

```
Content-Digest: sha-256=:CADMT2aBdV/rqQr/NIru64ERQkCobVvllA4V0fLFDu0=:
```

Signature base:

```
"@authority";req: signature-agent.test
"content-digest": sha-256=:CADMT2aBdV/rqQr/NIru64ERQkCobVvllA4V0fLFDu0=:
"@signature-params": ("@authority";req "content-digest");created=1735689600;expires=4889289600;keyid="poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U";tag="http-message-signatures-directory"
```

Response headers:

```
Content-Digest: sha-256=:CADMT2aBdV/rqQr/NIru64ERQkCobVvllA4V0fLFDu0=:
Signature-Input: binding=("@authority";req "content-digest");created=1735689600;expires=4889289600;keyid="poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U";tag="http-message-signatures-directory"
Signature: binding=:l6P8R67tm3kujAxbHWio7ll01qrEZ0dKD/WWlGhNYEmTnFZM8Wt0VQ9zqGfvo7T/UMkBxsigzChM1Gpz7gOVBg==:
```

**This changed recently.** directory-05 (March 2026) said the signature SHOULD
cover only `"@authority";req` plus time params, so one signature stayed valid
until it expired. httpsig-directory-00 (June 2026) added `content-digest`, and
httpsig-protocol-01 made it a MUST.

**What this means for Phase 3**, which is the build plan's "covers the body"
case:

- An attestation is valid only for the exact directory bytes it was computed
  over. Adding, revoking, or rotating *any* key in that directory, or changing
  JSON formatting or key order, invalidates *every* key's attestation.
- The server must therefore build the directory body deterministically
  (stable key order, stable member order, no whitespace). The SDK must sign
  those exact bytes: fetch the canonical body from AgentProof, check that it
  lists only keys the developer expects, compute `Content-Digest`, and sign.
  The server serves an attestation only if its `Content-Digest` equals the
  digest of the body currently being served.
- Revocation must never wait for re-attestation. When the body changes, the
  server serves the new body without the now-stale signatures until the SDK
  (`autoAttest`) uploads new ones. That is allowed, because the signatures are
  optional for directly resolved keys.
- The smaller the directory, the smaller the blast radius. With one directory
  per account, one agent's key change invalidates attestations for every agent
  on the account.
- The `"@authority";req` value is the exact host the verifier fetched, for
  example `acme.id.agentproof.dev`. The attestation is tied to that hostname,
  so changing the directory domain requires re-attesting.

## 9. May `Signature-Agent` contain a path?

**For `type=directory`, which is the default: no. It must be a bare origin.**

Draft §5.5: "directory — The member value MUST be the ASCII serialization of
an origin as defined in Section 6.2 of [RFC 6454], and a verifier MUST ignore a
member carrying anything else (an empty path `/` MAY be accepted though).
Resolve the HTTP Message Signatures Directory at the well-known URI … at that
origin."

- Valid: `"https://acme.id.agentproof.dev"`, `"https://example.com:8443"`.
  `"https://example.com/"` MAY be accepted.
- Invalid (verifier MUST ignore): `"https://id.agentproof.dev/acme"`, and any
  query or fragment.
- The identifier the verifier records is the well-known URL it fetched, one
  per origin (§5.5).
- `type=jwks_uri` *does* allow a path: "resolve the member value as a direct
  JWK Set URI". But (a) the identifier then names only a URL, not a domain,
  because nothing reserves the path to the host's operator (§5.5, §4.5);
  (b) directory response signatures and domain binding apply only to the
  directory type (App. B); and (c) verifier support for non-default types is
  new, since typed discovery only appeared in June 2026. A verifier that
  doesn't support a type MUST ignore the member.
- How we got here: arch-05 said the reference is "a FQDN". directory-05
  allowed any `https`, `http`, or `data` URI. httpsig-directory-00 introduced
  `type`. httpsig-protocol-01 restricted `directory` to an origin and required
  `https`.

**Recommendation for Phase 3:** give each account its own subdomain (for
example `<account-slug>.id.agentproof.dev`), serve
`/.well-known/http-message-signatures-directory` there, and send it as the
default `type=directory`. This needs a wildcard domain and certificate on
Vercel. draft-singh-webbotauth-hosted-directories §4 recommends exactly this
("per-tenant directory authorities"). It also explains why a shared origin is
bad: at least one deployed verifier treats the origin as the principal, so all
tenants on a shared origin would share one reputation. A path-based
`jwks_uri` fallback per account would be conformant, but weaker and less
widely supported.

## 10. What changed between versions

| Version | Change that matters to us |
| --- | --- |
| arch-04 (20 Oct 2025) | `Signature-Agent` became a Dictionary (was a bare string). `@target-uri` allowed instead of `@authority`. |
| arch-05 / directory-05 (2 Mar 2026) | Nonce SHOULD be 64 random bytes, described as "base64url". `Signature-Agent` was optional (RECOMMENDED). Directory signatures SHOULD cover `@authority;req` only. `Signature-Agent` could be `https`, `http`, or `data`. |
| httpsig-directory-00 (26 Jun 2026) | Added the `type` parameter (`directory`, `jwks_uri`, `cimd`). Added `content-digest` to directory response signatures. |
| httpsig-protocol-00 (26 Jun 2026) | Renamed from the architecture draft. Added SSRF guidance, multiple signatures, and typed discovery examples. |
| httpsig-protocol-01 (6 Aug 2026) | Folded in the directory draft. **`type=directory` value MUST be an origin; scheme MUST be https.** `kid` MUST equal the thumbprint. Keys are looked up by (URL, key) pair. Directory signature `content-digest` is MUST. Future-dated `created` is rejected. |
| httpsig-protocol-02 (18 Aug 2026) | **`Signature-Agent` REQUIRED on every signed request**, and each signature covers the member keyed by its own label. **Discovery: only 200 is accepted, no redirects.** Directory signatures optional for directly resolved keys. Nonce rules deferred to RFC 9421 (no 64-byte requirement). Added a signed directory test vector. |
| ietf-webbotauth-httpsig-protocol-00 (1 Sep 2026) | WG adoption. Editorial changes only compared with -02 (checked by diff). |

## 11. Ambiguities and how we resolve them

1. **Nonce encoding and length.** arch-05 said "base64url encoded random byte
   array … 64-byte" but its test vectors use standard base64 with `+`, `/`,
   and `=`. The current draft defines no format. The hosted-directories draft
   (§7.3) reports the same inconsistency. The reference implementation
   generates standard padded base64 of 64 bytes and accepts either canonical
   base64 or unpadded base64url. **Decision:** signers send 64 random bytes as
   standard padded base64. Our verifier accepts both encodings and doesn't
   require a nonce, but records and rejects repeats when one is present.
2. **Is the nonce required?** Not by the current draft. The build plan
   requires signers to send one. **Decision:** the SDK always sends one. The
   Phase 5 test endpoint reports a missing nonce as a warning, not a failure.
3. **`alg` in directory JWKs.** The draft restricts it to HTTP Signature
   Algorithm names (`ed25519`). Cloudflare's reference implementation emits
   `alg: "EdDSA"` and rejects an Ed25519 JWK whose `alg` is anything other
   than `EdDSA`. The draft's examples omit `alg`. **Decision:** omit `alg`
   from served JWKs. That satisfies both, and the key type already determines
   the algorithm. Flag this upstream.
4. **Dictionary vs legacy string `Signature-Agent`.** The draft says signers
   MUST use the dictionary form. The hosted-directories draft (§7.1, July 2026)
   reports that "at least one major deployed verifier" accepts only the string
   form. **Decision:** follow the draft (dictionary, and the member key equals
   the label). Our verifier accepts both. Phase 5 should test against the
   Cloudflare research endpoint and reassess.
5. **The `type` parameter.** It is optional and defaults to `directory`. The
   reference README includes `;type=directory`. Because the parameter becomes
   part of the covered member value (§2.1), it changes the signed bytes.
   **Decision:** omit it. That is equivalent, and it works with verifiers that
   predate typed discovery.
6. **`@authority` vs `@target-uri`.** Either satisfies the draft. The
   hosted-directories draft reports a deployed verifier that requires
   `@authority`. **Decision:** always cover `@authority`. `@method` and
   `@path` may be added later as an option.
7. **Clock skew.** Neither RFC 9421 nor the draft defines it. The reference
   verifier defaults to 0 s skew and a 24 h maximum age. **Decision:**
   60-second expiry for requests (build plan). The verifier allows 60 s of
   skew on both `created` (not in the future) and `expires`, and rejects
   windows longer than 24 h.
8. **Directory signature `alg` param.** App. B doesn't list it, and the E.2.3
   vector omits it. **Decision:** match the vector exactly (`created`,
   `expires`, `keyid`, `tag`), and accept `alg="ed25519"` if a verifier sends
   one.
9. **`Content-Digest` algorithm.** RFC 9530 allows `sha-256` and `sha-512`.
   The vector uses `sha-256`. **Decision:** produce `sha-256`; verify both.
10. **Directory example `kid` mismatch** (§7). The §5.5.1 example's `kid`
    isn't its thumbprint. **Decision:** follow the normative text: `kid` =
    thumbprint.
11. **Stale spec names in the build plan.** The plan names the expired
    individual drafts. **Decision:** implement draft-ietf-webbotauth-httpsig-protocol-00
    and treat the old drafts as history.
12. **Redirects and hosting.** Since verifiers MUST NOT follow redirects, a
    Vercel domain redirect (for example apex → `www`, or a trailing-slash
    redirect) on the directory host breaks discovery. **Decision:** Phase 3
    tests that the directory URL returns 200 directly on the production
    hostname.

## 12. Registration proof of possession (not standardized)

No spec defines how a hosted directory checks key possession at enrollment.
draft-singh-webbotauth-hosted-directories §5 and §9 recommend that the host
issue a fresh, unpredictable challenge, and that the tenant's signature bind
the **key thumbprint, the intended directory authority, and a timestamp**,
performed before first publication and repeated at rotation. The build plan's
Phase 2 message (nonce + account id + thumbprint) should also include the
directory authority and a purpose string, so a signature made for one context
can't be replayed in another. Phase 2 will define the exact bytes.

## 13. Reference implementations and our decision

What exists (checked 2026-09-29):

| Implementation | Notes |
| --- | --- |
| [`cloudflare/web-bot-auth`](https://github.com/cloudflare/web-bot-auth) | Maintained by the draft editor (Cloudflare). Apache-2.0. Last push 19 Sep 2026. TypeScript, Rust, Go (Caddy) packages, plus the JSON test vectors. |
| npm [`web-bot-auth`](https://www.npmjs.com/package/web-bot-auth) 0.2.0 | Published 31 Aug 2026. Web Bot Auth sign/verify policy, `Signature-Agent` parsing (dictionary + legacy, `type`), registry and card parsers. Depends on `http-message-sig`, `jsonwebkey-thumbprint`, and `structured-headers@2.0.3`. README still cites httpsig-protocol-00, but the code implements -02 behavior. Says "not audited". |
| npm [`http-message-sig`](https://www.npmjs.com/package/http-message-sig) 0.3.0 | General RFC 9421 implementation: requests *and* responses (with `;req`), dictionary members, WebCrypto signer and verifier. |
| npm [`jsonwebkey-thumbprint`](https://www.npmjs.com/package/jsonwebkey-thumbprint) 0.1.0 | RFC 7638. |
| Cloudflare research verifier | <https://http-message-signatures-example.research.cloudflare.com/debug>: a public endpoint to test signed requests against. |
| Others listed in draft App. F | Stytch Puppeteer example, Guzzle (PHP), Python scripts and plugins, Linzer (Ruby), Apache module (C). |

Differences between the reference implementation and the draft: it accepts
`http:` for `type=directory` (the draft requires `https`), it requires
`alg: "EdDSA"` on JWKs (§11.3), and its verifier defaults to 0 s clock skew.

**Decision:**

1. **SDK and CLI (Phase 4): write our own signer.** Use no runtime
   dependencies beyond WebCrypto / `node:crypto`, and mirror the reference
   byte for byte (component order, parameter order, nonce format). Reasons:
   - The SDK runs on the machine that holds the private key, so every
     dependency there is supply-chain risk to the thing we most need to
     protect.
   - The profile is narrow: two components, fixed parameters, one algorithm.
     The signature base is a few lines of code, and the vectors in §3.3 and
     §8 pin it down.
   - Signing with our own code and verifying with the reference gives Phase 4
     a genuinely independent check ("verifies with an independent verifier").
2. **Server-side verifier (Phase 5) and test suites: use `web-bot-auth` +
   `http-message-sig` as the parsing and verification core**, pinned to exact
   versions and wrapped behind one internal module. We write the directory
   fetcher (SSRF limits, no redirects, cache), the nonce store, and the
   step-by-step report ourselves. Reasons: the draft editor maintains them and
   they track draft changes quickly, the licence is Apache-2.0, they hold no
   user data and make no network calls, and the dependency tree is tiny.
3. **Directory response signatures (Phase 3/4): our own code in the SDK**,
   checked against the E.2.3 vector. The server verifies uploads with the
   Phase 5 verifier core.
4. **Conformance gate:** `tests/standards/vectors.test.ts` stays, and later
   phases add tests that run our signer's output through the reference
   verifier and the reference signer's output through ours. Before bumping a
   reference package version, re-run these tests.

Risks we accept: the reference packages are pre-1.0 (the API can change), have
a single maintainer, and are unaudited. Pinning, wrapping, and the conformance
tests contain that risk. Nothing is installed in Phase 0; Phase 4 and Phase 5
add the packages. They hold no user data, so under build plan rule 8 they
don't need approval, but they are listed in the Phase 0 report for visibility.
