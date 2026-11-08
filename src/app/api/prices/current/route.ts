import { handle, db, resolveProductId } from "@/lib/server/http";
import { getContext } from "@/lib/server/context";
export const dynamic = "force-dynamic";
export const GET = handle((req: Request) => {
  const d = db();
  const u = new URL(req.url);
  const c = getContext(d, resolveProductId(d, u.searchParams.get("sku"), u.searchParams.get("storeId")));
  return { sku: c.product.sku, currency: c.product.currency, storeOpen: c.storeOpen, ...c.published };
});
