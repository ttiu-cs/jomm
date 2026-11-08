/** Aggregated read model for the merchant Command Center and storefront. */
import type { DB } from "../db/client";
import { paymentMode } from "../paypal/client";
import { getContext, expireStaleQuotes } from "./context";
import { listDecisions } from "./pricing-service";
import { effectiveBounds, fullCostBreakEvenCents, productionCostCents, profitReport } from "../pricing/economics";
import { expectedVisits } from "../pricing/demand";

export function dashboardState(db: DB, productId: string, now = new Date()) {
  expireStaleQuotes(db, now);
  const ctx = getContext(db, productId, now);
  const day = ctx.sim.sim_day;
  const decisions = listDecisions(db, productId, day, 40);
  const prices = db.prepare("SELECT price_cents, version, sim_hour, actor, effective_at FROM published_prices WHERE product_id=? AND sim_day=? ORDER BY version").all(productId, day);
  const outcomes = db.prepare("SELECT * FROM hour_outcomes WHERE product_id=? AND sim_day=? ORDER BY sim_hour").all(productId, day);
  const orders = db
    .prepare(
      `SELECT o.id, o.status, o.payment_source, o.total_cents, o.qty, o.unit_price_cents, o.created_at, o.paid_at, o.failure_reason,
              p.provider_order_id, p.capture_id, p.verified
       FROM orders o LEFT JOIN payment_attempts p ON p.order_id = o.id ORDER BY o.created_at DESC LIMIT 15`,
    )
    .all();
  const movements = db
    .prepare("SELECT type, source, qty_delta, unit_price_cents, sim_hour, order_id, created_at FROM inventory_movements WHERE product_id=? AND sim_day=? ORDER BY id DESC LIMIT 40")
    .all(productId, day);
  const salesBySource = db
    .prepare("SELECT source, -SUM(qty_delta) AS units, SUM(-qty_delta * unit_price_cents) AS revenue FROM inventory_movements WHERE product_id=? AND sim_day=? AND type='SALE' GROUP BY source")
    .all(productId, day) as { source: string; units: number; revenue: number }[];
  const sales = db
    .prepare("SELECT unit_price_cents AS priceCents, -qty_delta AS qty FROM inventory_movements WHERE product_id=? AND sim_day=? AND type='SALE'")
    .all(productId, day) as { priceCents: number; qty: number }[];
  const audit = db.prepare("SELECT at, actor, action, entity, entity_id, details_json FROM audit_events ORDER BY id DESC LIMIT 25").all();
  const bounds = effectiveBounds(ctx.policy, ctx.costs);
  const forecastCtx = { weather: ctx.sim.weather, event: ctx.sim.event, demandMultiplier: 1, calibration: 1 };
  const visitsCurve = Object.keys(ctx.model.hourlyVisits).map((h) => ({ hour: Number(h), visits: expectedVisits(ctx.model, forecastCtx, Number(h)) }));

  return {
    now: now.toISOString(),
    paymentMode: paymentMode(),
    product: ctx.product,
    sim: ctx.sim,
    storeOpen: ctx.storeOpen,
    stock: ctx.stock,
    batch: ctx.batch,
    published: ctx.published,
    policy: ctx.policy,
    policyVersion: ctx.policyVersion,
    effectiveBounds: bounds,
    costs: ctx.costs,
    unitEconomics: { productionCostCents: productionCostCents(ctx.costs), fullCostBreakEvenCents: fullCostBreakEvenCents(ctx.costs) },
    confidence: ctx.confidence,
    exposures: ctx.exposures,
    calibration: ctx.calibration,
    minutesSinceLastChange: ctx.minutesSinceLastChange,
    latestDecision: decisions[0] ?? null,
    decisions,
    priceHistory: prices,
    hourOutcomes: outcomes,
    salesBySource,
    todayReport: profitReport(ctx.costs, sales, ctx.batch?.qtyProduced ?? 0, ctx.stock.wasted),
    orders,
    movements,
    audit,
    visitsCurve,
  };
}

/** Public, shopper-safe view: no costs, policy or forecasts. */
export function storefrontState(db: DB, productId: string, now = new Date()) {
  expireStaleQuotes(db, now);
  const ctx = getContext(db, productId, now);
  return {
    product: { sku: ctx.product.sku, name: ctx.product.name, currency: ctx.product.currency, storeName: ctx.product.storeName },
    storeOpen: ctx.storeOpen,
    storeHour: ctx.sim.current_hour,
    closeHour: ctx.product.closeHour,
    price: ctx.published ? { priceCents: ctx.published.priceCents, version: ctx.published.version, effectiveAt: ctx.published.effectiveAt } : null,
    available: ctx.stock.available,
    paymentMode: paymentMode(),
  };
}
