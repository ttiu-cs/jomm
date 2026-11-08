/** Reset and seed the demo database: one store, one salad SKU, 100 units, 7 days of labeled synthetic history. */
import path from "node:path";
import { openDb } from "../src/lib/db/client";
import { seedDemo } from "../src/lib/server/sim-service";

const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "pricing-os.db");
const args = process.argv.slice(2);
const db = openDb(file);
seedDemo(db, { seed: Number(process.env.SEED ?? 42), withHistory: !args.includes("--cold-start") });
console.log(`Seeded ${file}${args.includes("--cold-start") ? " (cold start: no history, low confidence)" : ""}`);
