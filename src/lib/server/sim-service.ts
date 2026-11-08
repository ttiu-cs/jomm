/**
 * Store clock + SIMULATED walk-in demand for the live demo ("time machine").
 * Every unit sold here is recorded with source = 'SIMULATED'. Real PayPal Sandbox sales are
 * recorded separately by the commerce service with source = 'PAYPAL_SANDBOX'.
 */
import type { DB } from "../db/client";
import { conversion, expectedVisits } from "../pricing/demand";
import { hourShoppers } from "../pricing/rng";
import { DEFAULT_COSTS, DEFAULT_DEMAND_MODEL, DEFAULT_POLICY, OPENING_STOCK, BASE_PRICE_CENTS, SALAD_SKU, OPEN_HOUR, CLOSE_HOUR } from "../pricing/scenario";
import type { LocalEvent, Weather } from "../pricing/types";
import { expireStaleQuotes, getContext } from "./context";
import { emit } from "./events";
import { computeRecommendation, publishDecision, type Actor } from "./pricing-service";
import { DEMO, DomainError, audit, newId } from "./util";

const SYSTEM: Actor = { kind: "system", id: "store-clock" };
const AUTOPILOT: Actor = { kind: "autopilot", id: "policy-engine" };

export interface SeedOptions {
  seed?: number;
  openingStock?: number;
  withHistory?: boolean; // seed SYNTHETIC_HISTORY exposures so confidence starts at "medium"
  weather?: Weather;
  event?: LocalEvent;
  demandShift?: number; // unforecasted traffic multiplier applied to the simulated world only
}

export function seedDemo(db: DB, opts: SeedOptions = {}, now = new Date()) {
  const iso = now.toISOString();
  const tx = db.transaction(() => {
    for (const t of [
      "audit_events",
      "webhook_events",
      "inventory_movements",
      "payment_attempts",
      "orders",
      "price_quotes",
      "published_prices",
      "price_decisions",
      "hour_outcomes",
      "exposure_events",
      "sim_state",
      "pricing_policies",
      "inventory_batches",
      "cost_snapshots",
      "products",
      "stores",
      "merchants",
    ])
      db.prepare(`DELETE FROM ${t}`).run();

    db.prepare("INSERT INTO merchants (id, name, created_at) VALUES (?,?,?)").run(DEMO.merchantId, "Green Bowl Kitchen (demo merchant)", iso);
    db.prepare("INSERT INTO stores (id, merchant_id, name, timezone, open_hour, close_hour) VALUES (?,?,?,?,?,?)").run(
      DEMO.storeId,
      DEMO.merchantId,
      "Green Bowl — Market St (demo)",
      "America/Los_Angeles",
      OPEN_HOUR,
      CLOSE_HOUR,
    );
    db.prepare(
      "INSERT INTO products (id, store_id, sku, name, category, currency, base_price_cents, unit, demand_model_json) VALUES (?,?,?,?,?,?,?,?,?)",
    ).run(DEMO.productId, DEMO.storeId, SALAD_SKU, "Fresh Garden Salad", "prepared_food", "USD", BASE_PRICE_CENTS, "each", JSON.stringify(DEFAULT_DEMAND_MODEL));
    const costId = newId("cost");
    db.prepare("INSERT INTO cost_snapshots (id, product_id, created_at, costs_json, actor) VALUES (?,?,?,?,?)").run(costId, DEMO.productId, iso, JSON.stringify(DEFAULT_COSTS), "seed");
    db.prepare("INSERT INTO pricing_policies (id, product_id, version, policy_json, active, created_at, actor) VALUES (?,?,1,?,1,?,?)").run(
      newId("pol"),
      DEMO.productId,
      JSON.stringify(DEFAULT_POLICY),
      iso,
      "seed",
    );
    db.prepare("INSERT INTO sim_state (product_id, seed, sim_day, current_hour, weather, event, demand_multiplier, updated_at) VALUES (?,?,?,?,?,?,?,?)").run(
      DEMO.productId,
      opts.seed ?? 42,
      1,
      OPEN_HOUR,
      opts.weather ?? "cloudy",
      opts.event ?? "none",
      opts.demandShift ?? 1,
      iso,
    );
    startBatch(db, DEMO.productId, 1, opts.openingStock ?? OPENING_STOCK, costId, now);
    db.prepare(
      "INSERT INTO published_prices (id, product_id, price_cents, currency, version, effective_at, sim_day, sim_hour, decision_id, actor) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(newId("pp"), DEMO.productId, BASE_PRICE_CENTS, "USD", 1, iso, 1, OPEN_HOUR, null, "seed");

    if (opts.withHistory ?? true) {
      // Labeled synthetic history: 7 prior days of exposures at three test prices.
      const ins = db.prepare("INSERT INTO exposure_events (product_id, sim_day, sim_hour, source, kind, count, price_cents, created_at) VALUES (?,?,?,?,?,?,?,?)");
      const prices = [650, 700, 750];
      for (let d = -6; d <= 0; d++)
        for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) ins.run(DEMO.productId, d, h, "SYNTHETIC_HISTORY", "VIEW", Math.round(DEFAULT_DEMAND_MODEL.hourlyVisits[h]), prices[(d + 6) % 3], iso);
    }
    audit(db, "system:seed", "demo.seed", "product", DEMO.productId, opts, now);
  });
  tx();
  emit("reset", DEMO.productId);
}

function startBatch(db: DB, productId: string, simDay: number, qty: number, costId: string, now: Date) {
  const batchId = newId("batch");
  db.prepare("INSERT INTO inventory_batches (id, product_id, sim_day, qty_produced, created_at, sell_by_hour, status, cost_snapshot_id) VALUES (?,?,?,?,?,?,?,?)").run(
    batchId,
    productId,
    simDay,
    qty,
    now.toISOString(),
    CLOSE_HOUR,
    "ACTIVE",
    costId,
  );
  db.prepare("INSERT INTO inventory_movements (product_id, batch_id, type, qty_delta, source, sim_day, sim_hour, created_at) VALUES (?,?,?,?,?,?,?,?)").run(
    productId,
    batchId,
    "PRODUCTION",
    qty,
    "MERCHANT",
    simDay,
    OPEN_HOUR,
    now.toISOString(),
  );
  return batchId;
}

export interface HourSummary {
  hour: number;
  priceCents: number;
  shoppers: number;
  simulatedSales: number;
  realSales: number;
  lostToStockout: number;
  predictedSales: number;
  closed: boolean;
  wasted: number;
  decision?: { id: string; action: string; recommendedPriceCents: number; status: string; published: boolean };
}

/**
 * Advance the store clock by one hour:
 *   1) simulate seeded walk-in demand for the elapsed hour at the published price (stock-capped,
 *      excluding units reserved by live shopper quotes);
 *   2) record forecast-vs-outcome for that hour;
 *   3) move the clock, close the day if needed (unsold => WASTE);
 *   4) recompute a recommendation; publish automatically only in autopilot mode when allowed.
 */
export function advanceHour(db: DB, productId: string, now = new Date()): HourSummary {
  expireStaleQuotes(db, now);
  const ctx = getContext(db, productId, now);
  if (!ctx.storeOpen || !ctx.batch || !ctx.published) throw new DomainError("STORE_CLOSED", "Store is closed. Start a new day or reset the demo.", 409);
  const h = ctx.sim.current_hour;
  const price = ctx.published.priceCents;
  const worldCtx = { weather: ctx.sim.weather, event: ctx.sim.event, demandMultiplier: ctx.sim.demand_multiplier, calibration: 1 };
  const shoppers = hourShoppers(ctx.sim.seed, ctx.sim.sim_day, h, expectedVisits(ctx.model, worldCtx, h));
  const q = conversion(ctx.model, price, h);
  let available = ctx.stock.available;
  let sold = 0;
  let lost = 0;
  for (const u of shoppers) {
    if (u < q) {
      if (available > 0) {
        available--;
        sold++;
      } else lost++;
    }
  }
  const forecastCtx = { weather: ctx.sim.weather, event: ctx.sim.event, demandMultiplier: 1, calibration: 1 };
  const predictedVisits = expectedVisits(ctx.model, forecastCtx, h);
  const predictedSales = predictedVisits * conversion(ctx.model, price, h);
  const iso = now.toISOString();
  const realSales = (
    db
      .prepare("SELECT COALESCE(-SUM(qty_delta),0) AS v FROM inventory_movements WHERE batch_id=? AND type='SALE' AND source IN ('PAYPAL_SANDBOX','MOCK_CHECKOUT') AND sim_hour=?")
      .get(ctx.batch.id, h) as { v: number }
  ).v;
  const stockout = available === 0 && (lost > 0 || sold > 0) ? 1 : 0;
  const nextHour = h + 1;
  const closing = nextHour >= Math.min(ctx.product.closeHour, ctx.batch.sellByHour);
  let wasted = 0;

  const tx = db.transaction(() => {
    if (sold > 0)
      db.prepare(
        "INSERT INTO inventory_movements (product_id, batch_id, type, qty_delta, unit_price_cents, source, sim_day, sim_hour, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      ).run(productId, ctx.batch!.id, "SALE", -sold, price, "SIMULATED", ctx.sim.sim_day, h, iso);
    const ex = db.prepare("INSERT INTO exposure_events (product_id, sim_day, sim_hour, source, kind, count, price_cents, created_at) VALUES (?,?,?,?,?,?,?,?)");
    if (shoppers.length) ex.run(productId, ctx.sim.sim_day, h, "SIMULATED", "VIEW", shoppers.length, price, iso);
    if (sold) ex.run(productId, ctx.sim.sim_day, h, "SIMULATED", "PURCHASE", sold, price, iso);
    db.prepare(
      `INSERT OR REPLACE INTO hour_outcomes (product_id, sim_day, sim_hour, price_cents, predicted_visits, predicted_sales, simulated_visits, simulated_sales, real_sales, stockout)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(productId, ctx.sim.sim_day, h, price, predictedVisits, predictedSales, shoppers.length, sold, realSales, stockout);
    db.prepare("UPDATE sim_state SET current_hour=?, updated_at=? WHERE product_id=?").run(nextHour, iso, productId);
    if (closing) {
      // Cancel still-open quotes, write off what is left.
      db.prepare(
        `UPDATE price_quotes SET status='CANCELLED' WHERE product_id=? AND status='ACTIVE' AND id NOT IN (SELECT quote_id FROM orders WHERE status IN ('CAPTURING','PAYMENT_PENDING'))`,
      ).run(productId);
      db.prepare("UPDATE orders SET status='CANCELLED', failure_reason='STORE_CLOSED', updated_at=? WHERE product_id=? AND status IN ('CREATED','AWAITING_APPROVAL')").run(iso, productId);
      const onHandAll = (db.prepare("SELECT COALESCE(SUM(qty_delta),0) AS v FROM inventory_movements WHERE batch_id=?").get(ctx.batch!.id) as { v: number }).v;
      // Units held by in-flight captures stay reserved so a confirmed payment can still be fulfilled.
      const inFlight = (
        db.prepare("SELECT COALESCE(SUM(qty),0) AS v FROM orders WHERE product_id=? AND status IN ('CAPTURING','PAYMENT_PENDING')").get(productId) as { v: number }
      ).v;
      const onHand = Math.max(0, onHandAll - inFlight);
      wasted = onHand;
      if (onHand > 0)
        db.prepare("INSERT INTO inventory_movements (product_id, batch_id, type, qty_delta, source, sim_day, sim_hour, created_at) VALUES (?,?,?,?,?,?,?,?)").run(
          productId,
          ctx.batch!.id,
          "WASTE",
          -onHand,
          "SYSTEM",
          ctx.sim.sim_day,
          nextHour,
          iso,
        );
      db.prepare("UPDATE inventory_batches SET status='CLOSED' WHERE id=?").run(ctx.batch!.id);
    }
    audit(db, "system:store-clock", "sim.advance_hour", "sim_state", productId, { hour: h, price, shoppers: shoppers.length, sold, lost, realSales, closing }, now);
  });
  tx();

  const summary: HourSummary = {
    hour: h,
    priceCents: price,
    shoppers: shoppers.length,
    simulatedSales: sold,
    realSales,
    lostToStockout: lost,
    predictedSales,
    closed: closing,
    wasted,
  };
  if (!closing) {
    const d = computeRecommendation(db, productId, SYSTEM, now);
    let published = false;
    if (d.status === "PROPOSED" && ctx.policy.mode === "autopilot" && !d.result.requiresApproval) {
      publishDecision(db, d.id, AUTOPILOT, now);
      published = true;
    }
    summary.decision = { id: d.id, action: d.result.action, recommendedPriceCents: d.result.recommendedPriceCents, status: published ? "PUBLISHED" : d.status, published };
  }
  emit("clock", productId, summary);
  return summary;
}

export function runToClose(db: DB, productId: string, now = new Date()): HourSummary[] {
  const out: HourSummary[] = [];
  for (let i = 0; i < 24; i++) {
    const s = advanceHour(db, productId, now);
    out.push(s);
    if (s.closed) break;
  }
  return out;
}

export function startNewDay(db: DB, productId: string, openingStock = OPENING_STOCK, now = new Date()) {
  const ctx = getContext(db, productId, now);
  if (ctx.storeOpen) throw new DomainError("STORE_OPEN", "Close the current day first (run to close).", 409);
  const day = ctx.sim.sim_day + 1;
  const tx = db.transaction(() => {
    db.prepare("UPDATE sim_state SET sim_day=?, current_hour=?, updated_at=? WHERE product_id=?").run(day, ctx.product.openHour, now.toISOString(), productId);
    startBatch(db, productId, day, openingStock, ctx.costSnapshotId, now);
    db.prepare(
      "INSERT INTO published_prices (id, product_id, price_cents, currency, version, effective_at, sim_day, sim_hour, decision_id, actor) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(newId("pp"), productId, ctx.product.basePriceCents, ctx.product.currency, (ctx.published?.version ?? 0) + 1, now.toISOString(), day, ctx.product.openHour, null, "seed");
    audit(db, "merchant:demo", "sim.new_day", "sim_state", productId, { day, openingStock }, now);
  });
  tx();
  emit("reset", productId);
}

export function setScenario(db: DB, productId: string, s: { weather?: Weather; event?: LocalEvent; demandShift?: number }, now = new Date()) {
  const cur = getContext(db, productId, now).sim;
  db.prepare("UPDATE sim_state SET weather=?, event=?, demand_multiplier=?, updated_at=? WHERE product_id=?").run(
    s.weather ?? cur.weather,
    s.event ?? cur.event,
    s.demandShift ?? cur.demand_multiplier,
    now.toISOString(),
    productId,
  );
  audit(db, "merchant:demo", "sim.scenario", "sim_state", productId, s, now);
  emit("scenario", productId, s);
}
