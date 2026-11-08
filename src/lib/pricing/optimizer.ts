/**
 * Horizon-aware price optimizer.
 *
 * Finite-horizon stochastic dynamic program over (store hour, remaining stock):
 *   V_close(s) = -disposal * s
 *   V_t(s)     = max_p  E_D[ net(p) * min(D, s) + V_{t+1}(s - min(D, s)) ],   D ~ Poisson(visits_t * conv_t(p))
 * where net(p) = p - fulfillment - payment fee(p). Production cost is sunk and excluded.
 *
 * The current-hour decision is then restricted to the merchant's feasible set (floor/ceiling,
 * max step from the current published price, cooldown, allowed hours). Future hours in the
 * continuation value respect floor/ceiling but NOT the step limit (documented approximation).
 */
import { conversion, expectedVisits, truncatedPoisson } from "./demand";
import { effectiveBounds, incrementalCostCents, unitNetCents } from "./economics";
import type {
  CandidateEvaluation,
  CostInputs,
  DayProjection,
  DemandContext,
  DemandModel,
  PriceDecisionResult,
  PricingPolicy,
  PricingState,
  ReasonCode,
} from "./types";

export const MODEL_VERSION = "dp-poisson-logexp-v1";

export interface OptimizerInput {
  state: PricingState;
  policy: PricingPolicy;
  costs: CostInputs;
  model: DemandModel;
  ctx: DemandContext;
}

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

function priceGrid(floor: number, ceiling: number, step: number): number[] {
  const out: number[] = [];
  for (let p = floor; p <= ceiling + 1e-9; p += step) out.push(Math.round(p));
  return out;
}

interface DpTables {
  hours: number[]; // hours t0..close-1
  V: Float64Array[]; // V[i][s] for hours[i]; V[hours.length] = terminal
  policy: Int32Array[]; // index into grid for each (i, s)
  grid: number[];
  mu: Float64Array[]; // mu[i][j] expected demand at hour i, price j
}

function solveDp(input: OptimizerInput, grid: number[], fromHour: number, maxStock: number): DpTables {
  const { state, costs, model, ctx } = input;
  const hours: number[] = [];
  for (let h = fromHour; h < state.closeHour; h++) hours.push(h);
  const T = hours.length;
  const V: Float64Array[] = new Array(T + 1);
  const pol: Int32Array[] = new Array(T);
  const mu: Float64Array[] = new Array(T);
  const net = grid.map((p) => unitNetCents(costs, p));

  const terminal = new Float64Array(maxStock + 1);
  for (let s = 0; s <= maxStock; s++) terminal[s] = -costs.disposalPerUnitCents * s;
  V[T] = terminal;

  for (let i = 0; i < T; i++) {
    const visits = expectedVisits(model, ctx, hours[i]);
    mu[i] = new Float64Array(grid.length);
    for (let j = 0; j < grid.length; j++) mu[i][j] = visits * conversion(model, grid[j], hours[i]);
  }

  for (let i = T - 1; i >= 0; i--) {
    const next = V[i + 1];
    const Vi = new Float64Array(maxStock + 1);
    const Pi = new Int32Array(maxStock + 1);
    // pmfs for each price, computed once at max stock and re-truncated per s via cumulative tails
    const pmfs = grid.map((_, j) => truncatedPoisson(mu[i][j], maxStock));
    for (let s = 0; s <= maxStock; s++) {
      let best = -Infinity;
      let bestJ = 0;
      for (let j = 0; j < grid.length; j++) {
        const pmf = pmfs[j];
        let ev = 0;
        let mass = 0;
        for (let k = 0; k < s; k++) {
          const pk = pmf[k];
          ev += pk * (net[j] * k + next[s - k]);
          mass += pk;
        }
        const tail = Math.max(0, 1 - mass); // P(D >= s): sell out
        ev += tail * (net[j] * s + next[0]);
        if (ev > best + 1e-9) {
          best = ev;
          bestJ = j;
        }
      }
      Vi[s] = best;
      Pi[s] = bestJ;
    }
    V[i] = Vi;
    pol[i] = Pi;
  }
  return { hours, V, policy: pol, grid, mu };
}

/** Q-value of charging price p this hour, then following the DP policy. */
function qValue(input: OptimizerInput, dp: DpTables, priceCents: number, stock: number): number {
  const { costs, model, ctx, state } = input;
  const mu = expectedVisits(model, ctx, state.hour) * conversion(model, priceCents, state.hour);
  const pmf = truncatedPoisson(mu, stock);
  const next = dp.V[1];
  const net = unitNetCents(costs, priceCents);
  let ev = 0;
  for (let k = 0; k <= stock; k++) ev += pmf[k] * (net * k + next[stock - k]);
  return ev;
}

/** Exact forward propagation of the stock distribution under a pricing rule. */
function project(
  input: OptimizerInput,
  dp: DpTables,
  priceFor: (i: number, s: number) => number,
  stock: number,
): DayProjection {
  const { costs, model, ctx } = input;
  let dist = new Float64Array(stock + 1);
  dist[stock] = 1;
  let sold = 0,
    revenue = 0,
    incr = 0;
  const pricePath: DayProjection["pricePath"] = [];
  for (let i = 0; i < dp.hours.length; i++) {
    const h = dp.hours[i];
    const nextDist = new Float64Array(stock + 1);
    let hourSales = 0;
    let wPrice = 0,
      wMass = 0;
    for (let s = 0; s <= stock; s++) {
      const ps = dist[s];
      if (ps < 1e-12) continue;
      const p = priceFor(i, s);
      if (s > 0) {
        wPrice += ps * p;
        wMass += ps;
      }
      const mu = expectedVisits(model, ctx, h) * conversion(model, p, h);
      const pmf = truncatedPoisson(mu, s);
      for (let k = 0; k <= s; k++) {
        const w = ps * pmf[k];
        if (w === 0) continue;
        nextDist[s - k] += w;
        hourSales += w * k;
        revenue += w * k * p;
        incr += w * k * incrementalCostCents(costs, p);
      }
    }
    sold += hourSales;
    pricePath.push({ hour: h, priceCents: wMass > 0 ? Math.round(wPrice / wMass) : priceFor(i, 0), expectedSales: hourSales });
    dist = nextDist;
  }
  let unsold = 0;
  for (let s = 0; s <= stock; s++) unsold += dist[s] * s;
  const disposal = unsold * costs.disposalPerUnitCents;
  return {
    expectedUnitsSold: sold,
    expectedUnsold: unsold,
    expectedRevenueCents: revenue,
    expectedIncrementalCostCents: incr,
    expectedDisposalCostCents: disposal,
    expectedContributionCents: revenue - incr - disposal,
    pricePath,
  };
}

function nearestOnGrid(grid: number[], p: number): number {
  let best = grid[0];
  for (const g of grid) if (Math.abs(g - p) < Math.abs(best - p)) best = g;
  return best;
}

export function recommendPrice(input: OptimizerInput): PriceDecisionResult {
  const { state, policy, costs, model, ctx } = input;
  const reasons: ReasonCode[] = [];
  const explanation: string[] = [];
  const { floorCents, ceilingCents, belowCostBlocked } = effectiveBounds(policy, costs);
  const grid = priceGrid(floorCents, ceilingCents, policy.priceGridCents);
  const stock = Math.max(0, Math.floor(state.availableStock));
  const cur = state.currentPriceCents;
  const hoursRemaining = Math.max(0, state.closeHour - state.hour);

  const visitsRemaining = (() => {
    let v = 0;
    for (let h = state.hour; h < state.closeHour; h++) v += expectedVisits(model, ctx, h);
    return v;
  })();
  const demandAtCurrent = (() => {
    let d = 0;
    for (let h = state.hour; h < state.closeHour; h++) d += expectedVisits(model, ctx, h) * conversion(model, cur, h);
    return d;
  })();

  const signals = {
    expectedVisitsRemaining: visitsRemaining,
    expectedDemandAtCurrentPrice: demandAtCurrent,
    stock,
    hoursRemaining,
    calibration: ctx.calibration,
    weather: ctx.weather,
    event: ctx.event,
  };

  const emptyProjection: DayProjection = {
    expectedUnitsSold: 0,
    expectedUnsold: stock,
    expectedRevenueCents: 0,
    expectedIncrementalCostCents: 0,
    expectedDisposalCostCents: stock * costs.disposalPerUnitCents,
    expectedContributionCents: -stock * costs.disposalPerUnitCents,
    pricePath: [],
  };

  const base = {
    modelVersion: MODEL_VERSION,
    hour: state.hour,
    currentPriceCents: cur,
    confidence: state.confidence,
    signals,
  };

  if (hoursRemaining <= 0) {
    return {
      ...base,
      recommendedPriceCents: cur,
      unconstrainedBestCents: cur,
      action: "HOLD",
      reasonCodes: ["STORE_CLOSED"],
      explanation: ["Store is closed; no further price decisions today."],
      requiresApproval: false,
      expectedGainCents: 0,
      bounds: { floorCents, ceilingCents, stepLowCents: cur, stepHighCents: cur },
      candidates: [],
      projection: emptyProjection,
      holdProjection: emptyProjection,
    };
  }

  const dp = solveDp(input, grid, state.hour, stock);

  // Step limit (halved under low confidence).
  let maxStep = policy.maxStepCents;
  if (state.confidence === "low") maxStep = Math.max(policy.priceGridCents, Math.floor(maxStep / 2 / policy.priceGridCents) * policy.priceGridCents);
  const outOfBounds = cur < floorCents || cur > ceilingCents;
  const stepLow = outOfBounds ? floorCents : Math.max(floorCents, cur - maxStep);
  const stepHigh = outOfBounds ? ceilingCents : Math.min(ceilingCents, cur + maxStep);

  // Candidate evaluation over the policy grid (plus the current price if off-grid).
  const evalPrices = Array.from(new Set([...grid, ...(outOfBounds ? [] : [cur])])).sort((a, b) => a - b);
  const visitsNow = expectedVisits(model, ctx, state.hour);
  const candidates: CandidateEvaluation[] = evalPrices.map((p) => {
    const conv = conversion(model, p, state.hour);
    const mu = visitsNow * conv;
    const pmf = truncatedPoisson(mu, stock);
    let es = 0;
    for (let k = 0; k <= stock; k++) es += pmf[k] * k;
    return {
      priceCents: p,
      conversion: conv,
      expectedVisitsThisHour: visitsNow,
      expectedSalesThisHour: es,
      expectedRevenueThisHourCents: es * p,
      expectedValueCents: qValue(input, dp, p, stock),
      feasible: p >= stepLow && p <= stepHigh,
    };
  });

  const best = (list: CandidateEvaluation[]) => list.reduce((a, b) => (b.expectedValueCents > a.expectedValueCents + 1e-6 ? b : a));
  const unconstrained = best(candidates.filter((c) => c.priceCents >= floorCents && c.priceCents <= ceilingCents));
  const feasibleList = candidates.filter((c) => c.feasible);
  let chosen = feasibleList.length ? best(feasibleList) : unconstrained;
  const currentEval = candidates.find((c) => c.priceCents === cur);
  const currentValue = currentEval ? currentEval.expectedValueCents : qValue(input, dp, cur, stock);

  // Diagnostic: would the optimizer go beyond floor/ceiling if allowed?
  const probe = (p: number) => qValue(input, dp, p, stock);
  if (unconstrained.priceCents === floorCents && floorCents - policy.priceGridCents > 0 && probe(floorCents - policy.priceGridCents) > unconstrained.expectedValueCents + 1) {
    reasons.push(belowCostBlocked ? "BELOW_COST_BLOCKED" : "GUARDRAIL_FLOOR");
  }
  if (unconstrained.priceCents === ceilingCents && probe(ceilingCents + policy.priceGridCents) > unconstrained.expectedValueCents + 1) {
    reasons.push("GUARDRAIL_CEILING");
  }

  let recommended = chosen.priceCents;
  const inAllowedHours = state.hour >= policy.allowedStartHour && state.hour < policy.allowedEndHour;
  const cooldownActive = state.minutesSinceLastChange !== null && state.minutesSinceLastChange < policy.cooldownMinutes;

  if (outOfBounds) {
    reasons.push("POLICY_BOUND_ADJUST");
    explanation.push(`Current price ${fmt(cur)} is outside the policy range ${fmt(floorCents)}–${fmt(ceilingCents)}; moving inside bounds.`);
  } else if (stock === 0) {
    recommended = cur;
    reasons.push("SOLD_OUT");
    explanation.push("No sellable stock remains; price held.");
  } else if (!inAllowedHours) {
    recommended = cur;
    reasons.push("GUARDRAIL_HOURS", "GUARDRAIL_HOLD");
    explanation.push(`Repricing is only allowed ${policy.allowedStartHour}:00–${policy.allowedEndHour}:00 by merchant policy.`);
  } else if (cooldownActive) {
    recommended = cur;
    reasons.push("GUARDRAIL_COOLDOWN", "GUARDRAIL_HOLD");
    explanation.push(`Last change was ${state.minutesSinceLastChange} min ago; policy cooldown is ${policy.cooldownMinutes} min.`);
  } else if (chosen.expectedValueCents - currentValue < policy.minGainCents) {
    recommended = cur;
    reasons.push("HOLD_LOW_GAIN");
    explanation.push(
      `Best feasible move to ${fmt(chosen.priceCents)} adds only ${fmt(Math.max(0, chosen.expectedValueCents - currentValue))} expected contribution (threshold ${fmt(policy.minGainCents)}).`,
    );
  }
  if (!outOfBounds && unconstrained.priceCents !== chosen.priceCents && recommended !== cur) {
    reasons.push("GUARDRAIL_STEP_LIMIT");
    explanation.push(`Optimizer prefers ${fmt(unconstrained.priceCents)} but max step is ${fmt(maxStep)} per change.`);
  }
  if (state.confidence === "low") {
    reasons.push("LOW_CONFIDENCE");
    explanation.push("Limited observed exposure data: step size halved and approval required.");
  }
  if (recommended !== chosen.priceCents) chosen = candidates.find((c) => c.priceCents === recommended) ?? chosen;
  recommended = outOfBounds ? nearestOnGrid(grid, Math.min(Math.max(chosen.priceCents, floorCents), ceilingCents)) : recommended;
  const action: PriceDecisionResult["action"] = recommended > cur ? "INCREASE" : recommended < cur ? "DECREASE" : "HOLD";

  // Economic reason codes with quantitative evidence.
  const holdProjection = project(input, dp, () => cur, stock);
  const projection = project(input, dp, (i, s) => (i === 0 ? recommended : dp.grid[dp.policy[i][s]]), stock);

  const ratio = stock > 0 ? demandAtCurrent / stock : 0;
  const peakNow = model.peakHours.includes(state.hour);
  const lastPeak = Math.max(...model.peakHours);
  if (ratio > 1.15 && action !== "DECREASE") {
    reasons.push("LOW_STOCK");
    explanation.push(`Forecast demand at ${fmt(cur)} is ${demandAtCurrent.toFixed(0)} units vs ${stock} in stock for the rest of the day — scarcity raises each unit's value.`);
  }
  if (holdProjection.expectedUnsold >= Math.max(3, stock * 0.08) && action !== "INCREASE") {
    reasons.push("EXPIRY_RISK");
    explanation.push(`Holding ${fmt(cur)} leaves ~${holdProjection.expectedUnsold.toFixed(1)} units unsold at ${state.closeHour}:00 (disposal ${fmt(costs.disposalPerUnitCents)}/unit).`);
  }
  if (peakNow && action !== "DECREASE") {
    reasons.push("LUNCH_PEAK");
    explanation.push(`Lunch peak: ${visitsNow.toFixed(0)} expected shoppers this hour with lower modeled price sensitivity.`);
  }
  if (state.hour > lastPeak && action === "DECREASE" && hoursRemaining > 2) reasons.push("POST_PEAK_LULL");
  if (hoursRemaining <= 2 && action === "DECREASE") reasons.push("LATE_DAY_CLEARANCE");
  if (action === "INCREASE" && !peakNow && !reasons.includes("LOW_STOCK")) reasons.push("PRICE_RECOVERY");
  if (ctx.calibration < 0.92) {
    reasons.push("SLOW_SELL_THROUGH");
    explanation.push(`Observed sell-through is ${((1 - ctx.calibration) * 100).toFixed(0)}% below forecast so far today; remaining demand forecast adjusted down.`);
  } else if (ctx.calibration > 1.08) {
    reasons.push("FAST_SELL_THROUGH");
    explanation.push(`Observed sell-through is ${((ctx.calibration - 1) * 100).toFixed(0)}% above forecast so far today; remaining demand forecast adjusted up.`);
  }
  if (ctx.weather === "sunny" || ctx.weather === "hot") reasons.push("WEATHER_BOOST");
  if (ctx.weather === "rainy") reasons.push("WEATHER_DRAG");
  if (ctx.event !== "none") reasons.push("EVENT_DEMAND");

  const gain = (candidates.find((c) => c.priceCents === recommended)?.expectedValueCents ?? currentValue) - currentValue;
  if (action !== "HOLD") {
    explanation.unshift(
      `${action === "INCREASE" ? "Raise" : "Lower"} ${fmt(cur)} → ${fmt(recommended)}: expected rest-of-day contribution ${fmt(projection.expectedContributionCents)} vs ${fmt(holdProjection.expectedContributionCents)} if held (+${fmt(gain)}).`,
    );
  } else if (!explanation.length) {
    explanation.push(`Hold ${fmt(cur)}: it is the best feasible price for expected rest-of-day contribution.`);
  }

  const requiresApproval =
    action !== "HOLD" && (policy.mode === "approval" || (state.confidence === "low" && policy.lowConfidenceRequiresApproval));

  return {
    ...base,
    recommendedPriceCents: recommended,
    unconstrainedBestCents: unconstrained.priceCents,
    action,
    reasonCodes: Array.from(new Set(reasons)),
    explanation,
    requiresApproval,
    expectedGainCents: gain,
    bounds: { floorCents, ceilingCents, stepLowCents: stepLow, stepHighCents: stepHigh },
    candidates,
    projection,
    holdProjection,
  };
}
