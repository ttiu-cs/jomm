/** Read-only, scoped context for seller agents. Costs are summarized; no secrets or PII. */
import type { DB } from "../db/client";
import { getContext } from "./context";
import { listDecisions, type StoredDecision } from "./pricing-service";
import { effectiveBounds } from "../pricing/economics";

export function summarizeDecision(d: StoredDecision) {
  const r = d.result;
  return {
    decisionId: d.id,
    status: d.status,
    storeHour: d.simHour,
    action: r.action,
    currentPriceCents: r.currentPriceCents,
    recommendedPriceCents: r.recommendedPriceCents,
    reasonCodes: r.reasonCodes,
    explanation: r.explanation,
    requiresApproval: r.requiresApproval,
    confidence: r.confidence,
    expected: {
      restOfDayUnitsSold: +r.projection.expectedUnitsSold.toFixed(1),
      restOfDayUnsold: +r.projection.expectedUnsold.toFixed(1),
      restOfDayContributionCents: Math.round(r.projection.expectedContributionCents),
      ifHeldContributionCents: Math.round(r.holdProjection.expectedContributionCents),
    },
    modelVersion: r.modelVersion,
    note: "Forecasts come from a configurable synthetic demand model, not learned from real data.",
  };
}

export function agentContext(db: DB, productId: string) {
  const c = getContext(db, productId);
  const b = effectiveBounds(c.policy, c.costs);
  return {
    sku: c.product.sku,
    name: c.product.name,
    currency: c.product.currency,
    storeOpen: c.storeOpen,
    storeHour: c.sim.current_hour,
    closeHour: c.product.closeHour,
    publishedPrice: c.published && { priceCents: c.published.priceCents, version: c.published.version },
    stock: { available: c.stock.available, onHand: c.stock.onHand },
    policy: {
      floorCents: b.floorCents,
      ceilingCents: b.ceilingCents,
      maxStepCents: c.policy.maxStepCents,
      cooldownMinutes: c.policy.cooldownMinutes,
      mode: c.policy.mode,
      agentPublishAllowed: c.policy.agentPublishAllowed,
    },
    confidence: c.confidence,
    sellThroughCalibration: +c.calibration.toFixed(3),
    recentDecisions: listDecisions(db, productId, c.sim.sim_day, 5).map(summarizeDecision),
  };
}
