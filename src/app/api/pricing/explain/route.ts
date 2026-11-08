import { handle, db, readJson, resolveProductId, MERCHANT } from "@/lib/server/http";
import { getDecision } from "@/lib/server/pricing-service";
import { getLlm } from "@/lib/agent/llm";
import { DomainError } from "@/lib/server/util";
// Optional LLM narration of an already-computed decision. Numbers come only from the stored decision.
export const POST = handle(async (req: Request) => {
  const b = await readJson<{ decisionId?: string }>(req);
  if (!b.decisionId) throw new DomainError("VALIDATION", "decisionId required", 422);
  const dec = getDecision(db(), b.decisionId);
  const r = dec.result;
  const facts = { action: r.action, current: r.currentPriceCents, recommended: r.recommendedPriceCents, reasons: r.reasonCodes, evidence: r.explanation, signals: r.signals, projection: { sold: r.projection.expectedUnitsSold, unsold: r.projection.expectedUnsold, contribution: r.projection.expectedContributionCents }, hold: { sold: r.holdProjection.expectedUnitsSold, unsold: r.holdProjection.expectedUnsold, contribution: r.holdProjection.expectedContributionCents }, confidence: r.confidence };
  const llm = getLlm();
  const text = llm ? await llm.completeText("You explain a retail price decision to a busy shop owner in 2-3 short sentences. Use ONLY the numbers given (cents → dollars). Do not suggest a different price. Do not claim the model learned or was retrained. Mention that demand figures are model forecasts.", JSON.stringify(facts)) : null;
  return { source: text ? "llm" : "deterministic", text: text ?? r.explanation.join(" "), decisionId: dec.id };
});
