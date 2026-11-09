import { handle, db } from "@/lib/server/http";
import { listCatalog } from "@/lib/teach/catalog";
export const dynamic = "force-dynamic";
// Product feed for AI shopping agents, in the spirit of PayPal Store Sync: what's for sale, price, stock,
// and the owner's own words. Never includes the owner's lowest price.
export const GET = handle((req: Request) => {
  const shop = new URL(req.url).searchParams.get("shop") ?? undefined;
  const items = listCatalog(db(), undefined, shop);
  return {
    object: "product_feed",
    items: items.map((i) => ({
      id: i.sku,
      product_id: i.productId,
      shop_id: i.shopId,
      merchant: i.shopName,
      title: i.name,
      description: i.facts.map((f) => f.replace(/[.!]?$/, ".")).join(" "),
      facts: i.facts,
      unit: i.unit,
      price: { amount: i.listPriceCents, currency: "usd" },
      availability: i.available > 0 ? "in_stock" : "out_of_stock",
      quantity_available: i.available,
      negotiable: i.negotiable,
      checkout: "POST /api/agentic/checkout_sessions",
    })),
  };
});
