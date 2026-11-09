import { handle, db, resolveProductId } from "@/lib/server/http";
import { sellerNegotiationView, listNegotiations } from "@/lib/server/negotiation";
export const dynamic = "force-dynamic";
// Seller-private: walk-away price and reasoning. Protected with merchant auth when MERCHANT_BASIC_AUTH is set.
export const GET = handle((req: Request) => {
  const d = db();
  const u = new URL(req.url);
  const productId = u.searchParams.get("productId");
  const pid = productId && d.prepare("SELECT 1 FROM products WHERE id=?").get(productId) ? productId : resolveProductId(d, u.searchParams.get("sku"));
  const qty = Math.max(1, Math.min(10, Number(u.searchParams.get("qty") ?? 1) || 1));
  return { ...sellerNegotiationView(d, pid, new Date(), qty), recent: listNegotiations(d, pid, 8) };
});
