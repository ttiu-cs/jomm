import { describe, expect, it } from "vitest";
import { recommendPrice, type OptimizerInput } from "@/lib/pricing/optimizer";
import { effectiveBounds, fullCostBreakEvenCents, profitReport, unitNetCents } from "@/lib/pricing/economics";
import { DEFAULT_CONTEXT, DEFAULT_COSTS, DEFAULT_DEMAND_MODEL, DEFAULT_POLICY } from "@/lib/pricing/scenario";
import type { PricingPolicy } from "@/lib/pricing/types";

const freePolicy: PricingPolicy = { ...DEFAULT_POLICY, floorCents: 200, ceilingCents: 1400, maxStepCents: 1200, cooldownMinutes: 0, minGainCents: 0 };

function input(over: Partial<OptimizerInput["state"]> = {}, policy: PricingPolicy = freePolicy, extra: Partial<OptimizerInput> = {}): OptimizerInput {
  return {
    state: { hour: 9, openHour: 9, closeHour: 20, availableStock: 100, currentPriceCents: 700, minutesSinceLastChange: null, confidence: "medium", ...over },
    policy,
    costs: DEFAULT_COSTS,
    model: DEFAULT_DEMAND_MODEL,
    ctx: DEFAULT_CONTEXT,
    ...extra,
  };
}

describe("unit economics", () => {
  it("computes incremental fee math and excludes sunk production cost from contribution", () => {
    // 700 - 10 fulfillment - (3.49% * 700 + 49) fee
    expect(unitNetCents(DEFAULT_COSTS, 700)).toBeCloseTo(700 - 10 - 24.43 - 49, 6);
    const r = profitReport(DEFAULT_COSTS, [{ priceCents: 700, qty: 10 }], 100, 90);
    expect(r.revenueCents).toBe(7000);
    expect(r.contributionCents).toBe(Math.round(7000 - 244.3 - 490 - 100 - 90 * 25));
    expect(r.productionCogsCents).toBe(100 * 320);
    expect(r.accountingProfitCents).toBe(r.contributionCents - 32000);
  });

  it("raises the effective floor to full-cost break-even when below-cost selling is not permitted", () => {
    expect(fullCostBreakEvenCents(DEFAULT_COSTS)).toBeCloseTo(379 / 0.9651, 3);
    const b = effectiveBounds({ ...freePolicy, allowBelowFullCost: false }, DEFAULT_COSTS);
    expect(b.floorCents).toBe(400);
    expect(b.belowCostBlocked).toBe(true);
  });
});

describe("pricing optimizer", () => {
  it("lowers the optimal price when the sell-by deadline is tighter, and that raises expected contribution", () => {
    const loose = recommendPrice(input({ hour: 15, availableStock: 45, closeHour: 20 }));
    const tight = recommendPrice(input({ hour: 15, availableStock: 45, closeHour: 17 }));
    expect(tight.unconstrainedBestCents).toBeLessThan(loose.unconstrainedBestCents);
    expect(tight.projection.expectedContributionCents).toBeGreaterThan(tight.holdProjection.expectedContributionCents);
    expect(tight.reasonCodes).toContain("EXPIRY_RISK");
  });

  it("justifies a higher peak price only when the modeled price response supports it", () => {
    const abundant = { availableStock: 400 };
    const peak = recommendPrice(input({ hour: 12, ...abundant }));
    const offPeak = recommendPrice(input({ hour: 15, ...abundant }));
    expect(peak.unconstrainedBestCents).toBeGreaterThan(offPeak.unconstrainedBestCents);

    // Same traffic peak but no change in price sensitivity: more shoppers alone do not justify a higher price.
    const flatModel = { ...DEFAULT_DEMAND_MODEL, peakSensitivityMultiplier: 1 };
    const peakFlat = recommendPrice(input({ hour: 12, ...abundant }, freePolicy, { model: flatModel }));
    const offFlat = recommendPrice(input({ hour: 15, ...abundant }, freePolicy, { model: flatModel }));
    expect(Math.abs(peakFlat.unconstrainedBestCents - offFlat.unconstrainedBestCents)).toBeLessThanOrEqual(25);
  });

  it("prices scarce stock higher than abundant stock", () => {
    const scarce = recommendPrice(input({ hour: 11, availableStock: 25 }));
    const plenty = recommendPrice(input({ hour: 11, availableStock: 150 }));
    expect(scarce.recommendedPriceCents).toBeGreaterThan(plenty.recommendedPriceCents);
    expect(scarce.reasonCodes).toContain("LOW_STOCK");
  });

  it("holds when expected gain is below threshold", () => {
    const d = recommendPrice(input({ hour: 15, availableStock: 30 }, { ...freePolicy, minGainCents: 100000 }));
    expect(d.action).toBe("HOLD");
    expect(d.recommendedPriceCents).toBe(700);
    expect(d.reasonCodes).toContain("HOLD_LOW_GAIN");
  });

  it("holds during cooldown and outside allowed hours", () => {
    const cool = recommendPrice(input({ hour: 12, availableStock: 30, minutesSinceLastChange: 20 }, { ...freePolicy, cooldownMinutes: 60 }));
    expect(cool.action).toBe("HOLD");
    expect(cool.reasonCodes).toEqual(expect.arrayContaining(["GUARDRAIL_COOLDOWN", "GUARDRAIL_HOLD"]));
    const hours = recommendPrice(input({ hour: 12, availableStock: 30 }, { ...freePolicy, allowedStartHour: 14 }));
    expect(hours.action).toBe("HOLD");
    expect(hours.reasonCodes).toContain("GUARDRAIL_HOURS");
  });

  it("respects floor, ceiling and the max step limit", () => {
    const p = { ...DEFAULT_POLICY, cooldownMinutes: 0, minGainCents: 0 };
    const d = recommendPrice(input({ hour: 12, availableStock: 20 }, p));
    expect(d.recommendedPriceCents).toBeLessThanOrEqual(700 + p.maxStepCents);
    expect(d.unconstrainedBestCents).toBeGreaterThan(d.recommendedPriceCents);
    expect(d.reasonCodes).toContain("GUARDRAIL_STEP_LIMIT");
    for (const c of d.candidates) {
      expect(c.priceCents).toBeGreaterThanOrEqual(p.floorCents);
      expect(c.priceCents).toBeLessThanOrEqual(p.ceilingCents);
    }
  });

  it("can raise the price after a prior decline (not monotonic discounting)", () => {
    const d = recommendPrice(input({ hour: 12, availableStock: 60, currentPriceCents: 550, minutesSinceLastChange: 60 }, { ...DEFAULT_POLICY, cooldownMinutes: 60, minGainCents: 0 }));
    expect(d.action).toBe("INCREASE");
    expect(d.recommendedPriceCents).toBeGreaterThan(550);
  });

  it("moves an out-of-policy price back inside bounds even during cooldown", () => {
    const d = recommendPrice(input({ hour: 12, currentPriceCents: 400, minutesSinceLastChange: 5 }, DEFAULT_POLICY));
    expect(d.reasonCodes).toContain("POLICY_BOUND_ADJUST");
    expect(d.recommendedPriceCents).toBeGreaterThanOrEqual(DEFAULT_POLICY.floorCents);
  });

  it("requires approval in approval mode and under low confidence", () => {
    const d = recommendPrice(input({ hour: 12, availableStock: 30 }, { ...freePolicy, mode: "autopilot" }));
    expect(d.action).not.toBe("HOLD");
    expect(d.requiresApproval).toBe(false);
    const low = recommendPrice(input({ hour: 12, availableStock: 30, confidence: "low" }, { ...freePolicy, mode: "autopilot", maxStepCents: 200 }));
    expect(low.requiresApproval).toBe(true);
    expect(Math.abs(low.recommendedPriceCents - 700)).toBeLessThanOrEqual(100);
    expect(low.reasonCodes).toContain("LOW_CONFIDENCE");
  });

  it("holds and reports sold out with no stock", () => {
    const d = recommendPrice(input({ availableStock: 0 }));
    expect(d.action).toBe("HOLD");
    expect(d.reasonCodes).toContain("SOLD_OUT");
  });

  it("is deterministic", () => {
    const a = recommendPrice(input({ hour: 13, availableStock: 37 }));
    const b = recommendPrice(input({ hour: 13, availableStock: 37 }));
    expect(a).toEqual(b);
  });
});
