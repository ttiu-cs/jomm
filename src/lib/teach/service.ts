/**
 * Teaching sessions: a shop owner shows items to the seller agent through a live camera
 * conversation. Each turn (owner speech + current camera frame) updates draft product cards and
 * returns the agent's next question. "Open my shop" turns drafts into live products with SKUs,
 * stock, published prices and the private knowledge the agent sells from.
 */
import { z } from "zod";
import type { DB } from "../db/client";
import { getLlm } from "../agent/llm";
import { DEFAULT_COSTS, DEFAULT_DEMAND_MODEL, DEFAULT_POLICY } from "../pricing/scenario";
import { emit } from "../server/events";
import { DomainError, audit, newId } from "../server/util";
import { interpretUtterance, nextQuestion, type DraftFields, type Interpretation, type SellBy } from "./parser";

export interface DraftItem extends DraftFields {
  id: string;
  photo: string | null;
}

interface DraftRow {
  id: string;
  session_id: string;
  name: string;
  unit: string;
  quantity: number | null;
  list_price_cents: number | null;
  floor_price_cents: number | null;
  condition: string | null;
  sell_by: SellBy | null;
  facts_json: string;
  photo: string | null;
}

const toDraft = (r: DraftRow): DraftItem => ({
  id: r.id,
  name: r.name,
  unit: r.unit,
  quantity: r.quantity,
  listPriceCents: r.list_price_cents,
  floorPriceCents: r.floor_price_cents,
  condition: r.condition,
  sellBy: r.sell_by,
  facts: JSON.parse(r.facts_json),
  photo: r.photo,
});

export function createShopSession(db: DB, shopName: string, now = new Date()) {
  const name = shopName.trim().slice(0, 60);
  if (name.length < 2) throw new DomainError("VALIDATION", "Shop name is required.", 422);
  // Same name ⇒ same shop (e.g. re-running the rehearsal): start a new session instead of a duplicate shop.
  const existing = db.prepare("SELECT id FROM stores WHERE lower(name)=lower(?) AND id != ?").get(name, "st_demo") as { id: string } | undefined;
  if (existing) return newSessionForShop(db, existing.id, now);
  const merchantId = newId("m");
  const storeId = newId("st");
  const sessionId = newId("teach");
  const iso = now.toISOString();
  db.transaction(() => {
    db.prepare("INSERT INTO merchants (id, name, created_at) VALUES (?,?,?)").run(merchantId, name, iso);
    // Taught shops sell around the clock in the demo (no simulated store clock).
    db.prepare("INSERT INTO stores (id, merchant_id, name, timezone, open_hour, close_hour) VALUES (?,?,?,?,?,?)").run(storeId, merchantId, name, "America/Los_Angeles", 0, 24);
    db.prepare("INSERT INTO teach_sessions (id, store_id, status, created_at, updated_at) VALUES (?,?,'OPEN',?,?)").run(sessionId, storeId, iso, iso);
    audit(db, `merchant:${merchantId}`, "teach.start", "store", storeId, { name }, now);
  })();
  return getSession(db, sessionId);
}

/** Start a new teaching session for an existing shop (e.g. the next morning). */
export function newSessionForShop(db: DB, storeId: string, now = new Date()) {
  const st = db.prepare("SELECT id FROM stores WHERE id=?").get(storeId);
  if (!st) throw new DomainError("NOT_FOUND", "Shop not found", 404);
  // Resume an unfinished walk-through instead of losing its draft cards.
  const open = db.prepare("SELECT id FROM teach_sessions WHERE store_id=? AND status='OPEN' ORDER BY created_at DESC, rowid DESC LIMIT 1").get(storeId) as { id: string } | undefined;
  if (open) return getSession(db, open.id);
  const id = newId("teach");
  db.prepare("INSERT INTO teach_sessions (id, store_id, status, created_at, updated_at) VALUES (?,?,'OPEN',?,?)").run(id, storeId, now.toISOString(), now.toISOString());
  return getSession(db, id);
}

export function getSession(db: DB, id: string) {
  const s = db.prepare("SELECT t.*, st.name AS shop_name FROM teach_sessions t JOIN stores st ON st.id = t.store_id WHERE t.id=?").get(id) as
    | { id: string; store_id: string; status: string; focus_item_id: string | null; shop_name: string }
    | undefined;
  if (!s) throw new DomainError("NOT_FOUND", "Teaching session not found", 404);
  const items = (db.prepare("SELECT * FROM draft_items WHERE session_id=? ORDER BY created_at, rowid").all(id) as DraftRow[]).map(toDraft);
  const messages = db.prepare("SELECT role, text, had_image, source, created_at FROM teach_messages WHERE session_id=? ORDER BY id").all(id) as {
    role: "owner" | "agent";
    text: string;
    had_image: number;
    source: string;
    created_at: string;
  }[];
  return { id: s.id, shopId: s.store_id, shopName: s.shop_name, status: s.status, focusItemId: s.focus_item_id, items, messages };
}

const LlmTurn = z.object({
  reply: z.string().min(1).max(400),
  target: z.union([z.literal("new"), z.literal("focus"), z.string()]),
  newItemName: z.string().max(60).nullable().optional(),
  set: z
    .object({
      unit: z.string().max(12).optional(),
      quantity: z.number().int().min(0).max(100000).nullable().optional(),
      listPriceCents: z.number().int().min(1).max(10_000_00).nullable().optional(),
      floorPriceCents: z.number().int().min(1).max(10_000_00).nullable().optional(),
      condition: z.string().max(40).nullable().optional(),
      sellBy: z.enum(["today", "this_week", "no_rush"]).nullable().optional(),
    })
    .partial()
    .default({}),
  addFacts: z.array(z.string().max(160)).max(6).default([]),
});

const SYSTEM = `You are a new AI sales assistant for a small shop. The owner is showing you the shop through a live phone camera and talking to you, like training a new employee.
From the owner's words (and the camera image), keep product cards up to date and ask ONE short follow-up question, spoken style, max 2 sentences.
Rules:
- Prices, quantities, floors and deadlines must come ONLY from what the owner said. Never invent them. Money in integer US cents.
- floorPriceCents is the lowest price the owner will accept per unit. sellBy is "today", "this_week" or "no_rush".
- Facts are short buyer-relevant statements the owner made (taste, size, condition, flaws, origin). You may add one visual fact you can clearly see, prefixed "Looks: ".
- target: "new" if the owner introduced a different item (give newItemName), "focus" for the item currently in focus, or an existing item id.
- Ask about the most important missing field for the focused item, in this order: quantity, price, lowest price, buyer-relevant facts, sell-by.
Return ONLY JSON: {"reply": string, "target": "new"|"focus"|"<item id>", "newItemName": string|null, "set": {"unit"?: string, "quantity"?: int, "listPriceCents"?: int, "floorPriceCents"?: int, "condition"?: string, "sellBy"?: "today"|"this_week"|"no_rush"}, "addFacts": string[]}`;

function applyInterpretation(db: DB, sessionId: string, focusId: string | null, i: Interpretation, target: string, photo: string | null, now: Date): string | null {
  const iso = now.toISOString();
  let id = focusId;
  if (target === "new" && i.newItemName) {
    id = newId("di");
    db.prepare("INSERT INTO draft_items (id, session_id, name, unit, photo, created_at, updated_at) VALUES (?,?,?,?,?,?,?)").run(id, sessionId, i.newItemName, i.set.unit ?? "each", photo, iso, iso);
  } else if (target !== "focus" && target !== "new") {
    const exists = db.prepare("SELECT id FROM draft_items WHERE id=? AND session_id=?").get(target, sessionId);
    if (exists) id = target;
  }
  if (!id) return null;
  const row = db.prepare("SELECT * FROM draft_items WHERE id=?").get(id) as DraftRow;
  const facts: string[] = JSON.parse(row.facts_json);
  for (const f of i.addFacts) if (!facts.some((x) => x.toLowerCase() === f.toLowerCase())) facts.push(f);
  db.prepare(
    `UPDATE draft_items SET unit=?, quantity=?, list_price_cents=?, floor_price_cents=?, condition=?, sell_by=?, facts_json=?, photo=COALESCE(photo, ?), updated_at=? WHERE id=?`,
  ).run(
    i.set.unit ?? row.unit,
    i.set.quantity ?? row.quantity,
    i.set.listPriceCents ?? row.list_price_cents,
    i.set.floorPriceCents ?? row.floor_price_cents,
    i.set.condition ?? row.condition,
    i.set.sellBy ?? row.sell_by,
    JSON.stringify(facts.slice(0, 12)),
    photo,
    iso,
    id,
  );
  db.prepare("UPDATE teach_sessions SET focus_item_id=?, updated_at=? WHERE id=?").run(id, iso, sessionId);
  return id;
}

/** One conversational turn: owner speech (+ optional camera frame as a JPEG data URL). */
export async function teachTurn(db: DB, sessionId: string, input: { text: string; imageDataUrl?: string | null }, now = new Date()) {
  const s = getSession(db, sessionId);
  if (s.status !== "OPEN") throw new DomainError("SESSION_CLOSED", "This session already opened the shop. Start a new session to teach more.", 409);
  const text = (input.text ?? "").trim().slice(0, 1000);
  if (!text) throw new DomainError("VALIDATION", "Say something about the item.", 422);
  const image = input.imageDataUrl && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.imageDataUrl) && input.imageDataUrl.length < 600_000 ? input.imageDataUrl : null;
  const focus = s.items.find((x) => x.id === s.focusItemId) ?? null;

  // Try the LLM first (if configured); fall back to deterministic rules.
  let interp: Interpretation | null = null;
  let target = "focus";
  let reply: string | null = null;
  let source = "rules";
  const llm = getLlm();
  if (llm) {
    const ctx = {
      focusItemId: focus?.id ?? null,
      items: s.items.map(({ photo, ...rest }) => (void photo, rest)),
      ownerSaid: text,
    };
    const raw = await llm.completeJson(SYSTEM, JSON.stringify(ctx), image ? image.split(",")[1] : undefined);
    const parsed = raw ? LlmTurn.safeParse(raw) : null;
    if (parsed?.success) {
      const p = parsed.data;
      interp = { newItemName: p.newItemName ?? null, set: Object.fromEntries(Object.entries(p.set).filter(([, v]) => v !== null && v !== undefined)), addFacts: p.addFacts };
      target = p.target === "new" && !p.newItemName ? "focus" : p.target;
      reply = p.reply;
      source = "llm";
    }
  }
  if (!interp) {
    interp = interpretUtterance(text);
    target = interp.newItemName ? "new" : "focus";
  }

  let focusId: string | null = null;
  db.transaction(() => {
    db.prepare("INSERT INTO teach_messages (session_id, role, text, had_image, source, created_at) VALUES (?,?,?,?,?,?)").run(sessionId, "owner", text, image ? 1 : 0, source, now.toISOString());
    focusId = applyInterpretation(db, sessionId, focus?.id ?? null, interp!, target, image, now);
    const after = getSession(db, sessionId);
    const f = after.items.find((x) => x.id === focusId) ?? null;
    if (!reply) reply = f || interp!.newItemName ? nextQuestion(f) : `I didn’t catch which item that is. Point the camera at it and say what it is, e.g. “These are Fuji apples.”`;
    db.prepare("INSERT INTO teach_messages (session_id, role, text, had_image, source, created_at) VALUES (?,?,?,?,?,?)").run(sessionId, "agent", reply, 0, source, now.toISOString());
  })();
  return { ...getSession(db, sessionId), reply, source };
}

const DraftPatch = z
  .object({
    name: z.string().min(1).max(60),
    unit: z.string().min(1).max(12),
    quantity: z.number().int().min(0).max(100000).nullable(),
    listPriceCents: z.number().int().min(1).nullable(),
    floorPriceCents: z.number().int().min(1).nullable(),
    condition: z.string().max(40).nullable(),
    sellBy: z.enum(["today", "this_week", "no_rush"]).nullable(),
    facts: z.array(z.string().min(1).max(160)).max(12),
  })
  .partial()
  .strict();

/** Owner corrects a card by tapping it (the safety net when speech or vision got it wrong). */
export function updateDraft(db: DB, itemId: string, patch: unknown, now = new Date()) {
  const p = DraftPatch.parse(patch);
  const row = db.prepare("SELECT * FROM draft_items WHERE id=?").get(itemId) as DraftRow | undefined;
  if (!row) throw new DomainError("NOT_FOUND", "Item not found", 404);
  db.prepare(
    "UPDATE draft_items SET name=?, unit=?, quantity=?, list_price_cents=?, floor_price_cents=?, condition=?, sell_by=?, facts_json=?, updated_at=? WHERE id=?",
  ).run(
    p.name ?? row.name,
    p.unit ?? row.unit,
    p.quantity !== undefined ? p.quantity : row.quantity,
    p.listPriceCents !== undefined ? p.listPriceCents : row.list_price_cents,
    p.floorPriceCents !== undefined ? p.floorPriceCents : row.floor_price_cents,
    p.condition !== undefined ? p.condition : row.condition,
    p.sellBy !== undefined ? p.sellBy : row.sell_by,
    p.facts ? JSON.stringify(p.facts) : row.facts_json,
    now.toISOString(),
    itemId,
  );
  return getSession(db, row.session_id);
}

export function deleteDraft(db: DB, itemId: string) {
  const row = db.prepare("SELECT session_id FROM draft_items WHERE id=?").get(itemId) as { session_id: string } | undefined;
  if (!row) throw new DomainError("NOT_FOUND", "Item not found", 404);
  db.prepare("DELETE FROM draft_items WHERE id=?").run(itemId);
  db.prepare("UPDATE teach_sessions SET focus_item_id=NULL WHERE id=? AND focus_item_id=?").run(row.session_id, itemId);
  return getSession(db, row.session_id);
}

function shopCode(name: string) {
  const letters = name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, "")[0] ?? "")
    .join("")
    .toUpperCase();
  return (letters || "SHOP").slice(0, 3).padEnd(2, "X");
}
function skuPart(name: string) {
  const ascii = name.normalize("NFKD").replace(/[^A-Za-z0-9 ]/g, "").trim().toUpperCase().split(/\s+/).filter(Boolean).slice(0, 2).join("-");
  return (ascii || "ITEM").slice(0, 14);
}

/**
 * Open the shop: every complete draft (name, quantity, price) becomes a live product with a SKU,
 * a fresh stock batch, a published price and agent knowledge. Re-teaching an item with the same
 * name updates it instead of duplicating it. Missing floor ⇒ no discount; missing deadline ⇒ no rush.
 */
export function publishSession(db: DB, sessionId: string, now = new Date()) {
  const s = getSession(db, sessionId);
  if (s.status !== "OPEN") throw new DomainError("SESSION_CLOSED", "Already published.", 409);
  const ready = s.items.filter((i) => i.quantity !== null && i.quantity > 0 && i.listPriceCents !== null);
  if (!ready.length) throw new DomainError("NOTHING_READY", "No item has both a quantity and a price yet.", 422);
  const iso = now.toISOString();
  const code = shopCode(s.shopName);
  const published: { productId: string; sku: string; name: string }[] = [];

  db.transaction(() => {
    for (const it of ready) {
      const list = it.listPriceCents!;
      const floor = Math.min(list, it.floorPriceCents ?? list);
      const existing = db.prepare("SELECT id, sku FROM products WHERE store_id=? AND lower(name)=lower(?)").get(s.shopId, it.name) as { id: string; sku: string } | undefined;
      let productId: string;
      let sku: string;
      if (existing) {
        productId = existing.id;
        sku = existing.sku;
        db.prepare("UPDATE products SET base_price_cents=?, unit=? WHERE id=?").run(list, it.unit, productId);
        db.prepare("UPDATE inventory_batches SET status='CLOSED' WHERE product_id=? AND status='ACTIVE'").run(productId);
      } else {
        productId = newId("p");
        const n = (db.prepare("SELECT COUNT(*) AS n FROM products WHERE store_id=?").get(s.shopId) as { n: number }).n + 1;
        sku = `${code}-${skuPart(it.name)}-${String(n).padStart(3, "0")}`;
        db.prepare("INSERT INTO products (id, store_id, sku, name, category, currency, base_price_cents, unit, demand_model_json) VALUES (?,?,?,?,?,?,?,?,?)").run(
          productId,
          s.shopId,
          sku,
          it.name,
          "taught",
          "USD",
          list,
          it.unit,
          JSON.stringify(DEFAULT_DEMAND_MODEL),
        );
        db.prepare("INSERT INTO cost_snapshots (id, product_id, created_at, costs_json, actor) VALUES (?,?,?,?,?)").run(
          newId("cost"),
          productId,
          iso,
          JSON.stringify({ ...DEFAULT_COSTS, ingredientsCents: 0, packagingCents: 0, laborCents: 0, disposalPerUnitCents: 0 }),
          "teach",
        );
        db.prepare("INSERT INTO pricing_policies (id, product_id, version, policy_json, active, created_at, actor) VALUES (?,?,1,?,1,?,?)").run(
          newId("pol"),
          productId,
          JSON.stringify({ ...DEFAULT_POLICY, floorCents: floor, ceilingCents: Math.max(list, floor) * 2, allowBelowFullCost: true, maxNegotiationDiscountBps: 9000 }),
          iso,
          "teach",
        );
        db.prepare("INSERT INTO sim_state (product_id, seed, sim_day, current_hour, weather, event, demand_multiplier, updated_at) VALUES (?,?,?,?,?,?,?,?)").run(productId, 0, 1, 12, "cloudy", "none", 1, iso);
      }
      const costId = (db.prepare("SELECT id FROM cost_snapshots WHERE product_id=? ORDER BY created_at DESC LIMIT 1").get(productId) as { id: string }).id;
      const batchId = newId("batch");
      db.prepare("INSERT INTO inventory_batches (id, product_id, sim_day, qty_produced, created_at, sell_by_hour, status, cost_snapshot_id) VALUES (?,?,?,?,?,?,?,?)").run(batchId, productId, 1, it.quantity, iso, 24, "ACTIVE", costId);
      db.prepare("INSERT INTO inventory_movements (product_id, batch_id, type, qty_delta, source, sim_day, sim_hour, created_at) VALUES (?,?,?,?,?,?,?,?)").run(productId, batchId, "PRODUCTION", it.quantity, "MERCHANT", 1, 12, iso);
      const v = ((db.prepare("SELECT MAX(version) AS v FROM published_prices WHERE product_id=?").get(productId) as { v: number | null }).v ?? 0) + 1;
      db.prepare("INSERT INTO published_prices (id, product_id, price_cents, currency, version, effective_at, sim_day, sim_hour, decision_id, actor) VALUES (?,?,?,?,?,?,?,?,?,?)").run(
        newId("pp"),
        productId,
        list,
        "USD",
        v,
        iso,
        1,
        12,
        null,
        "teach",
      );
      db.prepare(
        `INSERT INTO product_knowledge (product_id, store_id, floor_cents, sell_by, condition, facts_json, photo, taught_at) VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(product_id) DO UPDATE SET floor_cents=excluded.floor_cents, sell_by=excluded.sell_by, condition=excluded.condition, facts_json=excluded.facts_json, photo=COALESCE(excluded.photo, product_knowledge.photo), taught_at=excluded.taught_at`,
      ).run(productId, s.shopId, floor, it.sellBy ?? "no_rush", it.condition, JSON.stringify(it.facts), it.photo, iso);
      published.push({ productId, sku, name: it.name });
    }
    db.prepare("UPDATE teach_sessions SET status='PUBLISHED', updated_at=? WHERE id=?").run(iso, sessionId);
    audit(db, `merchant:${s.shopId}`, "teach.publish", "store", s.shopId, { items: published.map((p) => p.sku) }, now);
  })();
  emit("shop", s.shopId, { published: published.length });
  return { shopId: s.shopId, published, skipped: s.items.filter((i) => !ready.includes(i)).map((i) => i.name) };
}

/** A scripted owner walk-through used for rehearsals and as a stage fallback (runs through the same turn logic). */
export const EXAMPLE_SCRIPTS: Record<string, { shopName: string; lines: string[] }> = {
  fruit: {
    shopName: "Sunny Fruit Stand",
    lines: [
      "These are Fuji apples, about 30 lb. They're really sweet and crisp this year.",
      "$3 a pound, but no less than $2.40.",
      "No rush, they keep well.",
      "Next is white peaches, 12 lb. A little soft, they have to go today.",
      "$4 per pound, lowest $2.",
      "And this is strawberries, 8 box. Picked this morning, very fragrant.",
      "$6 a box, at least $4.50. Sell them by this week.",
    ],
  },
  closet: {
    shopName: "Mina's Closet",
    lines: [
      "This is a wool coat, worn twice, size M.",
      "Just one. $60, at least $45. No rush.",
      "Next is denim jacket, size S, small stain on the left cuff.",
      "One left. $25, lowest $15. I'd like it gone this week.",
    ],
  },
};
