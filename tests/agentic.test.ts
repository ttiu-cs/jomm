import { beforeEach, describe, expect, it } from "vitest";
import { FakePayPal, freshDb } from "./helpers";
import { setPayPalApi } from "@/lib/paypal/client";
import { setupRosa } from "@/lib/demo/setup";
import { PERSONAS, parseIntent, pickForIntent, type CatalogItemLite } from "@/lib/demo/rosa";
import { listCatalog } from "@/lib/teach/catalog";
import { cancelSession, completeSession, createSession, sessionView, updateSession } from "@/lib/agentic/checkout";
import { capturePayPalOrder, createPayPalOrder } from "@/lib/server/commerce";
import type { DB } from "@/lib/db/client";

let db: DB;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  db = freshDb();
  setPayPalApi(null);
});

const catalog = (shopId: string): CatalogItemLite[] =>
  listCatalog(db, undefined, shopId).map((i) => ({ productId: i.productId, sku: i.sku, shopId: i.shopId, name: i.name, unit: i.unit, listPriceCents: i.listPriceCents, available: i.available, facts: i.facts }));
const sku = (shopId: string, name: string) => catalog(shopId).find((i) => i.name === name)!.sku;

describe("Rosa's scripted stall", () => {
  it("teaches three items with private floors and restocks on re-run without duplicates", async () => {
    const a = await setupRosa(db);
    expect(a.items.map((i) => i.name)).toEqual(["Fuji apples", "White peaches", "Strawberries"]);
    const floors = db.prepare("SELECT floor_cents, sell_by FROM product_knowledge WHERE store_id=? ORDER BY floor_cents").all(a.shopId);
    expect(floors).toEqual([
      { floor_cents: 215, sell_by: "today" },
      { floor_cents: 235, sell_by: "no_rush" },
      { floor_cents: 425, sell_by: "this_week" },
    ]);
    const b = await setupRosa(db);
    expect(b.shopId).toBe(a.shopId);
    expect(catalog(a.shopId)).toHaveLength(3);
  });

  it("each shopper's intent leads their agent to a different product", async () => {
    const { shopId } = await setupRosa(db);
    const picks = Object.fromEntries(PERSONAS.map((p) => [p.id, pickForIntent(catalog(shopId), p.intent)?.item.name]));
    expect(picks).toEqual({ maya: "White peaches", leo: "Fuji apples", jun: "Strawberries", rex: "Strawberries" });
    expect(pickForIntent(catalog(shopId), parseIntent("4 lb peaches for jam, under $10"))?.item.name).toBe("White peaches");
  });
});

describe("agent checkout sessions (ACP shape, PayPal provider)", () => {
  it("negotiates above the private floor, never reveals it, and completes through PayPal", async () => {
    const { shopId } = await setupRosa(db);
    let s = createSession(db, { items: [{ id: sku(shopId, "White peaches"), quantity: 3 }], negotiation: { offer_per_unit: 150 } });
    expect(s.status).toBe("not_ready_for_payment");
    expect(s.payment_provider.provider).toBe("paypal");
    expect(s.negotiation.seller_counter_per_unit).toBeGreaterThanOrEqual(215);
    expect(JSON.stringify(s)).not.toMatch(/floor|walk_?away|2\.15|"215"/i);

    s = updateSession(db, s.id, { negotiation: { accept_counter: true } });
    expect(s.status).toBe("ready_for_payment");
    const unit = s.negotiation.agreed_per_unit!;
    expect(s.totals.find((t) => t.type === "total")!.amount).toBe(unit * 3);

    const pp = new FakePayPal();
    setPayPalApi(pp);
    s = completeSession(db, s.id);
    expect(s.status).toBe("in_progress");
    const { paypalOrderId } = await createPayPalOrder(db, pp, s.order!.id);
    pp.approve(paypalOrderId);
    expect((await capturePayPalOrder(db, pp, paypalOrderId)).status).toBe("PAID");
    s = sessionView(db, s.id);
    expect(s.status).toBe("completed");
    expect(s.order).toMatchObject({ status: "PAID", payment_source: "PAYPAL_SANDBOX" });
  });

  it("takes the listed price with no proposal, and cancels cleanly", async () => {
    const { shopId } = await setupRosa(db);
    const full = createSession(db, { items: [{ id: sku(shopId, "Fuji apples"), quantity: 2 }] });
    expect(full.status).toBe("ready_for_payment");
    expect(full.negotiation.agreed_per_unit).toBe(289);

    const low = createSession(db, { items: [{ id: sku(shopId, "Strawberries"), quantity: 2 }], negotiation: { offer_per_unit: 250 } });
    const gone = cancelSession(db, low.id);
    expect(gone.status).toBe("canceled");
    expect(gone.order).toBeNull();
  });

  it("rejects malformed requests", async () => {
    await setupRosa(db);
    expect(() => createSession(db, { items: [] })).toThrow(/exactly one item/);
    expect(() => createSession(db, { items: [{ id: "NOPE", quantity: 1 }] })).toThrow(/Unknown item/);
  });
});
