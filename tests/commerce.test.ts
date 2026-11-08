import { beforeEach, describe, expect, it } from "vitest";
import { FakePayPal, freshDb } from "./helpers";
import { setPayPalApi } from "@/lib/paypal/client";
import {
  capturePayPalOrder,
  cancelOrder,
  createOrderFromQuote,
  createPayPalOrder,
  createQuote,
  getOrder,
  handlePayPalWebhook,
  payMockOrder,
  reconcileOrder,
  QUOTE_TTL_SECONDS,
} from "@/lib/server/commerce";
import { getContext } from "@/lib/server/context";
import { computeRecommendation, publishDecision, updatePolicy } from "@/lib/server/pricing-service";
import { DEMO } from "@/lib/server/util";
import type { DB } from "@/lib/db/client";

const P = DEMO.productId;
const T0 = new Date("2026-11-08T18:00:00Z");
const later = (s: number) => new Date(T0.getTime() + s * 1000);
const merchant = { kind: "merchant" as const, id: "demo" };

let db: DB;
let pp: FakePayPal;

function salesOf(db: DB, source: string) {
  return (db.prepare("SELECT COUNT(*) AS n, COALESCE(-SUM(qty_delta),0) AS q FROM inventory_movements WHERE type='SALE' AND source=?").get(source) as { n: number; q: number });
}

async function startCheckout(at = T0) {
  const q = createQuote(db, P, 1, at);
  const o = createOrderFromQuote(db, q.id, at);
  const { paypalOrderId } = await createPayPalOrder(db, pp, o.id, at);
  return { q, o, paypalOrderId };
}

beforeEach(() => {
  db = freshDb();
  pp = new FakePayPal();
  setPayPalApi(pp);
});

describe("quotes", () => {
  it("locks the published price even if the published price later changes", async () => {
    const q = createQuote(db, P, 1, T0);
    expect(q.unit_price_cents).toBe(700);
    // Merchant publishes a new price (autopilot off, approval by merchant)
    updatePolicy(db, P, { cooldownMinutes: 0, minGainCents: 0, maxStepCents: 200 }, merchant, T0);
    db.prepare("UPDATE sim_state SET current_hour=12").run();
    const d = computeRecommendation(db, P, merchant, T0);
    expect(d.result.action).not.toBe("HOLD");
    publishDecision(db, d.id, merchant, T0);
    expect(getContext(db, P, T0).published!.priceCents).not.toBe(700);
    const o = createOrderFromQuote(db, q.id, later(10));
    expect(o.total_cents).toBe(700);
    const { paypalOrderId } = await createPayPalOrder(db, pp, o.id, later(20));
    expect(pp.orders.get(paypalOrderId)!.args.totalValue).toBe("7.00");
  });

  it("reserves stock and refuses quotes beyond available stock", () => {
    db.prepare("UPDATE inventory_movements SET qty_delta=2 WHERE type='PRODUCTION'").run();
    createQuote(db, P, 1, T0);
    createQuote(db, P, 1, T0);
    expect(() => createQuote(db, P, 1, T0)).toThrow(/available/);
    // after expiry the reservations are released
    expect(createQuote(db, P, 1, later(QUOTE_TTL_SECONDS + 1)).status).toBe("ACTIVE");
  });

  it("rejects orders from expired quotes", () => {
    const q = createQuote(db, P, 1, T0);
    expect(() => createOrderFromQuote(db, q.id, later(QUOTE_TTL_SECONDS + 1))).toThrow(/expired|EXPIRED/i);
  });

  it("is one order per quote (idempotent)", () => {
    const q = createQuote(db, P, 1, T0);
    expect(createOrderFromQuote(db, q.id, T0).id).toBe(createOrderFromQuote(db, q.id, T0).id);
  });
});

describe("PayPal Sandbox flow (fake PayPal API)", () => {
  it("captures, verifies and decrements inventory exactly once across retries and webhook replays", async () => {
    const before = getContext(db, P, T0).stock.onHand;
    const { o, paypalOrderId } = await startCheckout();
    pp.approve(paypalOrderId);
    const r1 = await capturePayPalOrder(db, pp, paypalOrderId, later(30));
    expect(r1).toMatchObject({ status: "PAID", alreadyProcessed: false });
    const r2 = await capturePayPalOrder(db, pp, paypalOrderId, later(31));
    expect(r2).toMatchObject({ status: "PAID", alreadyProcessed: true });
    const ev = { id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { supplementary_data: { related_ids: { order_id: paypalOrderId } } } };
    expect((await handlePayPalWebhook(db, pp, {}, JSON.stringify(ev), later(40))).httpStatus).toBe(200);
    expect((await handlePayPalWebhook(db, pp, {}, JSON.stringify(ev), later(41))).note).toMatch(/duplicate/);
    expect((await handlePayPalWebhook(db, pp, {}, JSON.stringify({ ...ev, id: "WH-2" }), later(42))).note).toMatch(/PAID/);
    expect(getOrder(db, o.id).status).toBe("PAID");
    expect(salesOf(db, "PAYPAL_SANDBOX")).toEqual({ n: 1, q: 1 });
    expect(getContext(db, P, later(50)).stock.onHand).toBe(before - 1);
    expect(pp.captureCalls.every((c) => c.requestId === `capture-${o.id}`)).toBe(true);
  });

  it("does not capture when the quote expired before approval completed", async () => {
    const { o, paypalOrderId } = await startCheckout();
    pp.approve(paypalOrderId);
    await expect(capturePayPalOrder(db, pp, paypalOrderId, later(QUOTE_TTL_SECONDS + 5))).rejects.toThrow(/expired/i);
    expect(pp.captureCalls).toHaveLength(0);
    expect(getOrder(db, o.id).status).toBe("EXPIRED");
    expect(salesOf(db, "PAYPAL_SANDBOX").n).toBe(0);
  });

  it("rejects a capture whose amount does not match and does not touch inventory", async () => {
    const { o, paypalOrderId } = await startCheckout();
    pp.approve(paypalOrderId);
    pp.next = "wrong_amount";
    const r = await capturePayPalOrder(db, pp, paypalOrderId, later(30));
    expect(r.status).toBe("FAILED");
    expect(getOrder(db, o.id).status).toBe("FAILED");
    expect(salesOf(db, "PAYPAL_SANDBOX").n).toBe(0);
  });

  it("recovers from a network timeout during capture without double counting", async () => {
    const { o, paypalOrderId } = await startCheckout();
    pp.approve(paypalOrderId);
    pp.next = "network_error";
    const r = await capturePayPalOrder(db, pp, paypalOrderId, later(30));
    // capture happened at PayPal; our client re-fetched the order and applied it
    expect(r.status).toBe("PAID");
    const again = await capturePayPalOrder(db, pp, paypalOrderId, later(31));
    expect(again).toMatchObject({ status: "PAID", alreadyProcessed: true });
    expect(salesOf(db, "PAYPAL_SANDBOX")).toEqual({ n: 1, q: 1 });
    expect(getOrder(db, o.id).status).toBe("PAID");
  });

  it("treats ORDER_ALREADY_CAPTURED as success after verification", async () => {
    const { paypalOrderId } = await startCheckout();
    pp.approve(paypalOrderId);
    pp.next = "already_captured_error";
    expect((await capturePayPalOrder(db, pp, paypalOrderId, later(30))).status).toBe("PAID");
    expect(salesOf(db, "PAYPAL_SANDBOX").n).toBe(1);
  });

  it("returns the order to approval on instrument decline", async () => {
    const { o, paypalOrderId } = await startCheckout();
    pp.approve(paypalOrderId);
    pp.next = "declined_instrument";
    await expect(capturePayPalOrder(db, pp, paypalOrderId, later(30))).rejects.toThrow(/declined/i);
    expect(getOrder(db, o.id).status).toBe("AWAITING_APPROVAL");
    expect((await capturePayPalOrder(db, pp, paypalOrderId, later(40))).status).toBe("PAID");
  });

  it("keeps stock reserved for a PENDING capture and completes via verified webhook", async () => {
    const { o, paypalOrderId } = await startCheckout();
    pp.approve(paypalOrderId);
    pp.next = "pending";
    expect((await capturePayPalOrder(db, pp, paypalOrderId, later(30))).status).toBe("PAYMENT_PENDING");
    // reservation outlives the quote TTL while payment is pending
    expect(getContext(db, P, later(QUOTE_TTL_SECONDS + 100)).stock.reserved).toBe(1);
    pp.settle(paypalOrderId);
    const bad = await handlePayPalWebhook(db, Object.assign(pp, { webhookValid: false }), {}, JSON.stringify({ id: "WH-9", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { supplementary_data: { related_ids: { order_id: paypalOrderId } } } }), later(600));
    expect(bad.httpStatus).toBe(401);
    expect(getOrder(db, o.id).status).toBe("PAYMENT_PENDING");
    pp.webhookValid = true;
    const ok = await handlePayPalWebhook(db, pp, {}, JSON.stringify({ id: "WH-9", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { supplementary_data: { related_ids: { order_id: paypalOrderId } } } }), later(601));
    expect(ok.note).toMatch(/PAID/);
    expect(getOrder(db, o.id).status).toBe("PAID");
    expect(getContext(db, P, later(602)).stock.reserved).toBe(0);
    expect((await reconcileOrder(db, pp, o.id, later(603))).status).toBe("PAID");
    expect(salesOf(db, "PAYPAL_SANDBOX").n).toBe(1);
  });

  it("handles buyer cancellation by releasing the reservation", async () => {
    const { o } = await startCheckout();
    expect(getContext(db, P, later(1)).stock.reserved).toBe(1);
    cancelOrder(db, o.id, "BUYER_CANCELLED", later(2));
    expect(getContext(db, P, later(3)).stock.reserved).toBe(0);
  });
});

describe("mock checkout isolation", () => {
  it("labels mock sales separately and refuses PayPal paths for mock orders", async () => {
    setPayPalApi(null);
    const q = createQuote(db, P, 1, T0);
    const o = createOrderFromQuote(db, q.id, T0);
    expect(o.payment_source).toBe("MOCK_CHECKOUT");
    await expect(createPayPalOrder(db, pp, o.id, T0)).rejects.toThrow(/MOCK/);
    expect(payMockOrder(db, o.id, "success", T0).status).toBe("PAID");
    expect(payMockOrder(db, o.id, "success", T0)).toMatchObject({ alreadyProcessed: true });
    expect(salesOf(db, "MOCK_CHECKOUT")).toEqual({ n: 1, q: 1 });
    expect(salesOf(db, "PAYPAL_SANDBOX").n).toBe(0);
  });

  it("refuses mock payment for PayPal orders", () => {
    const q = createQuote(db, P, 1, T0);
    const o = createOrderFromQuote(db, q.id, T0);
    expect(o.payment_source).toBe("PAYPAL_SANDBOX");
    expect(() => payMockOrder(db, o.id, "success", T0)).toThrow(/MOCK/);
  });
});
