import { handle, db, readJson, resolveProductId } from "@/lib/server/http";
import { createQuote } from "@/lib/server/commerce";
// Server-issued, immutable, expiring price quote. Client never supplies a price.
export const POST = handle(async (req: Request) => {
  const d = db();
  const b = await readJson<{ sku?: string; qty?: number }>(req);
  const q = createQuote(d, resolveProductId(d, b.sku), Number(b.qty ?? 1));
  return { id: q.id, unitPriceCents: q.unit_price_cents, qty: q.qty, totalCents: q.total_cents, currency: q.currency, priceVersion: q.price_version, expiresAt: q.expires_at, status: q.status };
});
