import { handle, db, readJson, resolveProductId, MERCHANT } from "@/lib/server/http";
import { draftPolicyFromText } from "@/lib/agent/policy-intent";
import { getContext } from "@/lib/server/context";
import { DomainError } from "@/lib/server/util";
// Returns a DRAFT only. Applying requires POST /api/pricing/policy by the merchant.
export const POST = handle(async (req: Request) => {
  const d = db();
  const b = await readJson<{ sku?: string; text?: string }>(req);
  if (!b.text || b.text.length > 500) throw new DomainError("VALIDATION", "text (≤500 chars) required", 422);
  return draftPolicyFromText(b.text, getContext(d, resolveProductId(d, b.sku)).policy);
});
