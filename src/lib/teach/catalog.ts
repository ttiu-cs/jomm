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

/** The seller agent answers a buyer question using only what the owner taught it. */
export async function answerQuestion(db: DB, productId: string, question: string) {
  const k = getKnowledge(db, productId);
  if (!k) throw new DomainError("NOT_FOUND", "This item has no seller agent.", 404);
  const q = question.trim().slice(0, 300);
  if (!q) throw new DomainError("VALIDATION", "Ask a question.", 422);
  const p = db.prepare("SELECT name, unit FROM products WHERE id=?").get(productId) as { name: string; unit: string };
  const known = [...k.facts, ...(k.condition ? [`Condition: ${k.condition}`] : [])];
  const llm = getLlm();
  if (llm) {
    const raw = (await llm.completeJson(
      `You are the seller agent for a small shop, answering a buyer (or buyer agent). Use ONLY the owner's facts below. If the facts don't cover the question, say you'll need to check with the owner. Never mention a lowest price. 1-2 sentences. Return JSON {"answer": string}.`,
      JSON.stringify({ item: p.name, unit: p.unit, ownerFacts: known, question: q }),
    )) as { answer?: unknown } | null;
    if (raw && typeof raw.answer === "string" && raw.answer.length < 500) return { answer: raw.answer, source: "llm" as const, facts: known };
  }
  const qt = new Set(tokens(q));
  const hits = known.filter((f) => tokens(f).some((t) => qt.has(t)));
  const answer = hits.length
    ? `The owner told me: ${hits.join(". ").replace(/\.\./g, ".")}.`
    : known.length
      ? `I don't have that detail, but the owner told me: ${known.slice(0, 2).join(". ")}.`
      : "I'll need to check with the owner on that.";
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
