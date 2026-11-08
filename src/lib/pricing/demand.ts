import type { DemandContext, DemandModel, LocalEvent, Weather } from "./types";

export const WEATHER_MULTIPLIER: Record<Weather, number> = {
  sunny: 1.1,
  cloudy: 1.0,
  rainy: 0.75,
  hot: 1.25,
};

/** Hour-specific demand multipliers for optional local events. */
export function eventMultiplier(event: LocalEvent, hour: number): number {
  if (event === "office_event") return hour >= 11 && hour <= 13 ? 1.5 : 1.0;
  if (event === "street_festival") return hour >= 15 && hour <= 19 ? 1.6 : 1.0;
  return 1.0;
}

export function expectedVisits(model: DemandModel, ctx: DemandContext, hour: number): number {
  const base = model.hourlyVisits[hour] ?? 0;
  return base * WEATHER_MULTIPLIER[ctx.weather] * eventMultiplier(ctx.event, hour) * ctx.demandMultiplier * ctx.calibration;
}

export function sensitivityAt(model: DemandModel, hour: number): number {
  return model.sensitivityPerDollar * (model.peakHours.includes(hour) ? model.peakSensitivityMultiplier : 1);
}

/** Probability that a visitor buys at a price. Bounded in [0, maxConversion]. */
export function conversion(model: DemandModel, priceCents: number, hour: number): number {
  const b = sensitivityAt(model, hour);
  const q = model.baseConversion * Math.exp((-b * (priceCents - model.refPriceCents)) / 100);
  return Math.max(0, Math.min(model.maxConversion, q));
}

/** Point price elasticity of demand at a price (for display). */
export function elasticity(model: DemandModel, priceCents: number, hour: number): number {
  const q = conversion(model, priceCents, hour);
  if (q >= model.maxConversion) return 0;
  return -sensitivityAt(model, hour) * (priceCents / 100);
}

/** Poisson pmf for k = 0..s-1 with the tail P(D >= s) in slot s. */
export function truncatedPoisson(mu: number, s: number): Float64Array {
  const out = new Float64Array(s + 1);
  if (s === 0) {
    out[0] = 1;
    return out;
  }
  let p = Math.exp(-mu);
  let cum = 0;
  for (let k = 0; k < s; k++) {
    out[k] = p;
    cum += p;
    p = (p * mu) / (k + 1);
  }
  out[s] = Math.max(0, 1 - cum);
  return out;
}

/** E[min(D, s)] for D ~ Poisson(mu). */
export function expectedSalesCapped(mu: number, s: number): number {
  const pmf = truncatedPoisson(mu, s);
  let e = 0;
  for (let k = 0; k <= s; k++) e += pmf[k] * k;
  return e;
}
