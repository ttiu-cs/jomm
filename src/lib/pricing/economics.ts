import type { CostInputs, PricingPolicy } from "./types";

/** Accounting production cost per unit (sunk once the batch is produced). */
export function productionCostCents(c: CostInputs): number {
  return c.ingredientsCents + c.packagingCents + c.laborCents;
}

/** Payment fee for one order at a price (illustrative assumption). */
export function paymentFeeCents(c: CostInputs, priceCents: number): number {
  return (priceCents * c.paymentFeeBps) / 10000 + c.paymentFeeFixedCents;
}

/** Incremental cost triggered by selling one unit (one unit per order in the demo). */
export function incrementalCostCents(c: CostInputs, priceCents: number): number {
  return c.fulfillmentPerOrderCents + paymentFeeCents(c, priceCents);
}

/** Cash contribution of selling one already-produced unit vs. leaving it unsold. */
export function unitNetCents(c: CostInputs, priceCents: number): number {
  return priceCents - incrementalCostCents(c, priceCents);
}

/** Lowest price that recovers full production + incremental cost. */
export function fullCostBreakEvenCents(c: CostInputs): number {
  return (productionCostCents(c) + c.fulfillmentPerOrderCents + c.paymentFeeFixedCents) / (1 - c.paymentFeeBps / 10000);
}

export function effectiveBounds(policy: PricingPolicy, costs: CostInputs) {
  const grid = policy.priceGridCents;
  let floor = policy.floorCents;
  let belowCostBlocked = false;
  if (!policy.allowBelowFullCost) {
    const be = Math.ceil(fullCostBreakEvenCents(costs) / grid) * grid;
    if (be > floor) {
      floor = be;
      belowCostBlocked = true;
    }
  }
  floor = Math.ceil(floor / grid) * grid;
  const ceiling = Math.floor(policy.ceilingCents / grid) * grid;
  return { floorCents: Math.min(floor, ceiling), ceilingCents: ceiling, belowCostBlocked };
}

export interface ProfitReport {
  unitsSold: number;
  unsold: number;
  revenueCents: number;
  paymentFeesCents: number;
  fulfillmentCents: number;
  disposalCents: number;
  contributionCents: number; // after incremental costs; sunk production excluded
  productionCogsCents: number; // accounting: all units produced
  accountingProfitCents: number; // contribution - production COGS
}

export function profitReport(costs: CostInputs, sales: { priceCents: number; qty: number }[], produced: number, unsold: number): ProfitReport {
  let revenue = 0,
    fees = 0,
    fulfil = 0,
    units = 0;
  for (const s of sales) {
    revenue += s.priceCents * s.qty;
    fees += paymentFeeCents(costs, s.priceCents) * s.qty;
    fulfil += costs.fulfillmentPerOrderCents * s.qty;
    units += s.qty;
  }
  const disposal = unsold * costs.disposalPerUnitCents;
  const contribution = revenue - fees - fulfil - disposal;
  const cogs = produced * productionCostCents(costs);
  return {
    unitsSold: units,
    unsold,
    revenueCents: Math.round(revenue),
    paymentFeesCents: Math.round(fees),
    fulfillmentCents: Math.round(fulfil),
    disposalCents: Math.round(disposal),
    contributionCents: Math.round(contribution),
    productionCogsCents: Math.round(cogs),
    accountingProfitCents: Math.round(contribution - cogs),
  };
}
