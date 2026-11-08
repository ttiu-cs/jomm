import { handle, db, readJson, resolveProductId, MERCHANT } from "@/lib/server/http";
import { rejectDecision } from "@/lib/server/pricing-service";
import { DomainError } from "@/lib/server/util";
export const POST = handle(async (req: Request) => {
  const b = await readJson<{ decisionId?: string }>(req);
  if (!b.decisionId) throw new DomainError("VALIDATION", "decisionId required", 422);
  rejectDecision(db(), b.decisionId, MERCHANT);
  return { ok: true };
});
