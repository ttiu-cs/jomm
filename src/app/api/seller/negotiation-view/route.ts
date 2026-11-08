import { handle, db, resolveProductId } from "@/lib/server/http";
import { sellerNegotiationView, listNegotiations } from "@/lib/server/negotiation";
export const dynamic = "force-dynamic";
// Seller-private: walk-away price and reasoning. Protected with merchant auth when MERCHANT_BASIC_AUTH is set.
export const GET = handle((req: Request) => {
  const d = db();
  const pid = resolveProductId(d, new URL(req.url).searchParams.get("sku"));
  return { ...sellerNegotiationView(d, pid), recent: listNegotiations(d, pid, 8) };
});
