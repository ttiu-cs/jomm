import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
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
  // Lightweight migrations for databases created by earlier versions.
  const cols = (db.prepare("PRAGMA table_info(price_quotes)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("origin")) db.exec("ALTER TABLE price_quotes ADD COLUMN origin TEXT NOT NULL DEFAULT 'PUBLISHED'");
  const negCols = (db.prepare("PRAGMA table_info(negotiations)").all() as { name: string }[]).map((c) => c.name);
  if (!negCols.includes("qty")) db.exec("ALTER TABLE negotiations ADD COLUMN qty INTEGER NOT NULL DEFAULT 1");
  return db;
}

/**
 * Default location is outside the project folder: the Next.js dev server reloads the page whenever
 * files inside the project change, and SQLite writes on every request.
 */
export function defaultDbPath(): string {
  return process.env.DATABASE_PATH || path.join(os.homedir(), ".retail-pricing-os", "pricing-os.db");
}

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getDb(): DB {
  if (!g.__pricingDb) {
    g.__pricingDb = openDb(defaultDbPath());
  }
  return g.__pricingDb;
}

/** Test hook: replace the singleton (e.g. with an in-memory database). */
export function setDb(db: DB | undefined) {
  g.__pricingDb = db;
}
