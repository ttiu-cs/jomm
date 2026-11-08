import { beforeEach, describe, expect, it } from "vitest";
import { FakePayPal, freshDb } from "./helpers";
import { setPayPalApi } from "@/lib/paypal/client";
import { acceptCounter, buyerView, declineNegotiation, makeOffer, sellerNegotiationView, startNegotiation } from "@/lib/server/negotiation";
import { jumpToScenario, DEMO_SCENARIOS } from "@/lib/server/sim-service";
import { capturePayPalOrder, createOrderFromQuote, createPayPalOrder } from "@/lib/server/commerce";
import { getContext } from "@/lib/server/context";
import { DEMO } from "@/lib/server/util";
import type { DB } from "@/lib/db/client";

const P = DEMO.productId;
const T = new Date("2026-11-08T18:00:00Z");
let db: DB;

beforeEach(() => {
  db = freshDb();
  setPayPalApi(null);
});

describe("seller walk-away price", () => {
  it("refuses discounts in the lunch rush and allows them near closing with surplus stock", () => {
    jumpToScenario(db, P, DEMO_SCENARIOS.lunch, T);
    const lunch = sellerNegotiationView(db, P, T);
    expect(lunch.regime).toBe("SCARCE");
    expect(lunch.walkAwayCents).toBe(700);
    jumpToScenario(db, P, DEMO_SCENARIOS.closing, T);
    const closing = sellerNegotiationView(db, P, T);
    expect(closing.regime).toBe("SURPLUS");
    expect(closing.walkAwayCents).toBeLessThan(600);
    // policy cap: never more than 35% off, never below the floor
    expect(closing.walkAwayCents).toBeGreaterThanOrEqual(Math.ceil(700 * 0.65));
    expect(getContext(db, P, T).stock.onHand).toBe(30);
  });
});

describe("negotiation", () => {
  it("same $5 budget: no deal at lunch, deal near closing", () => {
    jumpToScenario(db, P, DEMO_SCENARIOS.lunch, T);
    let n = startNegotiation(db, P, 450, "buyer", T);
    expect(n.status).toBe("OPEN");
    expect(n.sellerCounterCents).toBe(700);
    expect(n.sellerCounterIsFinal).toBe(true);
    expect(JSON.stringify(n)).not.toMatch(/walk/i); // buyer never sees the walk-away price
    n = declineNegotiation(db, n.id, T);
    expect(n.status).toBe("CLOSED");

    jumpToScenario(db, P, DEMO_SCENARIOS.closing, T);
    n = startNegotiation(db, P, 450, "buyer", T);
    expect(n.status).toBe("OPEN");
    const c1 = n.sellerCounterCents!;
    expect(c1).toBeLessThan(700);
    n = makeOffer(db, n.id, 475, T);
    const c2 = n.sellerCounterCents;
    if (n.status === "OPEN") {
      expect(c2!).toBeLessThanOrEqual(c1);
      n = makeOffer(db, n.id, 500, T);
    }
    expect(n.status).toBe("AGREED");
    expect(n.agreedPriceCents).toBeLessThanOrEqual(500);
    expect(n.quote!.unit_price_cents).toBe(n.agreedPriceCents);
  });

  it("accepts offers at or above the listed price at the listed price", () => {
    const n = startNegotiation(db, P, 900, "buyer", T);
    expect(n.status).toBe("AGREED");
    expect(n.agreedPriceCents).toBe(700);
  });

  it("enforces offer limits and lets the buyer accept the final counter", () => {
    jumpToScenario(db, P, DEMO_SCENARIOS.closing, T);
    let n = startNegotiation(db, P, 100, "b", T);
    n = makeOffer(db, n.id, 100, T);
    n = makeOffer(db, n.id, 100, T);
    expect(n.sellerCounterIsFinal).toBe(true);
    expect(() => makeOffer(db, n.id, 100, T)).toThrow(/final/i);
    const final = n.sellerCounterCents!;
    expect(final).toBe(sellerNegotiationView(db, P, T).walkAwayCents);
    n = acceptCounter(db, n.id, T);
    expect(n.status).toBe("AGREED");
    expect(n.agreedPriceCents).toBe(final);
    expect(() => makeOffer(db, n.id, 600, T)).toThrow(/AGREED/);
  });

  it("rejects invalid offers and expires idle negotiations", () => {
    expect(() => startNegotiation(db, P, 12.5, "b", T)).toThrow(/whole number/);
    jumpToScenario(db, P, DEMO_SCENARIOS.closing, T);
    const n = startNegotiation(db, P, 300, "b", T);
    expect(() => makeOffer(db, n.id, 350, new Date(T.getTime() + 11 * 60 * 1000))).toThrow(/EXPIRED/);
  });

  it("agreed price flows through PayPal checkout unchanged and decrements stock once", async () => {
    const pp = new FakePayPal();
    setPayPalApi(pp);
    jumpToScenario(db, P, DEMO_SCENARIOS.closing, T);
    let n = startNegotiation(db, P, 450, "b", T);
    while (n.status === "OPEN" && !n.sellerCounterIsFinal) n = makeOffer(db, n.id, 450, T);
    if (n.status === "OPEN") n = acceptCounter(db, n.id, T);
    const view = buyerView(db, n.id);
    const order = createOrderFromQuote(db, view.quote!.id, T);
    expect(order.total_cents).toBe(n.agreedPriceCents);
    const { paypalOrderId } = await createPayPalOrder(db, pp, order.id, T);
    expect(pp.orders.get(paypalOrderId)!.args.totalValue).toBe((n.agreedPriceCents! / 100).toFixed(2));
    pp.approve(paypalOrderId);
    expect((await capturePayPalOrder(db, pp, paypalOrderId, T)).status).toBe("PAID");
    expect(getContext(db, P, T).stock.onHand).toBe(29);
  });
});
