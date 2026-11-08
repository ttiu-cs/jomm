import { handle, db, readJson, resolveProductId } from "@/lib/server/http";
import { startNegotiation } from "@/lib/server/negotiation";
// Buyer-agent endpoint: open a negotiation with a first offer (one unit). Responses never reveal the seller's walk-away price.
export const POST = handle(async (req: Request) => {
  const d = db();
  const b = await readJson<{ sku?: string; offerCents?: number; buyer?: string }>(req);
  return startNegotiation(d, resolveProductId(d, b.sku), Number(b.offerCents), b.buyer ?? "buyer-agent");
});
