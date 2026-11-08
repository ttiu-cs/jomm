/**
 * Deterministic synthetic day simulator for the Pricing Lab.
 * ALL OUTPUTS ARE SYNTHETIC SIMULATION, NOT OBSERVED BUSINESS LIFT.
 *
 * "truth" is the simulator's demand world; "model" is what the optimizer believes.
 * They can differ to test robustness to misspecification.
 */
import { conversion, expectedVisits } from "./demand";
import { profitReport, type ProfitReport } from "./economics";
import { recommendPrice } from "./optimizer";
import { hourShoppers } from "./rng";
import { sellThroughCalibration } from "./calibration";
import type { CostInputs, DemandContext, DemandModel, PricingPolicy, ReasonCode } from "./types";

export type Strategy = { kind: "fixed"; priceCents: number } | { kind: "adaptive"; startPriceCents: number };

export interface SimConfig {
  seed: number;
  day?: number;
  openHour: number;
  closeHour: number;
  openingStock: number;
  costs: CostInputs;
  policy: PricingPolicy;
  model: DemandModel; // optimizer's belief
  truth: DemandModel; // simulator's world
  ctx: Omit<DemandContext, "calibration">;
}

export interface SimHourRow {
  hour: number;
  priceCents: number;
  shoppers: number;
  sold: number;
  lostToStockout: number;
  stockAfter: number;
  action?: string;
  reasonCodes?: ReasonCode[];
}

export interface SimResult {
  strategy: Strategy["kind"];
  hours: SimHourRow[];
  report: ProfitReport;
  stockoutHour: number | null;
}

export function simulateDay(cfg: SimConfig, strategy: Strategy): SimResult {
  let stock = cfg.openingStock;
  let price = strategy.kind === "fixed" ? strategy.priceCents : strategy.startPriceCents;
  let lastChangeHour: number | null = null;
  let predicted = 0;
  let actual = 0;
  const rows: SimHourRow[] = [];
  const sales: { priceCents: number; qty: number }[] = [];
  let stockoutHour: number | null = null;
  const truthCtx: DemandContext = { ...cfg.ctx, calibration: 1 };

  for (let h = cfg.openHour; h < cfg.closeHour; h++) {
    let action: string | undefined;
    let reasons: ReasonCode[] | undefined;
    const calibration = sellThroughCalibration(predicted, actual);
    if (strategy.kind === "adaptive" && stock > 0) {
      const d = recommendPrice({
        state: {
          hour: h,
          openHour: cfg.openHour,
          closeHour: cfg.closeHour,
          availableStock: stock,
          currentPriceCents: price,
          minutesSinceLastChange: lastChangeHour === null ? null : (h - lastChangeHour) * 60,
          confidence: "medium",
        },
        policy: cfg.policy,
        costs: cfg.costs,
        model: cfg.model,
        ctx: { ...cfg.ctx, calibration },
      });
      action = d.action;
      reasons = d.reasonCodes;
      if (d.action !== "HOLD") {
        price = d.recommendedPriceCents;
        lastChangeHour = h;
      }
    }
    const us = hourShoppers(cfg.seed, cfg.day ?? 0, h, expectedVisits(cfg.truth, truthCtx, h));
    const q = conversion(cfg.truth, price, h);
    let sold = 0;
    let lost = 0;
    for (const u of us) {
      if (u < q) {
        if (stock > 0) {
          stock--;
          sold++;
        } else lost++;
      }
    }
    if (stock === 0 && stockoutHour === null && sold > 0) stockoutHour = h;
    // Planner's forecast at the charged price, used only while stock was not binding.
    if (stock > 0 || lost === 0) {
      predicted += expectedVisits(cfg.model, { ...cfg.ctx, calibration: 1 }, h) * conversion(cfg.model, price, h);
      actual += sold;
    }
    if (sold > 0) sales.push({ priceCents: price, qty: sold });
    rows.push({ hour: h, priceCents: price, shoppers: us.length, sold, lostToStockout: lost, stockAfter: stock, action, reasonCodes: reasons });
  }
  return { strategy: strategy.kind, hours: rows, report: profitReport(cfg.costs, sales, cfg.openingStock, stock), stockoutHour };
}

export interface ComparisonSummary {
  seeds: number;
  fixed: ProfitReport;
  adaptive: ProfitReport;
  contributionLiftPct: number;
  adaptiveWinsShare: number;
}

function meanReport(rs: ProfitReport[]): ProfitReport {
  const keys = Object.keys(rs[0]) as (keyof ProfitReport)[];
  const out = {} as ProfitReport;
  for (const k of keys) out[k] = rs.reduce((a, r) => a + r[k], 0) / rs.length;
  return out;
}

export function compareStrategies(cfg: SimConfig, fixedPriceCents: number, seeds: number[]): ComparisonSummary {
  const f: ProfitReport[] = [];
  const a: ProfitReport[] = [];
  let wins = 0;
  for (const seed of seeds) {
    const c = { ...cfg, seed };
    const rf = simulateDay(c, { kind: "fixed", priceCents: fixedPriceCents }).report;
    const ra = simulateDay(c, { kind: "adaptive", startPriceCents: fixedPriceCents }).report;
    f.push(rf);
    a.push(ra);
    if (ra.contributionCents > rf.contributionCents) wins++;
  }
  const fixed = meanReport(f);
  const adaptive = meanReport(a);
  return {
    seeds: seeds.length,
    fixed,
    adaptive,
    contributionLiftPct: fixed.contributionCents !== 0 ? ((adaptive.contributionCents - fixed.contributionCents) / Math.abs(fixed.contributionCents)) * 100 : 0,
    adaptiveWinsShare: wins / seeds.length,
  };
}

export interface SensitivityRow {
  label: string;
  truthSensitivityMult: number;
  truthDemandMult: number;
  summary: ComparisonSummary;
}

/** Robustness: the optimizer keeps its base beliefs while the simulated world shifts. */
export function sensitivityGrid(cfg: SimConfig, fixedPriceCents: number, seeds: number[]): SensitivityRow[] {
  const rows: SensitivityRow[] = [];
  const cases: [string, number, number][] = [
    ["Model correct", 1, 1],
    ["Shoppers 50% more price-sensitive", 1.5, 1],
    ["Shoppers 40% less price-sensitive", 0.6, 1],
    ["Demand 30% lower than believed", 1, 0.7],
    ["Demand 30% higher than believed", 1, 1.3],
  ];
  for (const [label, sm, dm] of cases) {
    const truth: DemandModel = {
      ...cfg.truth,
      sensitivityPerDollar: cfg.truth.sensitivityPerDollar * sm,
      hourlyVisits: Object.fromEntries(Object.entries(cfg.truth.hourlyVisits).map(([h, v]) => [h, v * dm])),
    };
    rows.push({ label, truthSensitivityMult: sm, truthDemandMult: dm, summary: compareStrategies({ ...cfg, truth }, fixedPriceCents, seeds) });
  }
  return rows;
}
