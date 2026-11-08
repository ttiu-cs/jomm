/**
 * Buyer-agent ↔ seller-agent negotiation for one unit.
 *
 * The seller's lowest acceptable price (walk-away) comes from the pricing engine: the opportunity
 * cost of the unit given stock, time left and forecast demand, adjusted for cannibalization and
 * capped by merchant policy. It is never revealed to the buyer. The seller concedes in fixed steps
 * over at most three buyer offers, so outcomes are deterministic and explainable. An agreement
 * becomes an ordinary server-side price-locked quote, paid through the normal checkout.
 */
import type { DB } from "../db/client";
import { walkAwayPrice, type WalkAwayResult } from "../pricing/optimizer";
import { REFUSED_BUYER_BUY_PROB } from "../pricing/scenario";
import { createQuote, type QuoteRow } from "./commerce";
import { expireStaleQuotes, getContext, type ProductContext } from "./context";
import { emit } from "./events";
import { DomainError, audit, newId } from "./util";

export const MAX_BUYER_OFFERS = 3;
const CONCESSION = [0.35, 0.7, 1.0]; // share of (published − walk-away) conceded at buyer offer 1, 2, 3
const TTL_MS = 10 * 60 * 1000;

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const ceil25 = (c: number) => Math.ceil(c / 25) * 25;
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export interface NegotiationRow {
  id: string;
  product_id: string;
  sim_day: number;
  sim_hour: number;
  buyer_label: string;
  status: "OPEN" | "AGREED" | "CLOSED" | "EXPIRED";
  buyer_offers: number;
  last_counter_cents: number | null;
  final_counter: number;
  agreed_price_cents: number | null;
  quote_id: string | null;
  published_cents: number;
  walk_away_cents: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface NegotiationMessage {
  role: "buyer" | "seller";
  kind: string;
  price_cents: number | null;
  text: string;
  created_at: string;
}

/** Seller-private pricing view for negotiation (merchant / demo only; never sent to buyers). */
export function sellerNegotiationView(db: DB, productId: string, now = new Date()) {
  expireStaleQuotes(db, now);
  const ctx = getContext(db, productId, now);
  const w = computeWalkAway(ctx);
  return { ...w, reason: sellerReason(ctx, w), storeOpen: ctx.storeOpen, closeHour: ctx.product.closeHour, maxDiscountBps: ctx.policy.maxNegotiationDiscountBps };
}

function computeWalkAway(ctx: ProductContext): WalkAwayResult {
  if (!ctx.published) throw new DomainError("NO_PRICE", "No published price.", 409);
  return walkAwayPrice(
    {
      state: {
        hour: ctx.sim.current_hour,
        openHour: ctx.product.openHour,
        closeHour: ctx.batch ? Math.min(ctx.product.closeHour, ctx.batch.sellByHour) : ctx.product.closeHour,
        availableStock: ctx.storeOpen ? ctx.stock.available : 0,
        currentPriceCents: ctx.published.priceCents,
        minutesSinceLastChange: ctx.minutesSinceLastChange,
        confidence: ctx.confidence,
      },
      policy: ctx.policy,
      costs: ctx.costs,
      model: ctx.model,
      ctx: { weather: ctx.sim.weather, event: ctx.sim.event, demandMultiplier: 1, calibration: ctx.calibration },
    },
    { refusedBuyerBuyProb: REFUSED_BUYER_BUY_PROB, maxDiscountBps: ctx.policy.maxNegotiationDiscountBps },
  );
}

/** One plain-language sentence on why the seller can or cannot discount right now. */
function sellerReason(ctx: ProductContext, w: WalkAwayResult): string {
  if (!w.available) return ctx.storeOpen ? "Sold out." : "Store is closed.";
  const left = `${w.stock} left`;
  if (w.regime === "SCARCE")
    return `${left} but about ${Math.round(w.expectedDemandAtPublished)} shoppers are expected to buy at ${fmt(w.publishedCents)} before ${hh(w.hour + w.hoursRemaining)}. Every salad will sell at full price, so no discount.`;
  if (w.regime === "SURPLUS")
    return `${left} and only about ${Math.round(w.expectedDemandAtPublished)} expected sales before ${hh(w.hour + w.hoursRemaining)}. Unsold salads are thrown away, so a sale above ${fmt(w.walkAwayCents)} beats waste.`;
  return `${left} with about ${Math.round(w.expectedDemandAtPublished)} expected sales. Small discounts only.`;
}

function sellerLine(kind: "ACCEPT" | "COUNTER" | "FINAL" | "REJECT", price: number, w: WalkAwayResult): string {
  const why =
    w.regime === "SCARCE"
      ? `Lunch demand is strong and I have ${w.stock} left.`
      : w.regime === "SURPLUS"
        ? `I have ${w.stock} left and ${w.hoursRemaining} hour${w.hoursRemaining === 1 ? "" : "s"} to sell them.`
        : `Demand is steady today.`;
  if (kind === "ACCEPT") return `Deal at ${fmt(price)}. I'm locking that price for you for 5 minutes.`;
  if (kind === "COUNTER") return `${why} I can do ${fmt(price)}.`;
  if (kind === "FINAL") return `${why} ${fmt(price)} is my best price right now.`;
  return `${why} I can't go lower than ${fmt(price)} right now.`;
}

function getNeg(db: DB, id: string): NegotiationRow {
  const n = db.prepare("SELECT * FROM negotiations WHERE id=?").get(id) as NegotiationRow | undefined;
  if (!n) throw new DomainError("NOT_FOUND", "Negotiation not found", 404);
  return n;
}

function addMsg(db: DB, id: string, role: "buyer" | "seller", kind: string, price: number | null, text: string, now: Date) {
  db.prepare("INSERT INTO negotiation_messages (negotiation_id, role, kind, price_cents, text, created_at) VALUES (?,?,?,?,?,?)").run(id, role, kind, price, text, now.toISOString());
}

/** Buyer-safe view: never includes the walk-away price. */
export function buyerView(db: DB, id: string) {
  const n = getNeg(db, id);
  const messages = db.prepare("SELECT role, kind, price_cents, text, created_at FROM negotiation_messages WHERE negotiation_id=? ORDER BY id").all(id) as NegotiationMessage[];
  type QuoteSummary = Pick<QuoteRow, "id" | "unit_price_cents" | "total_cents" | "expires_at" | "status">;
  const quote = n.quote_id
    ? ((db.prepare("SELECT id, unit_price_cents, total_cents, expires_at, status FROM price_quotes WHERE id=?").get(n.quote_id) as QuoteSummary | undefined) ?? null)
    : null;
  return {
    id: n.id,
    status: n.status,
    listedPriceCents: n.published_cents,
    offersUsed: n.buyer_offers,
    offersLeft: n.final_counter ? 0 : MAX_BUYER_OFFERS - n.buyer_offers,
    sellerCounterCents: n.last_counter_cents,
    sellerCounterIsFinal: !!n.final_counter,
    agreedPriceCents: n.agreed_price_cents,
    quote,
    expiresAt: n.expires_at,
    messages,
  };
}

function expireIfStale(db: DB, n: NegotiationRow, now: Date): NegotiationRow {
  if (n.status === "OPEN" && new Date(n.expires_at) <= now) {
    db.prepare("UPDATE negotiations SET status='EXPIRED', updated_at=? WHERE id=?").run(now.toISOString(), n.id);
    return getNeg(db, n.id);
  }
  return n;
}

function agree(db: DB, n: NegotiationRow, price: number, now: Date) {
  const quote = createQuote(db, n.product_id, 1, now, { unitPriceCents: price, origin: "NEGOTIATION" });
  db.prepare("UPDATE negotiations SET status='AGREED', agreed_price_cents=?, quote_id=?, updated_at=? WHERE id=?").run(price, quote.id, now.toISOString(), n.id);
  audit(db, `buyer-agent:${n.buyer_label}`, "negotiation.agreed", "negotiation", n.id, { price, published: n.published_cents, quoteId: quote.id }, now);
}

function validateOffer(offerCents: number, published: number) {
  if (!Number.isInteger(offerCents) || offerCents < 50 || offerCents > published * 3) throw new DomainError("INVALID_OFFER", "Offer must be a whole number of cents within a sensible range.", 422);
}

function respond(db: DB, n: NegotiationRow, offerCents: number, now: Date) {
  const ctx = getContext(db, n.product_id, now);
  const w = computeWalkAway(ctx);
  const k = n.buyer_offers + 1;
  db.prepare("UPDATE negotiations SET buyer_offers=?, walk_away_cents=?, published_cents=?, updated_at=? WHERE id=?").run(k, w.walkAwayCents, w.publishedCents, now.toISOString(), n.id);
  addMsg(db, n.id, "buyer", "OFFER", offerCents, `I'd like one ${ctx.product.name} for ${fmt(offerCents)}.`, now);

  if (!w.available) {
    db.prepare("UPDATE negotiations SET status='CLOSED' WHERE id=?").run(n.id);
    addMsg(db, n.id, "seller", "REJECT", null, ctx.storeOpen ? "Sorry, we're sold out." : "Sorry, we're closed for today.", now);
    return;
  }
  const pub = w.publishedCents;
  if (offerCents >= pub) {
    addMsg(db, n.id, "seller", "ACCEPT", pub, `That's at or above our listed price. Deal at ${fmt(pub)}.`, now);
    agree(db, getNeg(db, n.id), pub, now);
    return;
  }
  // Concede a fixed share of the gap each round; never below walk-away, never above the last counter.
  let target = k >= MAX_BUYER_OFFERS ? w.walkAwayCents : Math.max(w.walkAwayCents, ceil25(pub - (pub - w.walkAwayCents) * CONCESSION[k - 1]));
  if (n.last_counter_cents !== null) target = Math.min(target, n.last_counter_cents);
  target = Math.min(target, pub);
  if (offerCents >= target) {
    addMsg(db, n.id, "seller", "ACCEPT", offerCents, sellerLine("ACCEPT", offerCents, w), now);
    agree(db, getNeg(db, n.id), offerCents, now);
    return;
  }
  const final = k >= MAX_BUYER_OFFERS || target === w.walkAwayCents;
  const counter = final ? Math.min(pub, Math.max(target, w.walkAwayCents)) : target;
  db.prepare("UPDATE negotiations SET last_counter_cents=?, final_counter=? WHERE id=?").run(counter, final ? 1 : 0, n.id);
  addMsg(db, n.id, "seller", final ? "FINAL" : "COUNTER", counter, sellerLine(final ? "FINAL" : "COUNTER", counter, w), now);
}

export function startNegotiation(db: DB, productId: string, offerCents: number, buyerLabel = "demo-buyer-agent", now = new Date()) {
  expireStaleQuotes(db, now);
  const ctx = getContext(db, productId, now);
  if (!ctx.published) throw new DomainError("NO_PRICE", "No published price.", 409);
  validateOffer(offerCents, ctx.published.priceCents);
  const id = newId("neg");
  const label = buyerLabel.replace(/[^\w.-]/g, "").slice(0, 40) || "buyer-agent";
  db.transaction(() => {
    db.prepare(
      `INSERT INTO negotiations (id, product_id, sim_day, sim_hour, buyer_label, status, published_cents, walk_away_cents, created_at, updated_at, expires_at)
       VALUES (?,?,?,?,?,'OPEN',?,?,?,?,?)`,
    ).run(id, productId, ctx.sim.sim_day, ctx.sim.current_hour, label, ctx.published!.priceCents, ctx.published!.priceCents, now.toISOString(), now.toISOString(), new Date(now.getTime() + TTL_MS).toISOString());
    respond(db, getNeg(db, id), offerCents, now);
  }).immediate();
  emit("negotiation", productId, { id });
  return buyerView(db, id);
}

export function makeOffer(db: DB, id: string, offerCents: number, now = new Date()) {
  let n = expireIfStale(db, getNeg(db, id), now);
  if (n.status !== "OPEN") throw new DomainError("NEGOTIATION_CLOSED", `Negotiation is ${n.status}.`, 409);
  if (n.final_counter || n.buyer_offers >= MAX_BUYER_OFFERS) throw new DomainError("NO_OFFERS_LEFT", "The seller made a final offer. Accept it or walk away.", 409);
  validateOffer(offerCents, n.published_cents);
  db.transaction(() => {
    n = getNeg(db, id);
    respond(db, n, offerCents, now);
  }).immediate();
  emit("negotiation", n.product_id, { id });
  return buyerView(db, id);
}

export function acceptCounter(db: DB, id: string, now = new Date()) {
  const n = expireIfStale(db, getNeg(db, id), now);
  if (n.status !== "OPEN") throw new DomainError("NEGOTIATION_CLOSED", `Negotiation is ${n.status}.`, 409);
  if (n.last_counter_cents === null) throw new DomainError("NO_COUNTER", "There is no seller counteroffer to accept.", 409);
  db.transaction(() => {
    addMsg(db, id, "buyer", "ACCEPT", n.last_counter_cents, `Accepted at ${fmt(n.last_counter_cents!)}.`, now);
    addMsg(db, id, "seller", "ACCEPT", n.last_counter_cents, `Deal at ${fmt(n.last_counter_cents!)}. I'm locking that price for you for 5 minutes.`, now);
    agree(db, n, n.last_counter_cents!, now);
  }).immediate();
  emit("negotiation", n.product_id, { id });
  return buyerView(db, id);
}

export function declineNegotiation(db: DB, id: string, now = new Date()) {
  const n = getNeg(db, id);
  if (n.status === "OPEN") {
    db.prepare("UPDATE negotiations SET status='CLOSED', updated_at=? WHERE id=?").run(now.toISOString(), id);
    addMsg(db, id, "buyer", "DECLINE", null, "No thanks, that's above my budget.", now);
    emit("negotiation", n.product_id, { id });
  }
  return buyerView(db, id);
}

export function listNegotiations(db: DB, productId: string, limit = 10) {
  return db
    .prepare("SELECT id, status, buyer_label, buyer_offers, published_cents, walk_away_cents, agreed_price_cents, sim_hour, created_at FROM negotiations WHERE product_id=? ORDER BY created_at DESC LIMIT ?")
    .all(productId, limit);
}
