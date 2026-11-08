/**
 * Quotes, orders and payments.
 *
 * Invariants:
 *  - Prices come only from server-side published prices, locked into an immutable quote.
 *  - An ACTIVE, unexpired quote reserves stock, so a captured payment can always be fulfilled.
 *  - An order is marked PAID, and inventory decremented, at most once (conditional status update
 *    + UNIQUE(inventory_movements.order_id)), whether confirmation arrives via capture response,
 *    retry, reconciliation or webhook replay.
 *  - PAYPAL_SANDBOX sales are only recorded after a verified COMPLETED capture whose amount,
 *    currency and custom_id match the order.
 */
import type { DB } from "../db/client";
import { PayPalHttpError, paymentMode, type PayPalApi, type PayPalOrder } from "../paypal/client";
import { expireStaleQuotes, getContext } from "./context";
import { emit } from "./events";
import { DomainError, audit, centsToValue, newId, valueToCents } from "./util";

export const QUOTE_TTL_SECONDS = Number(process.env.QUOTE_TTL_SECONDS || 300);
export const MAX_QTY = 5;

export interface QuoteRow {
  id: string;
  product_id: string;
  price_version: number;
  unit_price_cents: number;
  qty: number;
  total_cents: number;
  currency: string;
  created_at: string;
  expires_at: string;
  status: string;
  sim_day: number;
  sim_hour: number;
}

export interface OrderRow {
  id: string;
  quote_id: string;
  product_id: string;
  qty: number;
  unit_price_cents: number;
  total_cents: number;
  currency: string;
  payment_source: "PAYPAL_SANDBOX" | "MOCK_CHECKOUT";
  status: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
}

export function getQuote(db: DB, id: string): QuoteRow {
  const q = db.prepare("SELECT * FROM price_quotes WHERE id=?").get(id) as QuoteRow | undefined;
  if (!q) throw new DomainError("NOT_FOUND", "Quote not found", 404);
  return q;
}

export function getOrder(db: DB, id: string): OrderRow {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(id) as OrderRow | undefined;
  if (!o) throw new DomainError("NOT_FOUND", "Order not found", 404);
  return o;
}

export function orderView(db: DB, id: string) {
  const o = getOrder(db, id);
  const q = getQuote(db, o.quote_id);
  const attempt = db.prepare("SELECT provider, provider_order_id, capture_id, status, verified FROM payment_attempts WHERE order_id=? ORDER BY created_at DESC LIMIT 1").get(id) as
    | { provider: string; provider_order_id: string | null; capture_id: string | null; status: string; verified: number }
    | undefined;
  return { order: o, quote: q, payment: attempt ?? null };
}

/** Lock the current published price into an expiring quote and reserve stock atomically. */
export function createQuote(db: DB, productId: string, qty: number, now = new Date()): QuoteRow {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new DomainError("INVALID_QTY", `Quantity must be 1–${MAX_QTY}.`, 422);
  expireStaleQuotes(db, now);
  const id = newId("q");
  const tx = db.transaction(() => {
    const ctx = getContext(db, productId, now);
    if (!ctx.storeOpen || !ctx.published) throw new DomainError("STORE_CLOSED", "Store is closed; no quotes can be issued.", 409);
    if (ctx.stock.available < qty) throw new DomainError("INSUFFICIENT_STOCK", `Only ${ctx.stock.available} available.`, 409);
    const expires = new Date(now.getTime() + QUOTE_TTL_SECONDS * 1000);
    const unit = ctx.published.priceCents;
    db.prepare(
      `INSERT INTO price_quotes (id, product_id, price_version, unit_price_cents, qty, total_cents, currency, created_at, expires_at, status, sim_day, sim_hour)
       VALUES (?,?,?,?,?,?,?,?,?,'ACTIVE',?,?)`,
    ).run(id, productId, ctx.published.version, unit, qty, unit * qty, ctx.product.currency, now.toISOString(), expires.toISOString(), ctx.sim.sim_day, ctx.sim.current_hour);
    db.prepare("INSERT INTO exposure_events (product_id, sim_day, sim_hour, source, kind, count, price_cents, created_at) VALUES (?,?,?,?,?,?,?,?)").run(
      productId,
      ctx.sim.sim_day,
      ctx.sim.current_hour,
      "STOREFRONT",
      "QUOTE",
      1,
      unit,
      now.toISOString(),
    );
    audit(db, "shopper:anonymous", "quote.create", "price_quote", id, { unit, qty, version: ctx.published.version }, now);
  });
  tx.immediate();
  emit("quote", productId, { id });
  return getQuote(db, id);
}

function assertQuoteUsable(q: QuoteRow, now: Date) {
  if (q.status !== "ACTIVE") throw new DomainError("QUOTE_NOT_ACTIVE", `Quote is ${q.status}.`, 409);
  if (new Date(q.expires_at) <= now) throw new DomainError("QUOTE_EXPIRED", "Quote expired; request a new quote at the current price.", 410);
}

/** Idempotent per quote: one order per quote. */
export function createOrderFromQuote(db: DB, quoteId: string, now = new Date()): OrderRow {
  const existing = db.prepare("SELECT id FROM orders WHERE quote_id=?").get(quoteId) as { id: string } | undefined;
  if (existing) return getOrder(db, existing.id);
  expireStaleQuotes(db, now);
  const q = getQuote(db, quoteId);
  assertQuoteUsable(q, now);
  const id = newId("ord");
  const iso = now.toISOString();
  db.prepare(
    `INSERT INTO orders (id, quote_id, product_id, qty, unit_price_cents, total_cents, currency, payment_source, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,'CREATED',?,?)`,
  ).run(id, q.id, q.product_id, q.qty, q.unit_price_cents, q.total_cents, q.currency, paymentMode(), iso, iso);
  audit(db, "shopper:anonymous", "order.create", "order", id, { quoteId, total: q.total_cents }, now);
  return getOrder(db, id);
}

function setOrderStatus(db: DB, orderId: string, from: string[], to: string, now: Date, reason?: string): boolean {
  const r = db
    .prepare(`UPDATE orders SET status=?, failure_reason=COALESCE(?, failure_reason), updated_at=? WHERE id=? AND status IN (${from.map(() => "?").join(",")})`)
    .run(to, reason ?? null, now.toISOString(), orderId, ...from);
  return r.changes === 1;
}

function releaseQuote(db: DB, quoteId: string, status: "CANCELLED" | "EXPIRED") {
  db.prepare("UPDATE price_quotes SET status=? WHERE id=? AND status='ACTIVE'").run(status, quoteId);
}

/**
 * Mark an order paid and decrement inventory exactly once. Returns false if it was already paid.
 */
export function finalizePaid(
  db: DB,
  orderId: string,
  capture: { captureId: string; amountCents: number; currency: string; source: "PAYPAL_SANDBOX" | "MOCK_CHECKOUT"; via: string },
  now = new Date(),
): boolean {
  let applied = false;
  const tx = db.transaction(() => {
    const o = getOrder(db, orderId);
    if (o.status === "PAID") return;
    if (capture.amountCents !== o.total_cents || capture.currency !== o.currency) throw new DomainError("AMOUNT_MISMATCH", "Captured amount does not match order.", 409);
    const ok = db
      .prepare("UPDATE orders SET status='PAID', paid_at=?, updated_at=? WHERE id=? AND status IN ('CREATED','AWAITING_APPROVAL','CAPTURING','PAYMENT_PENDING')")
      .run(now.toISOString(), now.toISOString(), orderId);
    if (ok.changes !== 1) throw new DomainError("ORDER_NOT_PAYABLE", `Order is ${o.status}.`, 409);
    const q = getQuote(db, o.quote_id);
    const batch = db.prepare("SELECT id FROM inventory_batches WHERE product_id=? AND sim_day=? ORDER BY created_at DESC LIMIT 1").get(o.product_id, q.sim_day) as { id: string };
    const sim = db.prepare("SELECT sim_day, current_hour FROM sim_state WHERE product_id=?").get(o.product_id) as { sim_day: number; current_hour: number };
    const hour = sim.sim_day === q.sim_day ? sim.current_hour : q.sim_hour;
    db.prepare(
      "INSERT INTO inventory_movements (product_id, batch_id, type, qty_delta, unit_price_cents, source, order_id, sim_day, sim_hour, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(o.product_id, batch.id, "SALE", -o.qty, o.unit_price_cents, capture.source, o.id, q.sim_day, hour, now.toISOString());
    db.prepare("UPDATE price_quotes SET status='CONSUMED' WHERE id=?").run(o.quote_id);
    db.prepare("INSERT INTO exposure_events (product_id, sim_day, sim_hour, source, kind, count, price_cents, created_at) VALUES (?,?,?,?,?,?,?,?)").run(
      o.product_id,
      q.sim_day,
      hour,
      "STOREFRONT",
      "PURCHASE",
      o.qty,
      o.unit_price_cents,
      now.toISOString(),
    );
    db.prepare(
      "UPDATE payment_attempts SET capture_id=?, status='COMPLETED', verified=1, amount_cents=?, currency=?, updated_at=? WHERE order_id=? AND provider=?",
    ).run(capture.captureId, capture.amountCents, capture.currency, now.toISOString(), o.id, capture.source);
    audit(db, capture.source === "PAYPAL_SANDBOX" ? "paypal:sandbox" : "mock:checkout", "order.paid", "order", o.id, { ...capture }, now);
    applied = true;
  });
  tx.immediate();
  if (applied) {
    const o = getOrder(db, orderId);
    emit("sale", o.product_id, { orderId, source: capture.source, qty: o.qty });
  }
  return applied;
}

// ---------------------------------------------------------------- PayPal Sandbox

export async function createPayPalOrder(db: DB, api: PayPalApi, orderId: string, now = new Date()): Promise<{ paypalOrderId: string }> {
  const o = getOrder(db, orderId);
  if (o.payment_source !== "PAYPAL_SANDBOX") throw new DomainError("WRONG_PAYMENT_MODE", "Order was created in MOCK mode.", 409);
  const existing = db.prepare("SELECT provider_order_id FROM payment_attempts WHERE order_id=? AND provider='PAYPAL_SANDBOX'").get(orderId) as
    | { provider_order_id: string }
    | undefined;
  if (existing && o.status === "AWAITING_APPROVAL") return { paypalOrderId: existing.provider_order_id };
  if (o.status !== "CREATED") throw new DomainError("ORDER_NOT_PAYABLE", `Order is ${o.status}.`, 409);
  expireStaleQuotes(db, now);
  assertQuoteUsable(getQuote(db, o.quote_id), now);
  const ctx = getContext(db, o.product_id, now);
  const requestId = `create-${o.id}`;
  const pp = await api.createOrder({
    requestId,
    internalOrderId: o.id,
    sku: ctx.product.sku,
    name: ctx.product.name,
    qty: o.qty,
    unitValue: centsToValue(o.unit_price_cents),
    totalValue: centsToValue(o.total_cents),
    currency: o.currency,
  });
  const iso = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO payment_attempts (id, order_id, provider, provider_order_id, status, amount_cents, currency, idempotency_key, raw_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(idempotency_key) DO NOTHING`,
    ).run(newId("pay"), o.id, "PAYPAL_SANDBOX", pp.id, pp.status, o.total_cents, o.currency, requestId, JSON.stringify(pp), iso, iso);
    setOrderStatus(db, o.id, ["CREATED"], "AWAITING_APPROVAL", now);
    audit(db, "paypal:sandbox", "paypal.order_created", "order", o.id, { paypalOrderId: pp.id, status: pp.status }, now);
  })();
  return { paypalOrderId: pp.id };
}

function attemptByPayPalId(db: DB, paypalOrderId: string) {
  const a = db.prepare("SELECT * FROM payment_attempts WHERE provider_order_id=?").get(paypalOrderId) as { id: string; order_id: string } | undefined;
  if (!a) throw new DomainError("NOT_FOUND", "Unknown PayPal order.", 404);
  return a;
}

export type CaptureOutcome =
  | { status: "PAID"; alreadyProcessed: boolean; orderId: string; captureId?: string }
  | { status: "PAYMENT_PENDING"; orderId: string }
  | { status: "FAILED"; orderId: string; reason: string }
  | { status: "PENDING_RECONCILIATION"; orderId: string };

/** Verify a PayPal order representation against our order and apply it. */
export function applyPayPalOrderState(db: DB, orderId: string, pp: PayPalOrder, via: string, now = new Date()): CaptureOutcome {
  const o = getOrder(db, orderId);
  if (o.status === "PAID") return { status: "PAID", alreadyProcessed: true, orderId };
  const pu = pp.purchase_units?.[0];
  const cap = pu?.payments?.captures?.[0];
  const customId = pu?.custom_id ?? cap?.custom_id;
  if (!cap) {
    return { status: "PENDING_RECONCILIATION", orderId };
  }
  const amountCents = valueToCents(cap.amount?.value ?? "");
  if ((customId && customId !== o.id) || amountCents !== o.total_cents || cap.amount?.currency_code !== o.currency) {
    setOrderStatus(db, o.id, ["CREATED", "AWAITING_APPROVAL", "CAPTURING", "PAYMENT_PENDING"], "FAILED", now, "AMOUNT_OR_REFERENCE_MISMATCH");
    releaseQuote(db, o.quote_id, "CANCELLED");
    audit(db, "paypal:sandbox", "payment.mismatch", "order", o.id, { expected: o.total_cents, got: cap.amount, customId, captureId: cap.id, action: "MANUAL_REVIEW_REFUND" }, now);
    return { status: "FAILED", orderId, reason: "AMOUNT_OR_REFERENCE_MISMATCH" };
  }
  if (cap.status === "COMPLETED") {
    const applied = finalizePaid(db, o.id, { captureId: cap.id, amountCents, currency: cap.amount.currency_code, source: "PAYPAL_SANDBOX", via }, now);
    return { status: "PAID", alreadyProcessed: !applied, orderId, captureId: cap.id };
  }
  if (cap.status === "PENDING") {
    setOrderStatus(db, o.id, ["CAPTURING", "AWAITING_APPROVAL"], "PAYMENT_PENDING", now);
    db.prepare("UPDATE payment_attempts SET capture_id=?, status='PENDING', updated_at=? WHERE order_id=?").run(cap.id, now.toISOString(), o.id);
    return { status: "PAYMENT_PENDING", orderId };
  }
  setOrderStatus(db, o.id, ["CAPTURING", "AWAITING_APPROVAL", "PAYMENT_PENDING"], "FAILED", now, `CAPTURE_${cap.status}`);
  releaseQuote(db, o.quote_id, "CANCELLED");
  return { status: "FAILED", orderId, reason: `CAPTURE_${cap.status}` };
}

export async function capturePayPalOrder(db: DB, api: PayPalApi, paypalOrderId: string, now = new Date()): Promise<CaptureOutcome> {
  const attempt = attemptByPayPalId(db, paypalOrderId);
  const o = getOrder(db, attempt.order_id);
  if (o.status === "PAID") return { status: "PAID", alreadyProcessed: true, orderId: o.id };
  if (o.status === "AWAITING_APPROVAL") {
    const q = getQuote(db, o.quote_id);
    if (q.status !== "ACTIVE" || new Date(q.expires_at) <= now) {
      // Never capture after the price lock lapsed: the shopper gets a fresh quote instead.
      setOrderStatus(db, o.id, ["AWAITING_APPROVAL"], "EXPIRED", now, "QUOTE_EXPIRED");
      releaseQuote(db, q.id, "EXPIRED");
      throw new DomainError("QUOTE_EXPIRED", "Price lock expired before capture; no payment was taken. Please request a new quote.", 410);
    }
    if (!setOrderStatus(db, o.id, ["AWAITING_APPROVAL"], "CAPTURING", now)) {
      // lost a race with a concurrent capture; fall through and use PayPal idempotency
    }
  } else if (o.status !== "CAPTURING") {
    throw new DomainError("ORDER_NOT_PAYABLE", `Order is ${o.status}.`, 409);
  }

  let pp: PayPalOrder;
  try {
    pp = await api.captureOrder(paypalOrderId, `capture-${o.id}`);
  } catch (err) {
    if (err instanceof PayPalHttpError) {
      const issue = err.issue;
      if (issue === "ORDER_ALREADY_CAPTURED") {
        pp = await api.getOrder(paypalOrderId);
      } else if (issue === "INSTRUMENT_DECLINED") {
        setOrderStatus(db, o.id, ["CAPTURING"], "AWAITING_APPROVAL", now);
        audit(db, "paypal:sandbox", "payment.instrument_declined", "order", o.id, { issue }, now);
        throw new DomainError("INSTRUMENT_DECLINED", "Funding source declined; choose another payment method.", 402);
      } else {
        setOrderStatus(db, o.id, ["CAPTURING"], "FAILED", now, `PAYPAL_${issue ?? err.status}`);
        releaseQuote(db, o.quote_id, "CANCELLED");
        audit(db, "paypal:sandbox", "payment.capture_failed", "order", o.id, { status: err.status, issue }, now);
        return { status: "FAILED", orderId: o.id, reason: `PAYPAL_${issue ?? err.status}` };
      }
    } else {
      // Network error / timeout: outcome unknown. Keep CAPTURING (stock stays reserved) and reconcile.
      audit(db, "paypal:sandbox", "payment.capture_unknown", "order", o.id, { error: String(err) }, now);
      try {
        pp = await api.getOrder(paypalOrderId);
      } catch {
        return { status: "PENDING_RECONCILIATION", orderId: o.id };
      }
    }
  }
  return applyPayPalOrderState(db, o.id, pp, "capture", now);
}

/** Re-fetch PayPal order state for an order whose outcome is unknown. */
export async function reconcileOrder(db: DB, api: PayPalApi, orderId: string, now = new Date()): Promise<CaptureOutcome> {
  const a = db.prepare("SELECT provider_order_id FROM payment_attempts WHERE order_id=? AND provider='PAYPAL_SANDBOX'").get(orderId) as { provider_order_id: string } | undefined;
  if (!a) throw new DomainError("NOT_FOUND", "No PayPal attempt for order.", 404);
  const pp = await api.getOrder(a.provider_order_id);
  return applyPayPalOrderState(db, orderId, pp, "reconcile", now);
}

export function cancelOrder(db: DB, orderId: string, reason = "BUYER_CANCELLED", now = new Date()) {
  const o = getOrder(db, orderId);
  if (setOrderStatus(db, o.id, ["CREATED", "AWAITING_APPROVAL"], "CANCELLED", now, reason)) {
    releaseQuote(db, o.quote_id, "CANCELLED");
    const q = getQuote(db, o.quote_id);
    db.prepare("INSERT INTO exposure_events (product_id, sim_day, sim_hour, source, kind, count, price_cents, created_at) VALUES (?,?,?,?,?,?,?,?)").run(
      o.product_id,
      q.sim_day,
      q.sim_hour,
      "STOREFRONT",
      "ABANDON",
      1,
      q.unit_price_cents,
      now.toISOString(),
    );
    audit(db, "shopper:anonymous", "order.cancel", "order", o.id, { reason }, now);
    emit("order", o.product_id, { orderId, status: "CANCELLED" });
  }
  return getOrder(db, orderId);
}

export interface WebhookResult {
  httpStatus: number;
  note: string;
}

/** Signature-verified, deduplicated PayPal webhook processing. */
export async function handlePayPalWebhook(db: DB, api: PayPalApi, headers: Record<string, string | null>, rawBody: string, now = new Date()): Promise<WebhookResult> {
  let event: { id?: string; event_type?: string; resource?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { httpStatus: 400, note: "invalid json" };
  }
  if (!event.id || !event.event_type) return { httpStatus: 400, note: "missing id/event_type" };
  const seen = db.prepare("SELECT processed FROM webhook_events WHERE id=?").get(event.id) as { processed: number } | undefined;
  if (seen?.processed) return { httpStatus: 200, note: "duplicate (already processed)" };

  const verified = await api.verifyWebhookSignature(headers, event);
  if (!verified) {
    db.prepare("INSERT OR IGNORE INTO webhook_events (id, event_type, received_at, verified, processed, note) VALUES (?,?,?,0,0,?)").run(
      event.id,
      event.event_type,
      now.toISOString(),
      "signature verification failed",
    );
    return { httpStatus: 401, note: "signature verification failed" };
  }
  db.prepare("INSERT OR IGNORE INTO webhook_events (id, event_type, received_at, verified, processed) VALUES (?,?,?,1,0)").run(event.id, event.event_type, now.toISOString());

  let note = "ignored";
  const res = event.resource ?? {};
  const related = (res.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids?.order_id;
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" || event.event_type === "PAYMENT.CAPTURE.PENDING" || event.event_type === "PAYMENT.CAPTURE.DENIED") {
    if (related) {
      try {
        const attempt = attemptByPayPalId(db, related);
        // Confirm via the API rather than trusting the payload alone.
        const pp = await api.getOrder(related);
        const r = applyPayPalOrderState(db, attempt.order_id, pp, `webhook:${event.event_type}`, now);
        note = `applied: ${r.status}`;
      } catch (e) {
        note = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else note = "no related order id";
  } else if (event.event_type === "PAYMENT.CAPTURE.REFUNDED" || event.event_type === "PAYMENT.CAPTURE.REVERSED") {
    audit(db, "paypal:sandbox", "payment.refund_or_reversal", "webhook", event.id, { related }, now);
    note = "recorded for manual handling (refunds out of MVP scope)";
  }
  db.prepare("UPDATE webhook_events SET processed=1, note=? WHERE id=?").run(note, event.id);
  return { httpStatus: 200, note };
}

// ---------------------------------------------------------------- MOCK checkout (offline demo only)

export function payMockOrder(db: DB, orderId: string, outcome: "success" | "fail", now = new Date()): CaptureOutcome {
  const o = getOrder(db, orderId);
  if (o.payment_source !== "MOCK_CHECKOUT") throw new DomainError("WRONG_PAYMENT_MODE", "Mock payment is only available for MOCK_CHECKOUT orders.", 409);
  if (o.status === "PAID") return { status: "PAID", alreadyProcessed: true, orderId };
  if (o.status !== "CREATED") throw new DomainError("ORDER_NOT_PAYABLE", `Order is ${o.status}.`, 409);
  expireStaleQuotes(db, now);
  assertQuoteUsable(getQuote(db, o.quote_id), now);
  const iso = now.toISOString();
  db.prepare(
    `INSERT INTO payment_attempts (id, order_id, provider, status, amount_cents, currency, idempotency_key, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(idempotency_key) DO NOTHING`,
  ).run(newId("pay"), o.id, "MOCK_CHECKOUT", "CREATED", o.total_cents, o.currency, `mock-${o.id}`, iso, iso);
  if (outcome === "fail") {
    setOrderStatus(db, o.id, ["CREATED"], "FAILED", now, "MOCK_DECLINED");
    releaseQuote(db, o.quote_id, "CANCELLED");
    return { status: "FAILED", orderId, reason: "MOCK_DECLINED" };
  }
  const applied = finalizePaid(db, o.id, { captureId: `MOCK-${o.id}`, amountCents: o.total_cents, currency: o.currency, source: "MOCK_CHECKOUT", via: "mock" }, now);
  return { status: "PAID", alreadyProcessed: !applied, orderId };
}
