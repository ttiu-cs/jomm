import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDb, type DB } from "../db/client";
import { seedDemo } from "./sim-service";
import { DEMO, DomainError } from "./util";

/** Database handle; seeds the demo scenario on first use of an empty database. */
export function db(): DB {
  const d = getDb();
  const n = (d.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number }).n;
  if (n === 0) seedDemo(d);
  return d;
}

export const MERCHANT = { kind: "merchant" as const, id: "demo-merchant" };

export function resolveProductId(d: DB, sku?: string | null, storeId?: string | null): string {
  if (!sku) return DEMO.productId;
  const r = d.prepare("SELECT id FROM products WHERE sku=? AND (? IS NULL OR store_id=?)").get(sku, storeId ?? null, storeId ?? null) as { id: string } | undefined;
  if (!r) throw new DomainError("NOT_FOUND", `Unknown SKU ${sku}`, 404);
  return r.id;
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const text = await req.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new DomainError("INVALID_JSON", "Request body must be JSON.", 400);
  }
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown> | unknown) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      if (out instanceof Response) return out;
      return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      if (err instanceof DomainError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
      if (err instanceof ZodError) return NextResponse.json({ error: "VALIDATION", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 422 });
      console.error(err);
      return NextResponse.json({ error: "INTERNAL", message: "Unexpected server error" }, { status: 500 });
    }
  };
}
