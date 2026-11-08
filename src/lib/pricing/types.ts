/** All money values are integer cents (USD in the demo). */
export type Cents = number;

export type Weather = "sunny" | "cloudy" | "rainy" | "hot";
export type LocalEvent = "none" | "office_event" | "street_festival";
export type Confidence = "low" | "medium" | "high";
export type PolicyMode = "approval" | "autopilot";

/**
 * Unit economics. Production costs (ingredients, packaging, labor) are SUNK once the
 * batch is made and therefore excluded from the pricing objective; they are reported
 * separately as accounting COGS. Fulfillment, payment fee and disposal are incremental.
 */
export interface CostInputs {
  ingredientsCents: Cents;
  packagingCents: Cents;
  laborCents: Cents;
  fulfillmentPerOrderCents: Cents;
  paymentFeeBps: number; // e.g. 349 = 3.49% (illustrative assumption, not a PayPal quote)
  paymentFeeFixedCents: Cents;
  disposalPerUnitCents: Cents;
}

export interface PricingPolicy {
  floorCents: Cents;
  ceilingCents: Cents;
  maxStepCents: Cents; // max change per publication
  cooldownMinutes: number; // min store-clock minutes between publications
  minGainCents: Cents; // min expected rest-of-day contribution gain to justify a change
  mode: PolicyMode;
  allowBelowFullCost: boolean;
  allowedStartHour: number; // repricing allowed in [start, end)
  allowedEndHour: number;
  agentPublishAllowed: boolean;
  lowConfidenceRequiresApproval: boolean;
  priceGridCents: Cents;
  maxNegotiationDiscountBps: number; // cap on negotiated discount vs published price (e.g. 3500 = 35%)
}

/** Interpretable, configurable demand model (assumptions, not estimates from real data). */
export interface DemandModel {
  hourlyVisits: Record<number, number>; // expected product views / shoppers by store hour
  refPriceCents: Cents;
  baseConversion: number; // purchase probability at refPrice
  sensitivityPerDollar: number; // b in conv = base * exp(-b * (p - ref))
  peakHours: number[];
  peakSensitivityMultiplier: number; // <1 => lunch shoppers are less price sensitive
  maxConversion: number;
}

export interface DemandContext {
  weather: Weather;
  event: LocalEvent;
  demandMultiplier: number; // scenario knob (e.g. weekday/seasonality)
  calibration: number; // observed-vs-forecast sell-through adjustment (state update, not training)
}

export interface PricingState {
  hour: number; // store hour at which this decision would take effect
  openHour: number;
  closeHour: number;
  availableStock: number; // on hand minus active reservations
  currentPriceCents: Cents;
  minutesSinceLastChange: number | null;
  confidence: Confidence;
}

export type ReasonCode =
  | "LUNCH_PEAK"
  | "POST_PEAK_LULL"
  | "LOW_STOCK"
  | "EXPIRY_RISK"
  | "SLOW_SELL_THROUGH"
  | "FAST_SELL_THROUGH"
  | "WEATHER_BOOST"
  | "WEATHER_DRAG"
  | "EVENT_DEMAND"
  | "LATE_DAY_CLEARANCE"
  | "PRICE_RECOVERY"
  | "HOLD_LOW_GAIN"
  | "GUARDRAIL_HOLD"
  | "GUARDRAIL_COOLDOWN"
  | "GUARDRAIL_STEP_LIMIT"
  | "GUARDRAIL_FLOOR"
  | "GUARDRAIL_CEILING"
  | "GUARDRAIL_HOURS"
  | "BELOW_COST_BLOCKED"
  | "POLICY_BOUND_ADJUST"
  | "LOW_CONFIDENCE"
  | "SOLD_OUT"
  | "STORE_CLOSED";

export interface CandidateEvaluation {
  priceCents: Cents;
  conversion: number;
  expectedVisitsThisHour: number;
  expectedSalesThisHour: number;
  expectedRevenueThisHourCents: number;
  expectedValueCents: number; // expected rest-of-day contribution (objective)
  feasible: boolean;
}

export interface DayProjection {
  expectedUnitsSold: number;
  expectedUnsold: number;
  expectedRevenueCents: number;
  expectedIncrementalCostCents: number; // fulfillment + payment fees
  expectedDisposalCostCents: number;
  expectedContributionCents: number; // revenue - incremental - disposal (sunk COGS excluded)
  pricePath: { hour: number; priceCents: Cents; expectedSales: number }[];
}

export interface PriceDecisionResult {
  modelVersion: string;
  hour: number;
  currentPriceCents: Cents;
  recommendedPriceCents: Cents;
  unconstrainedBestCents: Cents;
  action: "INCREASE" | "DECREASE" | "HOLD";
  reasonCodes: ReasonCode[];
  explanation: string[];
  requiresApproval: boolean;
  confidence: Confidence;
  expectedGainCents: number;
  bounds: { floorCents: Cents; ceilingCents: Cents; stepLowCents: Cents; stepHighCents: Cents };
  candidates: CandidateEvaluation[];
  projection: DayProjection; // following the recommendation
  holdProjection: DayProjection; // if current price were held all day
  signals: {
    expectedVisitsRemaining: number;
    expectedDemandAtCurrentPrice: number;
    stock: number;
    hoursRemaining: number;
    calibration: number;
    weather: Weather;
    event: LocalEvent;
  };
}
