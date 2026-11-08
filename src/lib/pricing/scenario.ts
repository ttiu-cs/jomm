import type { CostInputs, DemandContext, DemandModel, PricingPolicy } from "./types";

/**
 * Seeded salad scenario. Every number here is an ILLUSTRATIVE, configurable assumption,
 * not an observed commercial fact. See docs/ASSUMPTIONS.md.
 */
export const SALAD_SKU = "SALAD-001";
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 20;
export const OPENING_STOCK = 100;
export const BASE_PRICE_CENTS = 700;

export const DEFAULT_COSTS: CostInputs = {
  ingredientsCents: 230,
  packagingCents: 35,
  laborCents: 55, // => $3.20 fully loaded production cost (sunk once made)
  fulfillmentPerOrderCents: 10, // fork, napkin, bag
  paymentFeeBps: 349, // illustrative card/wallet fee assumption
  paymentFeeFixedCents: 49,
  disposalPerUnitCents: 25,
};

export const DEFAULT_POLICY: PricingPolicy = {
  floorCents: 400,
  ceilingCents: 950,
  maxStepCents: 100,
  cooldownMinutes: 60,
  minGainCents: 25,
  mode: "approval",
  allowBelowFullCost: true,
  allowedStartHour: OPEN_HOUR,
  allowedEndHour: CLOSE_HOUR,
  agentPublishAllowed: false,
  lowConfidenceRequiresApproval: true,
  priceGridCents: 25,
};

export const DEFAULT_DEMAND_MODEL: DemandModel = {
  // Expected product views (storefront + shelf) per store hour; lunch peak + after-work bump.
  hourlyVisits: { 9: 7, 10: 9, 11: 20, 12: 34, 13: 25, 14: 10, 15: 8, 16: 9, 17: 15, 18: 12, 19: 8 },
  refPriceCents: BASE_PRICE_CENTS,
  baseConversion: 0.6,
  sensitivityPerDollar: 0.16,
  peakHours: [12, 13],
  peakSensitivityMultiplier: 0.65,
  maxConversion: 0.95,
};

export const DEFAULT_CONTEXT: DemandContext = {
  weather: "cloudy",
  event: "none",
  demandMultiplier: 1,
  calibration: 1,
};
