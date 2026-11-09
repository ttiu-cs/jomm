import { beforeEach, describe, expect, it } from "vitest";
import { FakePayPal, freshDb } from "./helpers";
import { setPayPalApi } from "@/lib/paypal/client";
import { interpretUtterance, nextQuestion } from "@/lib/teach/parser";
import { createShopSession, EXAMPLE_SCRIPTS, publishSession, teachTurn, updateDraft, newSessionForShop } from "@/lib/teach/service";
import { answerQuestion, listCatalog, sellerDashboard } from "@/lib/teach/catalog";
import { acceptCounter, makeOffer, startNegotiation, sellerNegotiationView } from "@/lib/server/negotiation";
import { capturePayPalOrder, createOrderFromQuote, createPayPalOrder } from "@/lib/server/commerce";
import { getContext } from "@/lib/server/context";
import { parseBuyerRequest } from "@/lib/buyer/request";
import { seedDemo } from "@/lib/server/sim-service";
import type { DB } from "@/lib/db/client";

let db: DB;
const T = new Date("2026-11-09T18:00:00Z");

async function teachFruit() {
  const s = createShopSession(db, "Sunny Fruit Stand", T);
  for (const line of EXAMPLE_SCRIPTS.fruit.lines) await teachTurn(db, s.id, { text: line }, T);
  return s.id;
}

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  db = freshDb();
  setPayPalApi(null);
});

describe("teaching parser", () => {
  it("extracts item, quantity, price, floor, urgency and facts", () => {
    const r = interpretUtterance("Next is white peaches, 12 lb. A little soft, they have to go today. $4 per pound, lowest $2.");
    expect(r.newItemName).toBe("White peaches");
    expect(r.set).toMatchObject({ quantity: 12, unit: "lb", listPriceCents: 400, floorPriceCents: 200, sellBy: "today" });
    expect(r.addFacts.join(" ")).toMatch(/soft/i);
    expect(interpretUtterance("Just one.").set.quantity).toBe(1);
  });
  it("asks for the most important missing field", () => {
    const base = { name: "Fuji apples", unit: "lb", quantity: null, listPriceCents: null, floorPriceCents: null, condition: null, sellBy: null, facts: [] };
    expect(nextQuestion(base)).toMatch(/How many/);
    expect(nextQuestion({ ...base, quantity: 30 })).toMatch(/price/);
    expect(nextQuestion({ ...base, quantity: 30, listPriceCents: 300 })).toMatch(/lowest/);
  });
});

describe("teach → open shop → buyer agent deal → PayPal", () => {
  it("builds draft cards through conversation", async () => {
    const id = await teachFruit();
    const r = await teachTurn(db, id, { text: "ok" }, T);
    const names = r.items.map((i) => i.name);
    expect(names).toEqual(["Fuji apples", "White peaches", "Strawberries"]);
    const apples = r.items[0];
    expect(apples).toMatchObject({ quantity: 30, unit: "lb", listPriceCents: 289, floorPriceCents: 235, sellBy: "no_rush" });
    expect(r.messages.filter((m) => m.role === "agent").length).toBeGreaterThan(5);
  });

  it("opens the shop with SKUs, stock and prices; catalog hides the floor", async () => {
    const id = await teachFruit();
    const out = publishSession(db, id, T);
    expect(out.published).toHaveLength(3);
    expect(out.published[0].sku).toMatch(/^SFS-FUJI-APPLES-001$/);
    const cat = listCatalog(db, "sweet apples");
    expect(cat[0].name).toBe("Fuji apples");
    expect(cat[0].available).toBe(30);
    expect(JSON.stringify(cat)).not.toMatch(/floor/i);
    expect(getContext(db, cat[0].productId, T).published?.priceCents).toBe(289);
    await expect(teachTurn(db, id, { text: "more" }, T)).rejects.toThrow(/opened the shop/);
  });

  it("re-teaching the next morning updates stock instead of duplicating", async () => {
    const id = await teachFruit();
    const { shopId } = publishSession(db, id, T);
    const s2 = newSessionForShop(db, shopId, T);
    await teachTurn(db, s2.id, { text: "These are Fuji apples, 20 lb. $3.50 a pound, lowest $3." }, T);
    publishSession(db, s2.id, T);
    const apples = listCatalog(db, undefined, shopId).filter((i) => i.name === "Fuji apples");
    expect(apples).toHaveLength(1);
    expect(apples[0]).toMatchObject({ available: 20, listPriceCents: 350 });
  });

  it("seller agent negotiates within the owner's floor and urgency, then PayPal settles", async () => {
    const pp = new FakePayPal();
    setPayPalApi(pp);
    const id = await teachFruit();
    publishSession(db, id, T);
    const peaches = listCatalog(db, "peaches")[0];
    const view = sellerNegotiationView(db, peaches.productId, T);
    expect(view.walkAwayCents).toBe(215); // must sell today -> may go all the way to the owner's floor
    const apples = listCatalog(db, "apples")[0];
    expect(sellerNegotiationView(db, apples.productId, T).walkAwayCents).toBe(267); // no rush -> 40% of the gap only

    let n = startNegotiation(db, peaches.productId, 150, "buyer", T, 2);
    expect(n.qty).toBe(2);
    expect(n.status).toBe("OPEN");
    while (n.status === "OPEN" && !n.sellerCounterIsFinal) n = makeOffer(db, n.id, 150, T);
    expect(n.sellerCounterCents).toBe(215);
    n = acceptCounter(db, n.id, T);
    expect(n.status).toBe("AGREED");
    const order = createOrderFromQuote(db, n.quote!.id, T);
    expect(order.total_cents).toBe(430);
    const { paypalOrderId } = await createPayPalOrder(db, pp, order.id, T);
    pp.approve(paypalOrderId);
    expect((await capturePayPalOrder(db, pp, paypalOrderId, T)).status).toBe("PAID");
    expect(listCatalog(db, "peaches")[0].available).toBe(10);
    const dash = sellerDashboard(db, peaches.shopId);
    expect(dash.totals.paypalCents).toBe(430);
    expect(dash.items.find((i) => i.name === "White peaches")!.sold).toBe(2);
  });

  it("answers buyer questions only from the owner's facts", async () => {
    const id = await teachFruit();
    publishSession(db, id, T);
    const apples = listCatalog(db, "apples")[0];
    const a = await answerQuestion(db, apples.productId, "Are they sweet?");
    expect(a.answer).toMatch(/sweet and crisp/);
    expect(a.answer).not.toMatch(/2\.35|floor|lowest/i);
  });

  it("lets the owner correct a card and refuses incomplete shops", async () => {
    const s = createShopSession(db, "Mina's Closet", T);
    await teachTurn(db, s.id, { text: "This is a wool coat, worn twice, size M." }, T);
    expect(() => publishSession(db, s.id, T)).toThrow(/quantity and a price/);
    const item = (await teachTurn(db, s.id, { text: "Just one. $60, at least $45. No rush." }, T)).items[0];
    updateDraft(db, item.id, { name: "Wool coat (navy)" }, T);
    expect(publishSession(db, s.id, T).published[0].name).toBe("Wool coat (navy)");
  });

  it("reuses a shop with the same name instead of duplicating it", async () => {
    const id = await teachFruit();
    publishSession(db, id, T);
    const again = createShopSession(db, "sunny fruit stand", T);
    expect(again.shopId).toBe(listCatalog(db)[0].shopId);
    for (const line of EXAMPLE_SCRIPTS.fruit.lines) await teachTurn(db, again.id, { text: line }, T);
    publishSession(db, again.id, T);
    expect(listCatalog(db)).toHaveLength(3);
  });

  it("resumes an unfinished walk-through for the same shop", async () => {
    const s = createShopSession(db, "Corner Deli", T);
    await teachTurn(db, s.id, { text: "These are bagels, 24 each." }, T);
    const again = newSessionForShop(db, s.shopId, T);
    expect(again.id).toBe(s.id);
    expect(again.items).toHaveLength(1);
  });

  it("salad demo reset does not wipe taught shops", async () => {
    const id = await teachFruit();
    publishSession(db, id, T);
    seedDemo(db, {}, T);
    expect(listCatalog(db)).toHaveLength(3);
  });
});

describe("buyer request parsing", () => {
  it("reads quantity, unit, budget and keywords", () => {
    expect(parseBuyerRequest("2 lb of sweet apples, max $5 total")).toMatchObject({ qty: 2, unit: "lb", budgetCents: 500, question: "Are they sweet?" });
    expect(parseBuyerRequest("a warm winter coat under $50").budgetCents).toBe(5000);
  });
});
