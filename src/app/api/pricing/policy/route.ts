import { handle, db, readJson, resolveProductId, MERCHANT } from "@/lib/server/http";
import { updatePolicy, type PolicyPatch } from "@/lib/server/pricing-service";
export const POST = handle(async (req: Request) => {
  const d = db();
  const b = await readJson<{ sku?: string; patch: PolicyPatch }>(req);
  return updatePolicy(d, resolveProductId(d, b.sku), b.patch ?? {}, MERCHANT);
});
