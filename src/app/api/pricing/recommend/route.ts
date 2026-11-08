import { handle, db, readJson, resolveProductId, MERCHANT } from "@/lib/server/http";
import { computeRecommendation } from "@/lib/server/pricing-service";
export const POST = handle(async (req: Request) => {
  const d = db();
  const b = await readJson<{ sku?: string }>(req);
  return computeRecommendation(d, resolveProductId(d, b.sku), MERCHANT);
});
