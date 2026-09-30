import { mkdirSync } from "node:fs";
import path from "node:path";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import WebSocket from "ws";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL) || isLocalDevelopment();
}

function isLocalDevelopment() {
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
    if (process.env.DATABASE_URL) {
      // Both adapters implement Drizzle's PostgreSQL query API used by this
      // application. Keeping one exported type lets auth/domain services stay
      // independent of the physical database driver.
      neonConfig.webSocketConstructor = WebSocket;
      globalForDb.agentproofDb = Promise.resolve(
        drizzleNeon(
          new Pool({ connectionString: process.env.DATABASE_URL }),
          {
          schema,
          },
        ) as unknown as Db,
      );
    } else {
      const dataDir = path.join(process.cwd(), ".data", "pglite");
      mkdirSync(dataDir, { recursive: true });
      globalForDb.agentproofDb = createDb(dataDir);
    }
  }
  return globalForDb.agentproofDb;
}
