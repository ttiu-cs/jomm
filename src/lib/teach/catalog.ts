/**
 * Agent-readable catalog of taught shops, the seller agent's question answering, and the seller
 * dashboard read model. Public views never include the owner's floor price.
 */
import type { DB } from "../db/client";
import { getLlm } from "../agent/llm";
import { getContext } from "../server/context";
import { getKnowledge } from "../server/negotiation";
import { DomainError } from "../server/util";

export interface CatalogItem {
  shopId: string;
  shopName: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  listPriceCents: number;
  available: number;
  condition: string | null;
  facts: string[];
  hasPhoto: boolean;
  negotiable: boolean;
  score?: number;
}

const STOP = new Set("a an the of for and or to i we me my some any want need looking find buy get please with under max budget total lb lbs kg box each pound pounds about".split(" "));
export const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w))
    .map((w) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, ""));

export function listCatalog(db: DB, q?: string, shopId?: string): CatalogItem[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.sku, p.name, p.unit, p.store_id, s.name AS shop_name, k.condition, k.facts_json, k.photo IS NOT NULL AS has_photo, k.floor_cents
       FROM products p JOIN product_knowledge k ON k.product_id = p.id JOIN stores s ON s.id = p.store_id
       WHERE (? IS NULL OR p.store_id = ?) ORDER BY s.name, p.sku`,
    )
    .all(shopId ?? null, shopId ?? null) as {
    id: string;
    sku: string;
    name: string;
    unit: string;
    store_id: string;
    shop_name: string;
    condition: string | null;
    facts_json: string;
    has_photo: number;
    floor_cents: number;
  }[];
  const qt = q ? tokens(q) : [];
  const items: CatalogItem[] = [];
  for (const r of rows) {
    const ctx = getContext(db, r.id);
    if (!ctx.published) continue;
    const facts: string[] = JSON.parse(r.facts_json);
    const item: CatalogItem = {
      shopId: r.store_id,
      shopName: r.shop_name,
      productId: r.id,
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      listPriceCents: ctx.published.priceCents,
      available: ctx.stock.available,
      condition: r.condition,
      facts,
      hasPhoto: !!r.has_photo,
      negotiable: r.floor_cents < ctx.published.priceCents,
    };
    if (qt.length) {
      const nameT = new Set(tokens(r.name));
      const restT = new Set(tokens([facts.join(" "), r.condition ?? ""].join(" ")));
      item.score = qt.reduce((acc, t) => acc + (nameT.has(t) ? 3 : 0) + (restT.has(t) ? 1 : 0), 0);
      if (item.score === 0) continue;
    }
    items.push(item);
  }
  return qt.length ? items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.available - a.available) : items;
}

export function getItemBySku(db: DB, shopId: string, sku: string) {
  const r = db.prepare("SELECT id FROM products WHERE store_id=? AND sku=?").get(shopId, sku) as { id: string } | undefined;
  if (!r) throw new DomainError("NOT_FOUND", "Item not found", 404);
  const item = listCatalog(db, undefined, shopId).find((i) => i.productId === r.id);
  if (!item) throw new DomainError("NOT_FOUND", "Item not found", 404);
  const photo = (db.prepare("SELECT photo FROM product_knowledge WHERE product_id=?").get(r.id) as { photo: string | null }).photo;
  return { ...item, photo };
}

const sentence = (s: string) => (s.replace(/\.\./g, ".").trim().replace(/[.!]?$/, "."));
const lowerFirst = (s: string) => (/^(I|I’m|I'm)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** The seller agent answers a buyer question using only what the owner taught it. */
export interface ChatContext {
  purpose?: string;
  history?: { role: "buyer" | "seller"; text: string }[];
}

export async function answerQuestion(db: DB, productId: string, question: string, context: ChatContext = {}) {
  const k = getKnowledge(db, productId);
  if (!k) throw new DomainError("NOT_FOUND", "This item has no seller agent.", 404);
  const q = question.trim().slice(0, 300);
  if (!q) throw new DomainError("VALIDATION", "Ask a question.", 422);
  const p = db.prepare("SELECT name, unit FROM products WHERE id=?").get(productId) as { name: string; unit: string };
  const known = [...k.facts, ...(k.condition ? [k.condition] : [])];
  const llm = getLlm();
  if (llm) {
    const raw = (await llm.completeJson(
      `You are the voice of a small, friendly market stall talking to a shopper's buying agent. Speak in first person as the stall, warm and plain, like a good shopkeeper: no "the owner told me", no corporate tone. Use ONLY the facts below; never invent origin, freshness, or quality claims. Keep the conversation so far and the shopper's purpose in mind, and connect your answer to it when the facts allow (e.g. a tip for how they'll use it). If the facts don't cover the question, say honestly you'd have to check, then offer what you do know. Never mention a lowest or minimum price. Don't ask questions back. 1-3 short sentences. Return JSON {"answer": string}.`,
      JSON.stringify({ item: p.name, unit: p.unit, ownerFacts: known, shopperPurpose: context.purpose ?? null, conversationSoFar: (context.history ?? []).slice(-8), question: q }),
    )) as { answer?: unknown } | null;
    if (raw && typeof raw.answer === "string" && raw.answer.length < 500) return { answer: raw.answer, source: "llm" as const, facts: known };
  }
  const qt = new Set(tokens(q));
  const hits = known.filter((f) => tokens(f).some((t) => qt.has(t)));
  const answer = hits.length
    ? sentence(hits.join(". "))
    : known.length
      ? `Good question. I’d have to check on that one. What I can tell you: ${lowerFirst(sentence(known.slice(0, 2).join(". ")))}`
      : "Good question. I’d have to check on that one and get back to you.";
  return { answer, source: "rules" as const, facts: known };
}

/** Seller-private dashboard: stock, price, floor, deals and verified sales per shop. */
export function sellerDashboard(db: DB, shopId: string) {
  const shop = db.prepare("SELECT id, name FROM stores WHERE id=?").get(shopId) as { id: string; name: string } | undefined;
  if (!shop) throw new DomainError("NOT_FOUND", "Shop not found", 404);
  const items = listCatalog(db, undefined, shopId).map((i) => {
    const k = getKnowledge(db, i.productId)!;
    const sold = (db.prepare("SELECT COALESCE(-SUM(qty_delta),0) AS v FROM inventory_movements WHERE product_id=? AND type='SALE'").get(i.productId) as { v: number }).v;
    const photo = (db.prepare("SELECT photo FROM product_knowledge WHERE product_id=?").get(i.productId) as { photo: string | null }).photo;
    return { ...i, floorCents: k.floor_cents, sellBy: k.sell_by, sold, photo };
  });
  const negotiations = db
    .prepare(
      `SELECT n.id, n.status, n.qty, n.buyer_offers, n.published_cents, n.agreed_price_cents, n.created_at, p.name, p.unit,
              (SELECT text FROM negotiation_messages m WHERE m.negotiation_id = n.id ORDER BY m.id DESC LIMIT 1) AS last_message
       FROM negotiations n JOIN products p ON p.id = n.product_id WHERE p.store_id=? ORDER BY n.created_at DESC LIMIT 15`,
    )
    .all(shopId);
  const sales = db
    .prepare(
      `SELECT o.id, o.status, o.payment_source, o.total_cents, o.qty, o.unit_price_cents, o.paid_at, p.name, p.unit, q.origin, pa.capture_id, pa.verified
       FROM orders o JOIN products p ON p.id = o.product_id JOIN price_quotes q ON q.id = o.quote_id
       LEFT JOIN payment_attempts pa ON pa.order_id = o.id
       WHERE p.store_id=? ORDER BY o.created_at DESC LIMIT 20`,
    )
    .all(shopId) as { status: string; payment_source: string; total_cents: number }[];
  const paid = sales.filter((s) => s.status === "PAID");
  return {
    shop,
    items,
    negotiations,
    sales,
    totals: {
      paypalCents: paid.filter((s) => s.payment_source === "PAYPAL_SANDBOX").reduce((a, s) => a + s.total_cents, 0),
      mockCents: paid.filter((s) => s.payment_source === "MOCK_CHECKOUT").reduce((a, s) => a + s.total_cents, 0),
      orders: paid.length,
    },
  };
}

export function listShops(db: DB) {
  return db
    .prepare(
      `SELECT s.id, s.name, COUNT(k.product_id) AS items FROM stores s JOIN product_knowledge k ON k.store_id = s.id GROUP BY s.id ORDER BY MAX(k.taught_at) DESC`,
    )
    .all() as { id: string; name: string; items: number }[];
}

/** Public storefront of one taught shop (no floors). */
export function shopPage(db: DB, shopId: string) {
  const shop = db.prepare("SELECT id, name FROM stores WHERE id=?").get(shopId) as { id: string; name: string } | undefined;
  if (!shop) throw new DomainError("NOT_FOUND", "Shop not found", 404);
  return { shop, items: listCatalog(db, undefined, shopId) };
}

/**
 * Small talk with the stall (greetings, thanks, pickup, which ones to pick). Never about price:
 * prices only move through the checkout session. Public facts only; the floor is never given.
 */
export async function sellerChat(db: DB, productId: string, message: string, context: ChatContext = {}) {
  const k = getKnowledge(db, productId);
  if (!k) throw new DomainError("NOT_FOUND", "This item has no seller agent.", 404);
  const m = message.trim().slice(0, 300);
  const p = db.prepare("SELECT name, unit FROM products WHERE id=?").get(productId) as { name: string; unit: string };
  const r = k.rules ?? {};
  const pub = {
    facts: [...k.facts, ...(k.condition ? [k.condition] : [])],
    closesAt: typeof r.closeHour === "number" ? `${((r.closeHour + 11) % 12) + 1} pm` : null,
    bulkDeal: r.bulk ? `${r.bulk.pctOff}% off ${r.bulk.minQty}+ ${p.unit}` : null,
    sellsFast: r.demand === "high",
  };
  const llm = getLlm();
  if (llm) {
    const raw = (await llm.completeJson(
      `You are the voice of a small, friendly market stall chatting with a shopper's buying agent while they shop for "${p.name}". Reply like a warm, quick shopkeeper in 1-2 short sentences, first person, connected to what was just said and the shopper's purpose. You may use only these public facts. Never discuss or change prices, discounts beyond the stated bulk deal, or any lowest price: if asked about price, say you'll sort the price in the checkout. Return JSON {"reply": string}.`,
      JSON.stringify({ item: p.name, publicFacts: pub, shopperPurpose: context.purpose ?? null, conversationSoFar: (context.history ?? []).slice(-8), shopperAgentSays: m }),
    )) as { reply?: unknown } | null;
    if (raw && typeof raw.reply === "string" && raw.reply.length < 400 && !/\$\d/.test(raw.reply)) return { reply: raw.reply, source: "llm" as const };
  }
  // Rules: a friendly line that fits the most common small talk.
  const tip = pub.facts.find((f) => !/\b(soft|stain|flaw|scratch|worn)\b/i.test(f));
  const reply = /\b(pick|choose|best ones|select|ripe)\b/i.test(m)
    ? `Of course, I’ll pick out the best ones for you.${tip ? ` ${tip.replace(/[.!]?$/, ".")}` : ""} Thanks for coming by!`
    : /\b(thank|thanks|cheers|great|perfect)\b/i.test(m)
      ? `Thank you! ${pub.sellsFast ? "Good timing, these go fast." : "Enjoy them, and come back soon."}`
      : /\b(pickup|pick up|close|open|when)\b/i.test(m)
        ? pub.closesAt
          ? `We’re here until ${pub.closesAt}, so any time before then.`
          : "We’re here all day, come by whenever suits you."
        : `Welcome! You’re in the right spot${tip ? `: ${tip.charAt(0).toLowerCase() + tip.slice(1).replace(/[.!]?$/, ".")}` : "."} What would you like to know?`;
  return { reply, source: "rules" as const };
}
