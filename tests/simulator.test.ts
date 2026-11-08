import { describe, expect, it } from "vitest";
import { compareStrategies, simulateDay, type SimConfig } from "@/lib/pricing/simulator";
import { sellThroughCalibration } from "@/lib/pricing/calibration";
import { DEFAULT_COSTS, DEFAULT_DEMAND_MODEL, DEFAULT_POLICY } from "@/lib/pricing/scenario";

const cfg: SimConfig = {
  seed: 7,
  openHour: 9,
  closeHour: 20,
  openingStock: 100,
  costs: DEFAULT_COSTS,
  policy: { ...DEFAULT_POLICY, mode: "autopilot" },
  model: DEFAULT_DEMAND_MODEL,
  truth: DEFAULT_DEMAND_MODEL,
  ctx: { weather: "cloudy", event: "none", demandMultiplier: 1 },
};

describe("simulator", () => {
  it("is reproducible for a seed and uses identical shoppers across strategies", () => {
    const a = simulateDay(cfg, { kind: "fixed", priceCents: 700 });
    const b = simulateDay(cfg, { kind: "fixed", priceCents: 700 });
    expect(a).toEqual(b);
    const ad = simulateDay(cfg, { kind: "adaptive", startPriceCents: 700 });
    expect(ad.hours.map((h) => h.shoppers)).toEqual(a.hours.map((h) => h.shoppers));
  });

  it("never oversells and conserves units", () => {
    for (const seed of [1, 2, 3]) {
      const r = simulateDay({ ...cfg, seed, ctx: { ...cfg.ctx, weather: "hot", event: "office_event" } }, { kind: "adaptive", startPriceCents: 700 });
      expect(r.report.unitsSold + r.report.unsold).toBe(100);
      expect(r.hours.every((h) => h.stockAfter >= 0)).toBe(true);
    }
  });

  it("adaptive prices move both up and down within policy in the base scenario", () => {
    const r = simulateDay(cfg, { kind: "adaptive", startPriceCents: 700 });
    const prices = r.hours.map((h) => h.priceCents);
    const diffs = prices.slice(1).map((p, i) => p - prices[i]);
    expect(diffs.some((d) => d > 0)).toBe(true);
    expect(diffs.some((d) => d < 0)).toBe(true);
    expect(prices.every((p) => p >= DEFAULT_POLICY.floorCents && p <= DEFAULT_POLICY.ceilingCents)).toBe(true);
  });

  it("produces a comparison summary over seeds", () => {
    const s = compareStrategies(cfg, 700, [1, 2, 3, 4]);
    expect(s.seeds).toBe(4);
    expect(Number.isFinite(s.contributionLiftPct)).toBe(true);
  });

  it("calibration shrinks toward 1 with little evidence and is clipped", () => {
    expect(sellThroughCalibration(0, 0)).toBe(1);
    expect(sellThroughCalibration(2, 0)).toBeGreaterThan(0.85);
    expect(sellThroughCalibration(100, 10)).toBe(0.6);
  });
});
