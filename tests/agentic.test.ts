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

describe("selling rules taught in conversation", () => {
  it("reads closing time, prices elsewhere, bulk deals, leftovers and demand without mistaking them for the item's own price", async () => {
    const { interpretUtterance } = await import("@/lib/teach/parser");
    expect(interpretUtterance("The supermarket has Fujis at $3.49.")).toMatchObject({ set: { rules: { marketCents: 349, marketNote: "the supermarket" } } });
    expect(interpretUtterance("The supermarket has Fujis at $3.49.").set.listPriceCents).toBeUndefined();
    expect(interpretUtterance("3 lb or more, 15% off.").set).toEqual({ rules: { bulk: { minQty: 3, pctOff: 15 } } });
    expect(interpretUtterance("We close at 6.").set.rules).toEqual({ closeHour: 18 });
    expect(interpretUtterance("Anything left goes to compost.").set.rules).toEqual({ leftover: "waste" });
    expect(interpretUtterance("Slow this week. It's been cold.").set).toEqual({ rules: { demand: "slow" } });
    expect(interpretUtterance("Steady. About 10 pounds a day.").set).toEqual({ rules: { demand: "normal" } });
    expect(interpretUtterance("I don't know").skip).toBe(true);
  });

  it("Rosa's agent asks until nothing is missing, then haggles from those rules", async () => {
    const r = await setupRosa(db);
    expect(r.checklists.every((c) => c.checklist.every((x) => x.done))).toBe(true);
    expect(r.transcript.filter((m) => m.role === "agent").some((m) => /supermarket/.test(m.text))).toBe(true);
    const { sellerNegotiationView } = await import("@/lib/server/negotiation");
    const threePmLA = new Date("2026-11-09T23:00:00Z");
    const id = (name: string) => r.items.find((i) => i.name === name)!.productId;
    // Peaches: must go today, late in the day, slow week, wasted if unsold, pricier than the farm stand.
    expect(sellerNegotiationView(db, id("White peaches"), threePmLA).walkAwayCents).toBe(215);
    // Apples: no rush and already cheaper than the supermarket, so the agent holds the price...
    expect(sellerNegotiationView(db, id("Fuji apples"), threePmLA).walkAwayCents).toBe(289);
    // ...unless the buyer takes enough for Rosa's bulk deal.
    expect(sellerNegotiationView(db, id("Fuji apples"), threePmLA, 5).walkAwayCents).toBe(265);
    // Peaches early in the morning give less ground than at 3 pm.
    const eightAm = new Date("2026-11-09T16:00:00Z");
    expect(sellerNegotiationView(db, id("White peaches"), eightAm).walkAwayCents).toBeGreaterThan(215);
  });
});
