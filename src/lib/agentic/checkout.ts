/**
 * Agent-facing checkout, shaped after the Agentic Commerce Protocol checkout session that PayPal
 * Agent Ready accepts (create / update / get / complete / cancel on /checkout_sessions), with
 * PayPal as the payment provider and PayPal Orders v2 behind "complete".
 *
 * One addition the protocol doesn't have: a `negotiation` extension. A buyer agent may propose a
 * per-unit price; the stall's agent answers inside the owner's private limits. The agreed price is
 * locked server-side (a quote); clients never set amounts.
 *
 * Under the hood a session is a negotiation (+ quote, + order once completed). This module only
 * maps to and from the protocol shape.
 */
import type { DB } from "../db/client";
import { acceptCounter, buyerView, declineNegotiation, makeOffer, startNegotiation } from "../server/negotiation";
import { createOrderFromQuote, orderView } from "../server/commerce";
import { paymentMode } from "../paypal/client";
import { DomainError } from "../server/util";

export const PROTOCOL = {
  name: "Agentic Commerce Protocol (checkout sessions), as used by PayPal Agent Ready",
  payment_provider: "paypal",
  extension: "negotiation (this project)",
};

type Status = "not_ready_for_payment" | "ready_for_payment" | "in_progress" | "completed" | "canceled";

export function sessionView(db: DB, id: string) {
  const v = buyerView(db, id);
  const p = db
    .prepare("SELECT p.id, p.sku, p.name, p.unit, p.store_id, s.name AS shop FROM negotiations n JOIN products p ON p.id=n.product_id JOIN stores s ON s.id=p.store_id WHERE n.id=?")
    .get(id) as { id: string; sku: string; name: string; unit: string; store_id: string; shop: string };
  const ord = v.quote ? (db.prepare("SELECT id FROM orders WHERE quote_id=?").get(v.quote.id) as { id: string } | undefined) : undefined;
  const o = ord ? orderView(db, ord.id) : null;
  const unit = v.agreedPriceCents ?? v.listedPriceCents;
  const base = v.listedPriceCents * v.qty;
  const total = unit * v.qty;
  let status: Status =
    v.status === "AGREED" ? "ready_for_payment" : v.status === "OPEN" ? "not_ready_for_payment" : "canceled";
  if (o) status = o.order.status === "PAID" ? "completed" : ["CREATED", "AWAITING_APPROVAL"].includes(o.order.status) ? "in_progress" : "canceled";
  const last = [...v.messages].reverse().find((m) => m.role === "seller");
  return {
    id: v.id,
    object: "checkout_session",
    status,
    currency: "usd",
    merchant: { id: p.store_id, name: p.shop },
    line_items: [{ id: p.sku, product_id: p.id, item: { id: p.sku, title: p.name, unit: p.unit, quantity: v.qty }, base_amount: base, discount: base - total, total }],
    totals: [
      { type: "items_base_amount", display_text: "Listed", amount: base },
      { type: "discount", display_text: "Agreed with the stall", amount: base - total },
      { type: "total", display_text: "Total", amount: total },
    ],
    payment_provider: { provider: "paypal", supported_payment_methods: ["paypal"], mode: paymentMode() === "PAYPAL_SANDBOX" ? "test" : "practice" },
    negotiation: {
      status: v.status,
      offers_left: v.offersLeft,
      offers_used: v.offersUsed,
      seller_counter_per_unit: v.sellerCounterCents,
      seller_counter_is_final: v.sellerCounterIsFinal,
      agreed_per_unit: v.agreedPriceCents,
      price_held_until: v.quote?.expires_at ?? null,
    },
    messages: last ? [{ type: "info", content_type: "plain", content: last.text }] : [],
    conversation: v.messages.map((m) => ({ role: m.role, text: m.text })),
    order: o ? { id: o.order.id, status: o.order.status, payment_source: o.order.payment_source, paypal_order_id: o.payment?.provider_order_id ?? null, capture_id: o.payment?.capture_id ?? null } : null,
  };
}

function productBySku(db: DB, sku: string) {
  const r = db.prepare("SELECT id, base_price_cents FROM products WHERE sku=?").get(sku) as { id: string; base_price_cents: number } | undefined;
  if (!r) throw new DomainError("NOT_FOUND", `Unknown item ${sku}`, 404);
  return r;
}

export function createSession(
  db: DB,
  body: { items?: { id?: string; quantity?: number }[]; negotiation?: { offer_per_unit?: number }; buyer?: { agent?: string } },
) {
  const li = body.items?.[0];
  if (!li?.id || body.items!.length !== 1) throw new DomainError("VALIDATION", "Send exactly one item: items: [{ id: <sku>, quantity }]", 422);
  const prod = productBySku(db, li.id);
  const offer = body.negotiation?.offer_per_unit;
  const listed = (db.prepare("SELECT price_cents FROM published_prices WHERE product_id=? ORDER BY version DESC LIMIT 1").get(prod.id) as { price_cents: number } | undefined)?.price_cents ?? prod.base_price_cents;
  // No proposal means the agent takes the listed price.
  const v = startNegotiation(db, prod.id, offer === undefined ? listed : Number(offer), body.buyer?.agent ?? "buyer-agent", new Date(), Number(li.quantity ?? 1));
  return sessionView(db, v.id);
}

export function updateSession(db: DB, id: string, body: { negotiation?: { offer_per_unit?: number; accept_counter?: boolean; quantity?: number } }) {
  const n = body.negotiation ?? {};
  if (n.accept_counter) acceptCounter(db, id);
  else if (n.offer_per_unit !== undefined) makeOffer(db, id, Number(n.offer_per_unit), new Date(), n.quantity === undefined ? undefined : Number(n.quantity));
  else throw new DomainError("VALIDATION", "Send negotiation.offer_per_unit or negotiation.accept_counter.", 422);
  return sessionView(db, id);
}

/** Turns the agreed session into an order. Payment then goes through PayPal and needs the buyer's approval. */
export function completeSession(db: DB, id: string) {
  const v = buyerView(db, id);
  if (v.status !== "AGREED" || !v.quote) throw new DomainError("NOT_READY", "No agreed price yet.", 409);
  createOrderFromQuote(db, v.quote.id);
  return sessionView(db, id);
}

export function cancelSession(db: DB, id: string) {
  declineNegotiation(db, id);
  return sessionView(db, id);
}
