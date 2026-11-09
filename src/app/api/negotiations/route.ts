import { handle, db, readJson, resolveProductId } from "@/lib/server/http";
import { startNegotiation } from "@/lib/server/negotiation";
import { DomainError } from "@/lib/server/util";
// Buyer-agent endpoint: open a negotiation (price per unit). Responses never reveal the seller's walk-away price.
export const POST = handle(async (req: Request) => {
  const d = db();
  const b = await readJson<{ sku?: string; productId?: string; offerCents?: number; qty?: number; buyer?: string }>(req);
  let pid: string;
  if (b.productId) {
    if (!d.prepare("SELECT 1 FROM products WHERE id=?").get(b.productId)) throw new DomainError("NOT_FOUND", "Unknown product", 404);
    pid = b.productId;
  } else pid = resolveProductId(d, b.sku);
  return startNegotiation(d, pid, Number(b.offerCents), b.buyer ?? "buyer-agent", new Date(), Number(b.qty ?? 1));
});
