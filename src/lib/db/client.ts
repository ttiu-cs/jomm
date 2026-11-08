import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";

export type DB = Database.Database;

const g = globalThis as unknown as { __pricingDb?: DB };

export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA_SQL);
  return db;
}

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getDb(): DB {
  if (!g.__pricingDb) {
    g.__pricingDb = openDb(process.env.DATABASE_PATH || path.join(process.cwd(), "data", "pricing-os.db"));
  }
  return g.__pricingDb;
}

/** Test hook: replace the singleton (e.g. with an in-memory database). */
export function setDb(db: DB | undefined) {
  g.__pricingDb = db;
}
