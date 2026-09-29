import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/.well-known/http-message-signatures-directory/route";

// Characterizes the hardcoded demo directory so Phase 0 can show no product
// behavior changed. Phase 3 replaces the stub and this test with it.
describe("hardcoded directory stub", () => {
  it("serves the directory media type with CORS and a 300 second cache", () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/http-message-signatures-directory+json",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=300",
    );
  });

  it("lists one Ed25519 key whose kid is its RFC 7638 thumbprint", async () => {
    const { keys } = await GET().json();

    expect(keys).toHaveLength(1);
    const [key] = keys;
    expect(key.kty).toBe("OKP");
    expect(key.crv).toBe("Ed25519");

    const thumbprint = createHash("sha256")
      .update(JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x }))
      .digest("base64url");
    expect(key.kid).toBe(thumbprint);
  });
});
