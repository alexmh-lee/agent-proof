import { createHash, createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";

// Published test vectors that docs/STANDARDS_NOTES.md relies on. These use
// only public keys and Node's built-in crypto, so they check our reading of
// the specs independently of any AgentProof or third-party signing code.

const RFC9421_ED25519_X = "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs";
const RFC9421_ED25519_THUMBPRINT = "poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U";

function ed25519Thumbprint(x: string) {
  const canonical = JSON.stringify({ crv: "Ed25519", kty: "OKP", x });
  return createHash("sha256").update(canonical).digest("base64url");
}

function verifyEd25519(x: string, signatureBase: string, signature: string) {
  const key = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x },
    format: "jwk",
  });
  return verify(
    null,
    Buffer.from(signatureBase, "ascii"),
    key,
    Buffer.from(signature, "base64"),
  );
}

describe("RFC 7638 / RFC 8037 JWK thumbprints", () => {
  it("matches RFC 8037 Appendix A.3", () => {
    expect(ed25519Thumbprint("11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo")).toBe(
      "kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k",
    );
  });

  it("matches the keyid used for the RFC 9421 Ed25519 test key in the Web Bot Auth draft", () => {
    expect(ed25519Thumbprint(RFC9421_ED25519_X)).toBe(RFC9421_ED25519_THUMBPRINT);
  });

  it("uses lexicographic member order with no whitespace", () => {
    const canonical = JSON.stringify({ crv: "Ed25519", kty: "OKP", x: "abc" });
    expect(canonical).toBe('{"crv":"Ed25519","kty":"OKP","x":"abc"}');
  });
});

describe("RFC 9421 Appendix B.2.6 (ed25519 request signature)", () => {
  it("verifies the published signature over the published signature base", () => {
    const signatureBase = [
      '"date": Tue, 20 Apr 2021 02:07:55 GMT',
      '"@method": POST',
      '"@path": /foo',
      '"@authority": example.com',
      '"content-type": application/json',
      '"content-length": 18',
      '"@signature-params": ("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"',
    ].join("\n");

    expect(
      verifyEd25519(
        RFC9421_ED25519_X,
        signatureBase,
        "wqcAqbmYJ2ji2glfAMaRy4gruYYnx2nEFN2HN6jrnDnQCK1u02Gb04v9EDgwUPiu4A0w6vuQv5lIp5WPpBKRCw==",
      ),
    ).toBe(true);
  });

  it("fails when any byte of the signature base changes", () => {
    const tampered = [
      '"date": Tue, 20 Apr 2021 02:07:55 GMT',
      '"@method": GET',
      '"@path": /foo',
      '"@authority": example.com',
      '"content-type": application/json',
      '"content-length": 18',
      '"@signature-params": ("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"',
    ].join("\n");

    expect(
      verifyEd25519(
        RFC9421_ED25519_X,
        tampered,
        "wqcAqbmYJ2ji2glfAMaRy4gruYYnx2nEFN2HN6jrnDnQCK1u02Gb04v9EDgwUPiu4A0w6vuQv5lIp5WPpBKRCw==",
      ),
    ).toBe(false);
  });
});

describe("draft-ietf-webbotauth-httpsig-protocol-00 Appendix E.2", () => {
  it("E.2.1: verifies a request signature covering a Signature-Agent dictionary member", () => {
    const signatureBase = [
      '"@authority": example.com',
      '"signature-agent";key="agent2": "https://signature-agent.test"',
      '"@signature-params": ("@authority" "signature-agent";key="agent2");created=1735689600;keyid="poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U";alg="ed25519";expires=4889289600;nonce="n9p433xm+NJ3ph3upfBIGmsuwHw387YV7Q/F+6BSpGCVjYCqQw6rznNA8PVVLySrAWsv0hQtFioQb6E1YsauiA==";tag="web-bot-auth"',
    ].join("\n");

    expect(
      verifyEd25519(
        RFC9421_ED25519_X,
        signatureBase,
        "RdNFx5Bj6au3YgAMQL/RzmUlZE8QZLIaXGRpw985hWnwPfMxT228NMk6ehRS1PSl4e8PhbNZACSanGdhEwYCCg==",
      ),
    ).toBe(true);
  });

  it("E.2.2: verifies the legacy sf-string Signature-Agent form", () => {
    const signatureBase = [
      '"@authority": example.com',
      '"signature-agent": "https://signature-agent.test"',
      '"@signature-params": ("@authority" "signature-agent");created=1735689600;keyid="poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U";alg="ed25519";expires=1735693200;nonce="e8N7S2MFd/qrd6T2R3tdfAuuANngKI7LFtKYI/vowzk4lAZYadIX6wW25MwG7DCT9RUKAJ0qVkU0mEeLElW1qg==";tag="web-bot-auth"',
    ].join("\n");

    expect(
      verifyEd25519(
        RFC9421_ED25519_X,
        signatureBase,
        "jdq0SqOwHdyHr9+r5jw3iYZH6aNGKijYp/EstF4RQTQdi5N5YYKrD+mCT1HA1nZDsi6nJKuHxUi/5Syp3rLWBA==",
      ),
    ).toBe(true);
  });

  it("E.2.3: signed directory response covers @authority;req and the body's Content-Digest", () => {
    const body = `{"keys":[{"kty":"OKP","crv":"Ed25519","kid":"${RFC9421_ED25519_THUMBPRINT}","x":"${RFC9421_ED25519_X}","use":"sig"}]}`;
    const contentDigest = `sha-256=:${createHash("sha256").update(body).digest("base64")}:`;

    expect(contentDigest).toBe("sha-256=:CADMT2aBdV/rqQr/NIru64ERQkCobVvllA4V0fLFDu0=:");

    const signatureBase = [
      '"@authority";req: signature-agent.test',
      `"content-digest": ${contentDigest}`,
      `"@signature-params": ("@authority";req "content-digest");created=1735689600;expires=4889289600;keyid="${RFC9421_ED25519_THUMBPRINT}";tag="http-message-signatures-directory"`,
    ].join("\n");

    expect(
      verifyEd25519(
        RFC9421_ED25519_X,
        signatureBase,
        "l6P8R67tm3kujAxbHWio7ll01qrEZ0dKD/WWlGhNYEmTnFZM8Wt0VQ9zqGfvo7T/UMkBxsigzChM1Gpz7gOVBg==",
      ),
    ).toBe(true);
  });

  it("E.2.3: any change to the directory body invalidates the directory signature", () => {
    const changedBody = `{"keys":[]}`;
    const contentDigest = `sha-256=:${createHash("sha256").update(changedBody).digest("base64")}:`;
    const signatureBase = [
      '"@authority";req: signature-agent.test',
      `"content-digest": ${contentDigest}`,
      `"@signature-params": ("@authority";req "content-digest");created=1735689600;expires=4889289600;keyid="${RFC9421_ED25519_THUMBPRINT}";tag="http-message-signatures-directory"`,
    ].join("\n");

    expect(
      verifyEd25519(
        RFC9421_ED25519_X,
        signatureBase,
        "l6P8R67tm3kujAxbHWio7ll01qrEZ0dKD/WWlGhNYEmTnFZM8Wt0VQ9zqGfvo7T/UMkBxsigzChM1Gpz7gOVBg==",
      ),
    ).toBe(false);
  });
});
