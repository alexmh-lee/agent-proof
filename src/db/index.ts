import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;

// No hosted database has been chosen yet, so the app only has a database in
// local development (an embedded PGlite Postgres under .data/). Everywhere
// else, including Vercel, there is no database and sign-in is disabled.
export function isDatabaseConfigured(): boolean {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL;
}

// Pass no dataDir for an in-memory database (tests).
export async function createDb(dataDir?: string): Promise<Db> {
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  return db;
}

// Cached on globalThis so dev hot reloads don't open the data dir twice.
const globalForDb = globalThis as { agentproofDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!isDatabaseConfigured()) {
    throw new Error("No database is configured for this environment.");
  }
  if (!globalForDb.agentproofDb) {
    const dataDir = path.join(process.cwd(), ".data", "pglite");
    mkdirSync(dataDir, { recursive: true });
    globalForDb.agentproofDb = createDb(dataDir);
  }
  return globalForDb.agentproofDb;
}
