import {
  getTableColumns,
  getTableName,
  isTable,
  type Table,
} from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { GET as getDirectory } from "@/app/.well-known/http-message-signatures-directory/route";
import * as schema from "@/db/schema";
import {
  findPrivateKeyMaterial,
  PRIVATE_JWK_MEMBERS,
} from "../helpers/private-key-material";

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

// Every table in src/db/schema.ts is checked automatically.
describe("database tables have no column that could hold private keys", () => {
  const tables = (Object.values(schema) as unknown[]).filter(
    (value): value is Table => isTable(value),
  );

  it("finds the tables", () => {
    expect(tables.map(getTableName).sort()).toEqual([
      "account",
      "session",
      "user",
      "verificationToken",
    ]);
  });

  it.each(tables.map((table) => [getTableName(table), table] as const))(
    "%s",
    (_name, table) => {
      const suspicious = Object.values(getTableColumns(table))
        .map((column) => column.name)
        .filter(
          (name) =>
            PRIVATE_JWK_MEMBERS.includes(name.toLowerCase()) ||
            /private|secret|pem|jwk/i.test(name),
        );
      expect(suspicious).toEqual([]);
    },
  );
});
