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
import type { SellingRules } from "../teach/parser";

export const MAX_BUYER_OFFERS = 3;
export const MAX_NEGOTIATION_QTY = 10;
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
  qty: number;
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
export function sellerNegotiationView(db: DB, productId: string, now = new Date(), qty = 1) {
  expireStaleQuotes(db, now);
  const ctx = getContext(db, productId, now);
  const st = computeStrategy(db, ctx, qty, now);
  const reason = st.knowledge ? taughtReason(st) : sellerReason(ctx, st.w);
  return { ...st.w, reason, why: st.why ?? null, pressure: st.pressure ?? null, storeOpen: ctx.storeOpen, closeHour: ctx.product.closeHour, maxDiscountBps: ctx.policy.maxNegotiationDiscountBps, sellBy: st.knowledge?.sell_by ?? null, unit: st.unit };
}

export interface Knowledge {
  floor_cents: number;
  sell_by: "today" | "this_week" | "no_rush";
  condition: string | null;
  facts: string[];
  rules: SellingRules;
}

export function getKnowledge(db: DB, productId: string): Knowledge | null {
  const k = db.prepare("SELECT floor_cents, sell_by, condition, facts_json, rules_json FROM product_knowledge WHERE product_id=?").get(productId) as
    | { floor_cents: number; sell_by: Knowledge["sell_by"]; condition: string | null; facts_json: string; rules_json: string | null }
    | undefined;
  return k ? { floor_cents: k.floor_cents, sell_by: k.sell_by, condition: k.condition, facts: JSON.parse(k.facts_json), rules: JSON.parse(k.rules_json || "{}") } : null;
}

const hasRules = (k: Knowledge | null) => !!k && Object.values(k.rules ?? {}).some((v) => v !== undefined && v !== null);
/** Owners who taught selling rules get a longer, reasoned haggle (4 offers); others the short one (3). */
export function maxOffersFor(db: DB, productId: string) {
  return hasRules(getKnowledge(db, productId)) ? 4 : MAX_BUYER_OFFERS;
}

/** Hour of day at the stall (fractional), in the stall's own time zone. */
function stallHour(tz: string, now: Date) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 12);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return h + m / 60;
  } catch {
    return now.getUTCHours();
  }
}
const OPEN_HOUR = 8;
const hourLabel = (h: number) => `${((Math.round(h) + 11) % 12) + 1} ${h >= 12 ? "pm" : "am"}`;

/**
 * How much of the gap between listed price and the owner's floor the agent may give up, from what
 * the owner taught: urgency, time left before closing, how it usually sells, what happens to
 * leftovers, and how the price compares with what shoppers pay elsewhere. Each factor is recorded
 * so the owner can see why.
 */
export function sellingPressure(k: Knowledge, listCents: number, hour: number) {
  const r = k.rules ?? {};
  const why: { factor: string; effect: number }[] = [];
  const add = (factor: string, effect: number) => why.push({ factor, effect });
  add(k.sell_by === "today" ? "Must sell today" : k.sell_by === "this_week" ? "Should sell this week" : "No rush", k.sell_by === "today" ? 0.55 : k.sell_by === "this_week" ? 0.3 : 0.12);
  if (k.sell_by === "today" && typeof r.closeHour === "number") {
    const span = Math.max(1, r.closeHour - OPEN_HOUR);
    const elapsed = Math.min(1, Math.max(0, (hour - OPEN_HOUR) / span));
    add(`${Math.round(elapsed * 100)}% of the day gone (closes ${hourLabel(r.closeHour)})`, +(0.35 * elapsed).toFixed(2));
  }
  if (r.demand === "slow") add("Selling slowly", 0.15);
  if (r.demand === "high") add("Usually sells out", -0.2);
  if (r.leftover === "waste" && k.sell_by !== "no_rush") add("Unsold ones are wasted", 0.1);
  if (r.leftover === "use") add("Leftovers get used", -0.05);
  if (typeof r.marketCents === "number" && r.marketCents > 0) {
    const ratio = listCents / r.marketCents;
    if (ratio > 1.05) add(`Priced above ${r.marketNote ?? "elsewhere"} (${fmt(r.marketCents)})`, 0.1);
    else if (ratio < 0.95) add(`Already cheaper than ${r.marketNote ?? "elsewhere"} (${fmt(r.marketCents)})`, -0.1);
  }
  const p = Math.min(1, Math.max(0, why.reduce((a, w) => a + w.effect, 0)));
  return { pressure: p, why };
}

/** Owner-taught urgency: how much of the gap between listed price and owner floor the agent may give up. */
const TAUGHT_MAX_CONCESSION: Record<Knowledge["sell_by"], number> = { today: 1.0, this_week: 0.7, no_rush: 0.4 };
const TAUGHT_SCHEDULE: Record<Knowledge["sell_by"], number[]> = { today: [0.5, 0.85, 1.0], this_week: [0.4, 0.75, 1.0], no_rush: [0.35, 0.7, 1.0] };

interface Strategy {
  w: WalkAwayResult;
  schedule: number[];
  step: number; // price rounding step for counters
  knowledge: Knowledge | null;
  unit: string;
  maxOffers: number;
  /** Rules-based haggle only: the list price after any bulk deal, and the reasoning. */
  listForQty?: number;
  bulkApplied?: { minQty: number; pctOff: number } | null;
  pressure?: number;
  why?: { factor: string; effect: number }[];
}

function computeStrategy(db: DB, ctx: ProductContext, qty = 1, now = new Date()): Strategy {
  const k = getKnowledge(db, ctx.product.id);
  const unit = (db.prepare("SELECT unit FROM products WHERE id=?").get(ctx.product.id) as { unit: string }).unit;
  if (!k) return { w: computeWalkAway(ctx), schedule: CONCESSION, step: 25, knowledge: null, unit, maxOffers: MAX_BUYER_OFFERS };
  if (hasRules(k)) return rulesStrategy(ctx, k, unit, qty, now);
  if (!ctx.published) throw new DomainError("NO_PRICE", "No published price.", 409);
  const list = ctx.published.priceCents;
  const floor = Math.min(list, k.floor_cents);
  const walk = Math.round(list - (list - floor) * TAUGHT_MAX_CONCESSION[k.sell_by]);
  const stock = ctx.storeOpen ? ctx.stock.available : 0;
  return {
    w: {
      available: stock > 0,
      stock,
      hour: ctx.sim.current_hour,
      hoursRemaining: 24,
      publishedCents: list,
      marginalValueCents: 0,
      walkAwayCents: walk,
      floorCents: floor,
      expectedDemandAtPublished: 0,
      regime: k.sell_by === "today" ? "SURPLUS" : k.sell_by === "this_week" ? "BALANCED" : "SCARCE",
    },
    schedule: TAUGHT_SCHEDULE[k.sell_by],
    step: 5,
    knowledge: k,
    unit,
    maxOffers: MAX_BUYER_OFFERS,
  };
}

/** Haggle from the owner's selling rules: pressure sets the walk-away, bulk deals lower both ends. */
function rulesStrategy(ctx: ProductContext, k: Knowledge, unit: string, qty: number, now: Date): Strategy {
  if (!ctx.published) throw new DomainError("NO_PRICE", "No published price.", 409);
  const list = ctx.published.priceCents;
  const floor = Math.min(list, k.floor_cents);
  const up5 = (c: number) => Math.ceil(c / 5) * 5;
  const { pressure, why } = sellingPressure(k, list, stallHour(ctx.product.timezone, now));
  let walk = Math.max(floor, Math.min(list, up5(list - (list - floor) * pressure)));
  const bulk = k.rules.bulk && qty >= k.rules.bulk.minQty ? k.rules.bulk : null;
  let listForQty = list;
  if (bulk) {
    listForQty = up5(list * (1 - bulk.pctOff / 100));
    walk = Math.max(floor, Math.min(listForQty, up5(walk * (1 - bulk.pctOff / 100))));
    why.push({ factor: `Bulk deal: ${bulk.pctOff}% off ${bulk.minQty}+`, effect: 0 });
  }
  const stock = ctx.storeOpen ? ctx.stock.available : 0;
  return {
    w: {
      available: stock > 0,
      stock,
      hour: ctx.sim.current_hour,
      hoursRemaining: 24,
      publishedCents: list,
      marginalValueCents: 0,
      walkAwayCents: walk,
      floorCents: floor,
      expectedDemandAtPublished: 0,
      regime: pressure > 0.6 ? "SURPLUS" : pressure > 0.3 ? "BALANCED" : "SCARCE",
    },
    schedule: [0.3, 0.6, 0.85, 1.0],
    step: 5,
    knowledge: k,
    unit,
    maxOffers: 4,
    listForQty,
    bulkApplied: bulk,
    pressure,
    why,
  };
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

const SELL_BY_TEXT: Record<Knowledge["sell_by"], string> = { today: "needs to sell today", this_week: "should sell this week", no_rush: "isn't in a hurry" };

function taughtReason(st: Strategy): string {
  const k = st.knowledge!;
  if (!st.w.available) return "Sold out.";
  if (st.why) {
    const parts = st.why.map((w) => `${w.factor}${w.effect ? ` (${w.effect > 0 ? "+" : "−"}${Math.round(Math.abs(w.effect) * 100)})` : ""}`);
    const per = st.unit === "each" ? "" : ` per ${st.unit}`;
    return `Will go down to ${fmt(st.w.walkAwayCents)}${per} (your lowest is ${fmt(k.floor_cents)}). Willingness ${Math.round((st.pressure ?? 0) * 100)}%: ${parts.join(" · ")}.`;
  }
  return `The owner ${SELL_BY_TEXT[k.sell_by]} and set a floor of ${fmt(k.floor_cents)} per ${st.unit}. With ${st.w.stock} ${st.unit} left, I can go down to ${fmt(st.w.walkAwayCents)}.`;
}

/** " a pound", " a box", "" for single items: how a stall owner says the unit out loud. */
export function perSpoken(unit: string): string {
  if (unit === "each") return "";
  return ` a ${unit === "lb" ? "pound" : unit === "kg" ? "kilo" : unit}`;
}
/** "2 boxes", "3 lb": units said the way people say them. */
export function unitsSpoken(n: number, unit: string): string {
  if (unit === "lb" || unit === "kg" || unit === "each") return unit === "each" ? "" : unit;
  return n > 1 ? (/(x|s|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`) : unit;
}
function totalSpoken(price: number, qty: number, unit: string): string {
  if (qty <= 1) return "";
  return `, that’s ${fmt(price * qty)} for ${qty}${unit === "each" ? "" : ` ${unitsSpoken(qty, unit)}`}`;
}
/** First person, in the stall's own voice: the owner's words become the assistant's words. */
function taughtLine(kind: "ACCEPT" | "COUNTER" | "FINAL" | "REJECT", price: number, st: Strategy, qty: number, round = 1): string {
  const k = st.knowledge!;
  // Lead with something that sells; flaws are disclosed in the listing, not used as a haggling line.
  const selling = k.facts.filter((f) => !/\b(soft|stain|flaw|worn|bruis|scratch|tear|dent|old)/i.test(f));
  const fact = selling[(round - 1) % Math.max(1, selling.length)];
  const said = fact ? `${fact.replace(/[.!]$/, "")}. ` : "";
  const per = perSpoken(st.unit);
  const total = totalSpoken(price, qty, st.unit);
  if (kind === "ACCEPT") return `You’ve got a deal: ${fmt(price)}${per}${total}. I’ll hold them for you for 5 minutes.`;
  if (kind === "COUNTER")
    return round <= 1 ? `${said}I can’t do that, but I can do ${fmt(price)}${per}${total}.` : `Let’s meet in the middle: ${fmt(price)}${per}${total}.`;
  if (kind === "FINAL")
    return k.sell_by === "today"
      ? `These need to go today, so ${fmt(price)}${per}${total}. That’s as low as I go.`
      : `${fmt(price)}${per}${total} is as low as I go. They’re worth it, promise.`;
  return `Sorry, I can’t go under ${fmt(price)}${per}.`;
}

/** The stall's lines when the owner taught selling rules: every move comes with a reason. */
function rulesLine(kind: "ACCEPT" | "COUNTER" | "FINAL" | "REJECT", price: number, st: Strategy, qty: number, round: number): string {
  const k = st.knowledge!;
  const r = k.rules;
  const per = perSpoken(st.unit);
  const total = totalSpoken(price, qty, st.unit);
  const bulk = st.bulkApplied ? `Since you’re taking ${qty} ${unitsSpoken(qty, st.unit)}, that’s with my ${st.bulkApplied.pctOff}% bulk discount. ` : "";
  const selling = k.facts.filter((f) => !/\b(soft|stain|flaw|worn|bruis|scratch|tear|dent|old)/i.test(f));
  const said = selling[0] ? `${selling[0].replace(/[.!]$/, "")}. ` : "";
  const cheaperThanMarket = typeof r.marketCents === "number" && st.w.publishedCents < r.marketCents * 0.95;
  const market =
    typeof r.marketCents !== "number"
      ? ""
      : r.marketSource === "channel3"
        ? `New ones sell for about ${fmt(r.marketCents)} online`
        : `${capitalize(r.marketNote ?? "other shops")} ${/supermarket|store|market|stand|stall|shop/.test(r.marketNote ?? "") ? "charges" : "charge"} ${fmt(r.marketCents)}${per}`;
  const closing = k.sell_by === "today" && typeof r.closeHour === "number" ? `We close at ${hourLabel(r.closeHour)} and I’d like these gone today` : "";
  if (kind === "ACCEPT") return `${bulk}You’ve got a deal: ${fmt(price)}${per}${total}. I’ll hold them for you for 5 minutes.`;
  if (kind === "REJECT") return `Sorry, I can’t go under ${fmt(price)}${per}.`;
  if (kind === "FINAL") {
    const why =
      r.leftover === "waste" && k.sell_by !== "no_rush"
        ? "I’d rather you have them than see them go to waste"
        : cheaperThanMarket
          ? r.marketSource === "channel3"
            ? `new ones sell for about ${fmt(r.marketCents!)} online, so it’s already a steal`
            : `that’s still well under ${r.marketNote ?? "other shops"}`
          : r.demand === "high"
            ? "these always sell out"
            : "they’re worth it, promise";
    return `${bulk}${fmt(price)}${per}${total} is truly my best. ${capitalize(why)}.`;
  }
  // COUNTER: a different reason each round, the way a stall owner talks.
  if (round <= 1) return `${said}${cheaperThanMarket ? `${market}, so this is already a good deal. ` : ""}${bulk}I can do ${fmt(price)}${per}${total}.`;
  if (round === 2) {
    if (closing) return `${closing}, so ${fmt(price)}${per}${total}.`;
    if (r.demand === "high") return `These usually sell out, but for you: ${fmt(price)}${per}${total}.`;
    if (market && !cheaperThanMarket) return `${market}, and mine are fresher. ${fmt(price)}${per}${total}?`;
    return `Let’s meet in the middle: ${fmt(price)}${per}${total}.`;
  }
  if (r.demand === "slow") return `It’s been a slow week, so okay: ${fmt(price)}${per}${total}.`;
  return `Alright, ${fmt(price)}${per}${total}. That’s close to my limit.`;
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
  const unit = (db.prepare("SELECT unit FROM products WHERE id=?").get(n.product_id) as { unit: string } | undefined)?.unit ?? "each";
  return {
    id: n.id,
    status: n.status,
    qty: n.qty,
    unit,
    listedPriceCents: n.published_cents,
    offersUsed: n.buyer_offers,
    offersLeft: n.final_counter ? 0 : maxOffersFor(db, n.product_id) - n.buyer_offers,
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
  const quote = createQuote(db, n.product_id, n.qty, now, { unitPriceCents: price, origin: "NEGOTIATION" });
  db.prepare("UPDATE negotiations SET status='AGREED', agreed_price_cents=?, quote_id=?, updated_at=? WHERE id=?").run(price, quote.id, now.toISOString(), n.id);
  audit(db, `buyer-agent:${n.buyer_label}`, "negotiation.agreed", "negotiation", n.id, { price, qty: n.qty, published: n.published_cents, quoteId: quote.id }, now);
}

function validateOffer(offerCents: number, published: number) {
  if (!Number.isInteger(offerCents) || offerCents < 50 || offerCents > published * 3) throw new DomainError("INVALID_OFFER", "Offer must be a whole number of cents within a sensible range.", 422);
}

function respond(db: DB, n: NegotiationRow, offerCents: number, now: Date) {
  const ctx = getContext(db, n.product_id, now);
  const st = computeStrategy(db, ctx, n.qty, now);
  const w = st.w;
  const k = n.buyer_offers + 1;
  const line = (kind: "ACCEPT" | "COUNTER" | "FINAL" | "REJECT", price: number) =>
    st.why ? rulesLine(kind, price, st, n.qty, k) : st.knowledge ? taughtLine(kind, price, st, n.qty, k) : sellerLine(kind, price, w);
  const roundUp = (c: number) => Math.ceil(c / st.step) * st.step;
  db.prepare("UPDATE negotiations SET buyer_offers=?, walk_away_cents=?, published_cents=?, updated_at=? WHERE id=?").run(k, w.walkAwayCents, w.publishedCents, now.toISOString(), n.id);
  const qtyText = n.qty > 1 || st.unit !== "each" ? `${n.qty} ${unitsSpoken(n.qty, st.unit)} of ${ctx.product.name.toLowerCase()}` : `the ${ctx.product.name}`;
  const perText = st.unit === "each" ? (n.qty > 1 ? " each" : "") : perSpoken(st.unit);
  const buyerLine = offerCents >= w.publishedCents ? `I’ll take ${qtyText} at ${fmt(offerCents)}${perText}, please.` : k === 1 ? `Hi! Could you do ${fmt(offerCents)}${perText} for ${qtyText}?` : k >= st.maxOffers ? `Last try: ${fmt(offerCents)}${perText}?` : k === 2 ? `Hmm. How about ${fmt(offerCents)}${perText}?` : `Could you meet me at ${fmt(offerCents)}${perText}?`;
  addMsg(db, n.id, "buyer", "OFFER", offerCents, buyerLine, now);

  if (!w.available || w.stock < n.qty) {
    db.prepare("UPDATE negotiations SET status='CLOSED' WHERE id=?").run(n.id);
    addMsg(db, n.id, "seller", "REJECT", null, !ctx.storeOpen ? "Sorry, we're closed for today." : w.stock > 0 ? `Sorry, I only have ${w.stock} ${st.unit} left.` : "Sorry, we're sold out.", now);
    return;
  }
  const pub = w.publishedCents;
  if (offerCents >= pub) {
    addMsg(db, n.id, "seller", "ACCEPT", pub, `That’s our listed price, so yes! ${fmt(pub)}${perText}. I’ll hold them for 5 minutes.`, now);
    agree(db, getNeg(db, n.id), pub, now);
    return;
  }
  // Concede a share of the gap each round; never below walk-away, never above the last counter.
  // A bulk deal starts the haggle from the discounted price.
  const sched = st.schedule;
  const base = st.listForQty ?? pub;
  let target = k >= st.maxOffers ? w.walkAwayCents : Math.max(w.walkAwayCents, roundUp(base - (base - w.walkAwayCents) * sched[k - 1]));
  if (n.last_counter_cents !== null) target = Math.min(target, n.last_counter_cents);
  target = Math.min(target, pub);
  if (offerCents >= target) {
    addMsg(db, n.id, "seller", "ACCEPT", offerCents, line("ACCEPT", offerCents), now);
    agree(db, getNeg(db, n.id), offerCents, now);
    return;
  }
  const final = k >= st.maxOffers || target === w.walkAwayCents;
  const counter = final ? Math.min(pub, Math.max(target, w.walkAwayCents)) : target;
  db.prepare("UPDATE negotiations SET last_counter_cents=?, final_counter=? WHERE id=?").run(counter, final ? 1 : 0, n.id);
  addMsg(db, n.id, "seller", final ? "FINAL" : "COUNTER", counter, line(final ? "FINAL" : "COUNTER", counter), now);
}

export function startNegotiation(db: DB, productId: string, offerCents: number, buyerLabel = "demo-buyer-agent", now = new Date(), qty = 1) {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_NEGOTIATION_QTY) throw new DomainError("INVALID_QTY", `Quantity must be 1–${MAX_NEGOTIATION_QTY}.`, 422);
  expireStaleQuotes(db, now);
  const ctx = getContext(db, productId, now);
  if (!ctx.published) throw new DomainError("NO_PRICE", "No published price.", 409);
  validateOffer(offerCents, ctx.published.priceCents);
  const id = newId("neg");
  const label = buyerLabel.replace(/[^\w.-]/g, "").slice(0, 40) || "buyer-agent";
  db.transaction(() => {
    db.prepare(
      `INSERT INTO negotiations (id, product_id, sim_day, sim_hour, buyer_label, status, published_cents, walk_away_cents, created_at, updated_at, expires_at, qty)
       VALUES (?,?,?,?,?,'OPEN',?,?,?,?,?,?)`,
    ).run(id, productId, ctx.sim.sim_day, ctx.sim.current_hour, label, ctx.published!.priceCents, ctx.published!.priceCents, now.toISOString(), now.toISOString(), new Date(now.getTime() + TTL_MS).toISOString(), qty);
    respond(db, getNeg(db, id), offerCents, now);
  }).immediate();
  emit("negotiation", productId, { id });
  return buyerView(db, id);
}

export function makeOffer(db: DB, id: string, offerCents: number, now = new Date()) {
  let n = expireIfStale(db, getNeg(db, id), now);
  if (n.status !== "OPEN") throw new DomainError("NEGOTIATION_CLOSED", `Negotiation is ${n.status}.`, 409);
  if (n.final_counter || n.buyer_offers >= maxOffersFor(db, n.product_id)) throw new DomainError("NO_OFFERS_LEFT", "The seller made a final offer. Accept it or walk away.", 409);
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
    const unit = (db.prepare("SELECT unit FROM products WHERE id=?").get(n.product_id) as { unit: string }).unit;
    addMsg(db, id, "buyer", "ACCEPT", n.last_counter_cents, `${fmt(n.last_counter_cents!)} works. Deal!`, now);
    addMsg(db, id, "seller", "ACCEPT", n.last_counter_cents, `Lovely. ${fmt(n.last_counter_cents!)}${perSpoken(unit)}${totalSpoken(n.last_counter_cents!, n.qty, unit)}. I’ll hold them for you for 5 minutes.`, now);
    agree(db, n, n.last_counter_cents!, now);
  }).immediate();
  emit("negotiation", n.product_id, { id });
  return buyerView(db, id);
}

export function declineNegotiation(db: DB, id: string, now = new Date()) {
  const n = getNeg(db, id);
  if (n.status === "OPEN") {
    db.prepare("UPDATE negotiations SET status='CLOSED', updated_at=? WHERE id=?").run(now.toISOString(), id);
    addMsg(db, id, "buyer", "DECLINE", null, "That’s a little over my budget. I’ll pass this time, thanks!", now);
    emit("negotiation", n.product_id, { id });
  }
  return buyerView(db, id);
}

export function listNegotiations(db: DB, productId: string, limit = 10) {
  return db
    .prepare("SELECT id, status, buyer_label, buyer_offers, published_cents, walk_away_cents, agreed_price_cents, sim_hour, created_at FROM negotiations WHERE product_id=? ORDER BY created_at DESC LIMIT ?")
    .all(productId, limit);
}
