import { describe, expect, it } from "vitest";
import { GET } from "./route";

const forbiddenKeyNames = new Set([
  "d",
  "privateKey",
  "private_key",
  "privateJwk",
  "private_jwk",
  "pem",
]);

function collectForbiddenPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectForbiddenPaths(item, `${path}[${index}]`),
    );
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, item]) => {
    const itemPath = `${path}.${key}`;
    const ownMatch = forbiddenKeyNames.has(key) ? [itemPath] : [];
    return [...ownMatch, ...collectForbiddenPaths(item, itemPath)];
  });
}

describe("HTTP Message Signatures directory", () => {
  it("serves a JWKS using the registered directory media type", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/http-message-signatures-directory+json",
    );
    expect(body).toEqual({
      keys: [
        expect.objectContaining({
          kty: "OKP",
          crv: "Ed25519",
          x: expect.any(String),
          kid: expect.any(String),
        }),
      ],
    });
  });

  it("never exposes a private-key-shaped field", async () => {
    const body = await GET().json();

    expect(collectForbiddenPaths(body)).toEqual([]);
  });
});
