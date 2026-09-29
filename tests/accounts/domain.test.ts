import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { users } from "@/db/schema";
import {
  checkDomainVerification,
  normalizeDomain,
  startDomainVerification,
  type ResolveTxt,
} from "@/lib/domain";

let db: Db;
let userId: string;

function dnsWith(records: Record<string, string[][]>): ResolveTxt {
  return async (hostname) => {
    if (!records[hostname]) {
      throw Object.assign(new Error("queryTxt ENOTFOUND"), { code: "ENOTFOUND" });
    }
    return records[hostname];
  };
}

async function trustLevel() {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user.trustLevel;
}

beforeEach(async () => {
  db = await createDb();
  [{ id: userId }] = await db
    .insert(users)
    .values({ email: "dev@example.com", trustLevel: "email_verified" })
    .returning({ id: users.id });
});

describe("domain verification", () => {
  it("succeeds when the TXT record matches", async () => {
    const claim = await startDomainVerification(db, userId, "Example.COM.");
    if ("error" in claim) throw new Error(claim.error);
    expect(claim.domain).toBe("example.com");

    const result = await checkDomainVerification(
      db,
      userId,
      dnsWith({
        "_agentproof.example.com": [
          ["v=spf1 -all"],
          [`agentproof-verify=${claim.token}`],
        ],
      }),
    );

    expect(result).toEqual({ verified: true });
    expect(await trustLevel()).toBe("domain_verified");
  });

  it("fails when there is no TXT record", async () => {
    await startDomainVerification(db, userId, "example.com");
    const result = await checkDomainVerification(db, userId, dnsWith({}));
    expect(result.verified).toBe(false);
    expect(await trustLevel()).toBe("email_verified");
  });

  it("fails when the TXT record has the wrong token", async () => {
    await startDomainVerification(db, userId, "example.com");
    const result = await checkDomainVerification(
      db,
      userId,
      dnsWith({ "_agentproof.example.com": [["agentproof-verify=wrong"]] }),
    );
    expect(result.verified).toBe(false);
    expect(await trustLevel()).toBe("email_verified");
  });

  it("rejects values that are not domain names", () => {
    for (const input of ["", "localhost", "10.0.0.1", "exa mple.com", "-a.com"]) {
      expect(normalizeDomain(input)).toBeNull();
    }
  });
});
