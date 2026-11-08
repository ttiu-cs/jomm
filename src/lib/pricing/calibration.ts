/**
 * Sell-through calibration: a shrunk ratio of observed to forecast sales so far today.
 * This is a STATE UPDATE fed into the next decision, not model training. With little
 * evidence the factor stays near 1 (prior weight `k` units).
 */
export function sellThroughCalibration(predictedSales: number, actualSales: number, k = 15): number {
  const f = (k + actualSales) / (k + predictedSales);
  return Math.max(0.6, Math.min(1.4, f));
}

/** Confidence from the volume of logged price exposures (conversion denominator). */
export function exposureConfidence(exposures: number, distinctPrices: number): "low" | "medium" | "high" {
  if (exposures < 40 || distinctPrices < 2) return "low";
  if (exposures < 400 || distinctPrices < 4) return "medium";
  return "high";
}
