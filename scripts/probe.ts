import { recommendPrice } from "../src/lib/pricing/optimizer";
import { simulateDay, compareStrategies, sensitivityGrid } from "../src/lib/pricing/simulator";
import * as S from "../src/lib/pricing/scenario";
const cfg = { seed: 42, openHour: S.OPEN_HOUR, closeHour: S.CLOSE_HOUR, openingStock: 100, costs: S.DEFAULT_COSTS, policy: { ...S.DEFAULT_POLICY, mode: "autopilot" as const }, model: S.DEFAULT_DEMAND_MODEL, truth: S.DEFAULT_DEMAND_MODEL, ctx: { weather: "cloudy" as const, event: "none" as const, demandMultiplier: 1 } };
let t = Date.now();
const d = recommendPrice({ state: { hour: 9, openHour: 9, closeHour: 20, availableStock: 100, currentPriceCents: 700, minutesSinceLastChange: null, confidence: "medium" }, policy: S.DEFAULT_POLICY, costs: S.DEFAULT_COSTS, model: S.DEFAULT_DEMAND_MODEL, ctx: S.DEFAULT_CONTEXT });
console.log(Date.now() - t, "ms", d.action, d.recommendedPriceCents, d.unconstrainedBestCents, d.reasonCodes, d.explanation, d.projection.pricePath.map(x=>x.priceCents).join(","), d.projection.expectedUnsold.toFixed(1), d.holdProjection.expectedUnsold.toFixed(1));
t = Date.now();
for (const strat of [{ kind: "fixed", priceCents: 700 }, { kind: "adaptive", startPriceCents: 700 }] as const) {
  const r = simulateDay(cfg, strat);
  console.log(strat.kind, r.hours.map(h => `${h.hour}:${h.priceCents}/${h.sold}${h.action?.[0] ?? ""}`).join(" "), JSON.stringify(r.report));
}
console.log(Date.now() - t, "ms day pair");
t = Date.now();
const c = compareStrategies(cfg, 700, Array.from({ length: 20 }, (_, i) => i + 1));
console.log(Date.now() - t, "ms", c.contributionLiftPct.toFixed(1), c.adaptiveWinsShare, c.fixed.unsold, c.adaptive.unsold);
t = Date.now();
for (const r of sensitivityGrid(cfg, 700, [1,2,3,4,5,6,7,8])) console.log(r.label, r.summary.contributionLiftPct.toFixed(1), r.summary.adaptiveWinsShare);
console.log(Date.now() - t, "ms grid");
