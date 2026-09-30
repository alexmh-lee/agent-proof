import { describe, expect, it } from "vitest";
import { GET as getDirectory } from "@/app/.well-known/http-message-signatures-directory/route";
import { findPrivateKeyMaterial } from "../helpers/private-key-material";

describe("findPrivateKeyMaterial", () => {
  it("flags a private JWK member anywhere in a payload", () => {
    const payload = {
      agent: { name: "scout" },
      keys: [{ kty: "OKP", crv: "Ed25519", x: "abc", d: "secret" }],
    };
    expect(findPrivateKeyMaterial(payload)).toEqual(["$.keys[0].d"]);
  });

  it("flags PEM-encoded private keys in string values", () => {
    const payload = {
      key: "-----BEGIN PRIVATE KEY-----\nMC4CAQAw\n-----END PRIVATE KEY-----",
    };
    expect(findPrivateKeyMaterial(payload)).toEqual(["$.key"]);
  });

  it("accepts a public-only Ed25519 JWK", () => {
    expect(
      findPrivateKeyMaterial({ kty: "OKP", crv: "Ed25519", x: "abc", kid: "t" }),
    ).toEqual([]);
  });
});

// Every API response that returns key data belongs in this list. Later
// phases add database tables and new endpoints here.
describe("API responses contain no private key material", () => {
  it("GET /.well-known/http-message-signatures-directory", async () => {
    const response = getDirectory();
    const body = await response.json();

    expect(findPrivateKeyMaterial(body)).toEqual([]);
  });
});
