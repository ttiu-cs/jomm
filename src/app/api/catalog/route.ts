import { handle, db } from "@/lib/server/http";
import { listCatalog } from "@/lib/teach/catalog";
export const dynamic = "force-dynamic";
// Public, agent-readable catalog of taught shops. Never includes the owner's floor price.
export const GET = handle((req: Request) => {
  const u = new URL(req.url);
  const items = listCatalog(db(), u.searchParams.get("q") ?? undefined, u.searchParams.get("shop") ?? undefined);
  return {
    items,
    howToBuy: {
      ask: "POST /api/shops/{shopId}/items/{sku}/ask {question}",
      negotiate: "POST /api/negotiations {productId, qty, offerCents}  (price per unit, max 3 offers)",
      checkout: "POST /api/orders {quoteId} then PayPal checkout; a person approves the payment",
    },
  };
});
