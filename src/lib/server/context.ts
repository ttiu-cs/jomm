/** Read-side: assemble the current pricing context for a product from the database. */
import type { DB } from "../db/client";
import { exposureConfidence, sellThroughCalibration } from "../pricing/calibration";
import type { CostInputs, DemandModel, LocalEvent, PricingPolicy, Weather } from "../pricing/types";
import { DomainError } from "./util";

export interface SimStateRow {
  seed: number;
  sim_day: number;
  current_hour: number;
  weather: Weather;
  event: LocalEvent;
  demand_multiplier: number;
}

export interface ProductContext {
  product: { id: string; sku: string; name: string; currency: string; basePriceCents: number; storeId: string; storeName: string; openHour: number; closeHour: number; timezone: string };
  model: DemandModel;
  costs: CostInputs;
  costSnapshotId: string;
  policy: PricingPolicy;
  policyVersion: number;
  sim: SimStateRow;
  batch: { id: string; qtyProduced: number; sellByHour: number; status: string } | null;
  stock: { onHand: number; reserved: number; available: number; soldSimulated: number; soldReal: number; soldMock: number; wasted: number };
  published: { id: string; priceCents: number; version: number; effectiveAt: string; simDay: number; simHour: number; actor: string } | null;
  minutesSinceLastChange: number | null;
  confidence: "low" | "medium" | "high";
  exposures: { total: number; distinctPrices: number };
  calibration: number;
  storeOpen: boolean;
}

export function expireStaleQuotes(db: DB, now = new Date()): number {
  const iso = now.toISOString();
  const stale = db
    .prepare(
      `SELECT q.id, q.product_id, q.unit_price_cents, q.sim_day, q.sim_hour FROM price_quotes q
       LEFT JOIN orders o ON o.quote_id = q.id
       WHERE q.status = 'ACTIVE' AND q.expires_at <= ? AND (o.id IS NULL OR o.status IN ('CREATED','AWAITING_APPROVAL'))`,
    )
    .all(iso) as { id: string; product_id: string; unit_price_cents: number; sim_day: number; sim_hour: number }[];
  const tx = db.transaction(() => {
    for (const q of stale) {
      db.prepare("UPDATE price_quotes SET status='EXPIRED' WHERE id=? AND status='ACTIVE'").run(q.id);
      db.prepare("UPDATE orders SET status='EXPIRED', failure_reason='QUOTE_EXPIRED', updated_at=? WHERE quote_id=? AND status IN ('CREATED','AWAITING_APPROVAL')").run(iso, q.id);
      db.prepare("INSERT INTO exposure_events (product_id, sim_day, sim_hour, source, kind, count, price_cents, created_at) VALUES (?,?,?,?,?,?,?,?)").run(
        q.product_id,
        q.sim_day,
        q.sim_hour,
        "STOREFRONT",
        "ABANDON",
        1,
        q.unit_price_cents,
        iso,
      );
    }
  });
  tx();
  return stale.length;
}

export function stockLevels(db: DB, productId: string, batchId: string | null, now = new Date()) {
  if (!batchId) return { onHand: 0, reserved: 0, available: 0, soldSimulated: 0, soldReal: 0, soldMock: 0, wasted: 0 };
  const onHand = (db.prepare("SELECT COALESCE(SUM(qty_delta),0) AS v FROM inventory_movements WHERE batch_id=?").get(batchId) as { v: number }).v;
  const by = (source: string, type = "SALE") =>
    -(db.prepare("SELECT COALESCE(SUM(qty_delta),0) AS v FROM inventory_movements WHERE batch_id=? AND type=? AND source=?").get(batchId, type, source) as { v: number }).v;
  const wasted = -(db.prepare("SELECT COALESCE(SUM(qty_delta),0) AS v FROM inventory_movements WHERE batch_id=? AND type='WASTE'").get(batchId) as { v: number }).v;
  const reserved = (
    db
      .prepare(
        `SELECT COALESCE(SUM(q.qty),0) AS v FROM price_quotes q LEFT JOIN orders o ON o.quote_id = q.id
         WHERE q.product_id = ? AND q.status = 'ACTIVE'
           AND (q.expires_at > ? OR o.status IN ('CAPTURING','PAYMENT_PENDING'))`,
      )
      .get(productId, now.toISOString()) as { v: number }
  ).v;
  return {
    onHand,
    reserved,
    available: Math.max(0, onHand - reserved),
    soldSimulated: by("SIMULATED"),
    soldReal: by("PAYPAL_SANDBOX"),
    soldMock: by("MOCK_CHECKOUT"),
    wasted,
  };
}

export function todayCalibration(db: DB, productId: string, simDay: number): number {
  const r = db
    .prepare(
      "SELECT COALESCE(SUM(predicted_sales),0) AS p, COALESCE(SUM(simulated_sales + real_sales),0) AS a FROM hour_outcomes WHERE product_id=? AND sim_day=? AND stockout=0",
    )
    .get(productId, simDay) as { p: number; a: number };
  return sellThroughCalibration(r.p, r.a);
}

export function getContext(db: DB, productId: string, now = new Date()): ProductContext {
  const p = db
    .prepare(
      `SELECT p.*, s.name AS store_name, s.open_hour, s.close_hour, s.timezone FROM products p JOIN stores s ON s.id = p.store_id WHERE p.id = ?`,
    )
    .get(productId) as
    | { id: string; sku: string; name: string; currency: string; base_price_cents: number; store_id: string; store_name: string; open_hour: number; close_hour: number; timezone: string; demand_model_json: string }
    | undefined;
  if (!p) throw new DomainError("NOT_FOUND", "Product not found — run the seed script (npm run seed).", 404);
  const cost = db.prepare("SELECT id, costs_json FROM cost_snapshots WHERE product_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(productId) as { id: string; costs_json: string };
  const pol = db.prepare("SELECT version, policy_json FROM pricing_policies WHERE product_id=? AND active=1").get(productId) as { version: number; policy_json: string };
  const sim = db.prepare("SELECT * FROM sim_state WHERE product_id=?").get(productId) as SimStateRow;
  const batch = db
    .prepare("SELECT id, qty_produced, sell_by_hour, status FROM inventory_batches WHERE product_id=? AND sim_day=? ORDER BY created_at DESC LIMIT 1")
    .get(productId, sim.sim_day) as { id: string; qty_produced: number; sell_by_hour: number; status: string } | undefined;
  const pub = db.prepare("SELECT * FROM published_prices WHERE product_id=? ORDER BY version DESC LIMIT 1").get(productId) as
    | { id: string; price_cents: number; version: number; effective_at: string; sim_day: number; sim_hour: number; actor: string }
    | undefined;
  const exp = db
    .prepare("SELECT COALESCE(SUM(count),0) AS n, COUNT(DISTINCT price_cents) AS d FROM exposure_events WHERE product_id=? AND kind='VIEW'")
    .get(productId) as { n: number; d: number };

  const rawStock = stockLevels(db, productId, batch ? batch.id : null, now);
  const isActive = !!batch && batch.status === "ACTIVE";
  // A closed batch keeps its sold/wasted history for reporting but has nothing sellable.
  const stock = isActive ? rawStock : { ...rawStock, available: 0, reserved: 0 };
  const minutesSinceLastChange = pub && pub.sim_day === sim.sim_day && pub.actor !== "seed" ? (sim.current_hour - pub.sim_hour) * 60 : null;

  return {
    product: {
      id: p.id,
      sku: p.sku,
      name: p.name,
      currency: p.currency,
      basePriceCents: p.base_price_cents,
      storeId: p.store_id,
      storeName: p.store_name,
      openHour: p.open_hour,
      closeHour: p.close_hour,
      timezone: p.timezone,
    },
    model: JSON.parse(p.demand_model_json),
    costs: JSON.parse(cost.costs_json),
    costSnapshotId: cost.id,
    policy: JSON.parse(pol.policy_json),
    policyVersion: pol.version,
    sim,
    batch: batch ? { id: batch.id, qtyProduced: batch.qty_produced, sellByHour: batch.sell_by_hour, status: batch.status } : null,
    stock,
    published: pub
      ? { id: pub.id, priceCents: pub.price_cents, version: pub.version, effectiveAt: pub.effective_at, simDay: pub.sim_day, simHour: pub.sim_hour, actor: pub.actor }
      : null,
    minutesSinceLastChange,
    confidence: exposureConfidence(exp.n, exp.d),
    exposures: { total: exp.n, distinctPrices: exp.d },
    calibration: todayCalibration(db, productId, sim.sim_day),
    storeOpen: sim.current_hour >= p.open_hour && sim.current_hour < p.close_hour && !!batch && batch.status === "ACTIVE",
  };
}
