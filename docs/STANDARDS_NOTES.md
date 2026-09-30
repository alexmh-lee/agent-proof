# AgentProof standards notes

Checked: 2026-09-29

These notes distinguish normative RFC requirements from the moving Web Bot Auth
Internet-Draft. Recheck the working-group draft before implementing a new
phase.

## Sources and current status

1. [RFC 9421: HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421.html)
   is the stable base signature format.
2. [draft-ietf-webbotauth-httpsig-protocol-00](https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/)
   is the active Web Bot Auth working-group draft dated 2026-09-01 and
   expiring 2027-03-05.
3. The build plan names
   `draft-meunier-web-bot-auth-architecture` and
   `draft-meunier-http-message-signatures-directory`. Those are no longer the
   current implementation targets. The architecture draft was renamed into
   the protocol draft, and the separate directory material was folded into the
   protocol before it became the working-group draft.
4. [RFC 7638: JWK Thumbprint](https://www.rfc-editor.org/rfc/rfc7638.html)
   defines deterministic key thumbprints.
5. [RFC 8037: CFRG curves in JOSE](https://www.rfc-editor.org/rfc/rfc8037.html)
   defines Ed25519 public and private JWK members.
6. [RFC 8941: Structured Field Values for HTTP](https://www.rfc-editor.org/rfc/rfc8941.html)
   supplies the dictionary, inner-list, string, token, and byte-sequence
   serializations used by the headers.
7. [RFC 9530: Digest Fields](https://www.rfc-editor.org/rfc/rfc9530.html)
   defines `Content-Digest`, which the directory possession proof covers.

The Web Bot Auth document is not an RFC. Its header syntax changed in 2026, and
deployed verifiers may temporarily support different draft revisions.

## Request signature profile

### Required covered components

The working-group draft requires:

- at least one of `@authority` or `@target-uri`; and
- the `Signature-Agent` dictionary member whose key equals the signature
  label, represented as `"signature-agent";key="<label>"`.

The minimal covered-components inner list is therefore:

```text
("@authority" "signature-agent";key="sig1")
```

The draft recommends adding request-specific components to reduce replay
scope:

- `@method`;
- `@path`, or `@target-uri` when the exact query serialization is stable;
- selected `@query-param` components; and
- `content-digest` for a request body. No derived component covers a body
  automatically.

AgentProof's SDK should normally cover `@method`, `@authority`, `@path`, and
the matching `signature-agent` member. It should add and cover
`content-digest` whenever a body is present.

### Required signature parameters

The Web Bot Auth draft requires:

- `created`: integer UNIX seconds;
- `expires`: integer UNIX seconds;
- `keyid`: the base64url, no-padding SHA-256 JWK thumbprint;
- `tag`: the string `"web-bot-auth"`.

The draft recommends an expiry no more than 24 hours. AgentProof will use a
much shorter default such as 60 seconds because short lifetimes reduce replay
scope.

RFC 9421 defines, but the Web Bot Auth profile does not currently require:

- `alg`: the HTTP Message Signatures algorithm identifier. Current Ed25519
  examples use the string `"ed25519"`.
- `nonce`: a random string used with verifier-side replay detection.

The working-group draft explicitly says it adds no nonce requirement. An origin
may request one through `Accept-Signature`. AgentProof will still emit a random
nonce by default as a product security policy, and the Phase 5 verifier will
enforce one-time use within the signature lifetime. This is stricter than the
draft, not a claim about its normative requirements.

### Exact header shape

New signers must send `Signature-Agent` as an RFC 8941 Dictionary. The older
bare String form is legacy-only.

```http
Signature-Agent: sig1="https://agent.example"
Signature-Input: sig1=("@method" "@authority" "@path" "signature-agent";key="sig1");created=1790630000;expires=1790630060;keyid="THUMBPRINT";alg="ed25519";nonce="RANDOM";tag="web-bot-auth"
Signature: sig1=:STANDARD_BASE64_SIGNATURE:
```

Important details:

- `sig1` is an RFC 8941 dictionary key and the same label is used in all three
  fields.
- `Signature-Agent` member values are Structured Field Strings, hence the
  quotes.
- The `signature-agent` covered component selects the matching dictionary
  member with `;key="sig1"`.
- `Signature` is an RFC 8941 Byte Sequence: standard base64, including padding
  when present, surrounded by colons. It is not base64url.
- Parameter ordering is carried into the signature base. A verifier uses the
  received `Signature-Input` serialization; a signer must serialize the same
  inner list and parameters into `@signature-params`.

### Signature base construction

RFC 9421 constructs one ASCII line per covered component in declared order,
followed by `@signature-params`. Lines are separated by LF (`0x0A`), and there
is no trailing LF after the final line.

For the header example above, the conceptual base is:

```text
"@method": GET
"@authority": api.example
"@path": /v1/items
"signature-agent";key="sig1": "https://agent.example"
"@signature-params": ("@method" "@authority" "@path" "signature-agent";key="sig1");created=1790630000;expires=1790630060;keyid="THUMBPRINT";alg="ed25519";nonce="RANDOM";tag="web-bot-auth"
```

Sign the UTF-8 bytes of that base with Ed25519. Put the resulting signature
bytes in the `Signature` dictionary member as an RFC 8941 Byte Sequence.

## `Signature-Agent` discovery

`Signature-Agent` is an RFC 8941 Dictionary. Every member value must be an
HTTPS URI and can carry a `type` token.

The current draft defines:

### `directory` (default)

```http
Signature-Agent: sig1="https://account.id.agentproof.dev"
```

The value must be an ASCII origin serialization. A bare `/` may be accepted,
but an arbitrary path is not allowed. The verifier fetches:

```text
https://account.id.agentproof.dev/.well-known/http-message-signatures-directory
```

The resulting identifier is that well-known URL. This is the only discovery
mode that uses the reserved path to bind the key set to the domain operator.

**Phase 3 consequence:** a per-account default directory requires a distinct
origin per account, normally wildcard subdomains. A URL such as
`https://id.agentproof.dev/account-name` is not valid for this default type.

### `jwks_uri`

```http
Signature-Agent: sig1="https://id.example/keys/account.json";type=jwks_uri
```

The verifier fetches that exact JWKS URL. A path is allowed, but the path is
not domain-control proof in the same way as the well-known directory.

### `cimd`

```http
Signature-Agent: sig1="https://id.example/client-metadata";type=cimd
```

The verifier fetches a Client ID Metadata Document, which points to inline
`jwks` or a `jwks_uri`.

For all discovery types, successful resolution requires HTTP 200. Verifiers
must not automatically follow redirects. Query and fragment are discarded
from the resulting identifier, although a query can still be used for the
actual `jwks_uri` or `cimd` fetch.

## Directory format

The well-known path is:

```text
/.well-known/http-message-signatures-directory
```

Requirements:

- HTTPS;
- HTTP 200;
- `Content-Type: application/http-message-signatures-directory+json`;
- body is a JSON Web Key Set with a top-level `keys` array;
- `alg`, when present, must be an algorithm registered in the IANA HTTP
  Message Signatures Algorithms registry; and
- a key at the well-known directory may have `kid`, but if present it must
  equal that key's RFC 7638 SHA-256 thumbprint.

Minimal Ed25519 example:

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "BASE64URL_PUBLIC_KEY",
      "kid": "BASE64URL_SHA256_THUMBPRINT",
      "use": "sig"
    }
  ]
}
```

The current AgentProof placeholder's `alg: "EdDSA"` should not be copied into
the database-backed implementation. The draft's Ed25519 request examples use
the HTTP signature algorithm name `ed25519`, while its directory example omits
`alg`. We will omit `alg` from stored public JWKs unless the selected reference
library confirms an interoperable registered value.

`Cache-Control` is operational rather than a fixed draft value. AgentProof
plans `max-age=300` so key removal propagates within a documented five-minute
cache window.

## Ed25519 JWK and thumbprint

RFC 8037 public Ed25519 JWK:

```json
{"kty":"OKP","crv":"Ed25519","x":"BASE64URL_PUBLIC_KEY"}
```

- `kty` must be `OKP`.
- `crv` must be `Ed25519`.
- `x` is the 32-byte public key encoded with base64url and no padding.
- `d` is private key material and must never appear in a public JWK, request to
  AgentProof, database row, API response, or log.

RFC 7638 thumbprint procedure:

1. Construct exactly the required public members in Unicode lexicographic
   member-name order, with no whitespace:

   ```text
   {"crv":"Ed25519","kty":"OKP","x":"BASE64URL_PUBLIC_KEY"}
   ```

2. UTF-8 encode that JSON.
3. SHA-256 hash those bytes.
4. Base64url encode the digest without `=` padding.

The result is the Web Bot Auth `keyid`, and for a well-known directory it is
also `kid` when `kid` is present.

## Signed directory response

The draft recommends one HTTP Message Signature per listed key as
proof-of-possession. Each signature must cover:

- `"@authority";req`: the authority from the request that fetched the
  directory, with the RFC 9421 `req` flag; and
- `"content-digest"`: the RFC 9530 digest of the exact response body bytes.

It requires these parameters for each directory proof:

- `created`;
- `expires`;
- `keyid`: the signing key's thumbprint;
- `tag="http-message-signatures-directory"`.

Conceptual response:

```http
Content-Digest: sha-256=:STANDARD_BASE64_SHA256:
Signature-Input: binding=("@authority";req "content-digest");created=1790630000;expires=1790716400;keyid="THUMBPRINT";tag="http-message-signatures-directory"
Signature: binding=:STANDARD_BASE64_SIGNATURE:
```

Conceptual signature base:

```text
"@authority";req: account.id.agentproof.dev
"content-digest": sha-256=:STANDARD_BASE64_SHA256:
"@signature-params": ("@authority";req "content-digest");created=1790630000;expires=1790716400;keyid="THUMBPRINT";tag="http-message-signatures-directory"
```

The response body is covered indirectly by `Content-Digest`. Therefore **every
byte change to the serialized JWKS invalidates all prior directory
attestations**. Adding, rotating, expiring, or revoking any key requires:

1. deterministically serialize the new directory body;
2. have each listed key holder sign the new body digest and account authority
   locally; and
3. upload those attestations before the server can present complete
   proof-of-possession for the new directory version.

Phase 3 must version the exact body bytes or their digest with each uploaded
attestation. An attestation over one serialization must never be attached to
another.

## Reference implementation decision

[cloudflare/web-bot-auth](https://github.com/cloudflare/web-bot-auth) is active,
Apache-2.0 licensed, and was updated in September 2026. At the time of this
audit:

- npm `web-bot-auth` is `0.2.0`;
- npm `http-message-sig` is `0.3.0`; and
- npm `jsonwebkey-thumbprint` is `0.1.0`.

Decision for Phases 4 and 5:

- use Cloudflare's TypeScript packages for RFC 9421 parsing, serialization,
  signing, verification, and thumbprints rather than creating a second parser;
- wrap them behind AgentProof-owned interfaces so draft changes do not spread
  through product code;
- pin exact versions;
- test against both RFC/draft vectors and an independent invocation of the
  reference implementation; and
- keep our own SSRF, freshness, replay, account, and key-custody policy around
  the library.

We do not add these runtime dependencies in Phase 0 because there is no
production signing or verification path yet.

## Known draft compatibility risk

The breaking 2026 change is `Signature-Agent` from a bare Structured Field
String to a Dictionary keyed by signature label. Signers must emit the
dictionary form. Verifiers may accept the old string form during migration.
Some vendor documentation and production implementations may still reflect an
older individual draft.

AgentProof should:

- generate only the current dictionary form;
- maintain explicit compatibility fixtures for supported verifier vendors;
- expose draft/library versions in diagnostics; and
- never silently infer a discovery type from URL shape or response media type.
