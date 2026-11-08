import { beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";
import { setPayPalApi } from "@/lib/paypal/client";
import { advanceHour, runToClose, setScenario, startNewDay } from "@/lib/server/sim-service";
import { computeRecommendation, publishDecision, updatePolicy, listDecisions } from "@/lib/server/pricing-service";
import { createOrderFromQuote, createQuote, payMockOrder } from "@/lib/server/commerce";
import { getContext } from "@/lib/server/context";
import { DEMO } from "@/lib/server/util";
import type { DB } from "@/lib/db/client";

const P = DEMO.productId;
const T = new Date("2026-11-08T18:00:00Z");
const merchant = { kind: "merchant" as const, id: "demo" };
let db: DB;

beforeEach(() => {
  db = freshDb();
  setPayPalApi(null);
});

describe("store clock + pricing services", () => {
  it("runs a full day: conserves units, labels sources, closes with waste", () => {
    updatePolicy(db, P, { mode: "autopilot" }, merchant, T);
    const hours = runToClose(db, P, T);
    expect(hours).toHaveLength(11);
    expect(hours.at(-1)!.closed).toBe(true);
    const ctx = getContext(db, P, T);
    const sold = (db.prepare("SELECT COALESCE(-SUM(qty_delta),0) AS v FROM inventory_movements WHERE type='SALE'").get() as { v: number }).v;
    const waste = (db.prepare("SELECT COALESCE(-SUM(qty_delta),0) AS v FROM inventory_movements WHERE type='WASTE'").get() as { v: number }).v;
    expect(sold + waste).toBe(100);
    expect(ctx.storeOpen).toBe(false);
    const prices = (db.prepare("SELECT price_cents FROM published_prices ORDER BY version").all() as { price_cents: number }[]).map((r) => r.price_cents);
    expect(prices.length).toBeGreaterThan(2);
    expect(() => advanceHour(db, P, T)).toThrow(/closed/i);
    startNewDay(db, P, 100, T);
    expect(getContext(db, P, T).stock.onHand).toBe(100);
  });

  it("approval mode does not auto-publish", () => {
    advanceHour(db, P, T);
    advanceHour(db, P, T);
    advanceHour(db, P, T);
    const pubs = (db.prepare("SELECT COUNT(*) AS n FROM published_prices").get() as { n: number }).n;
    expect(pubs).toBe(1);
    expect(listDecisions(db, P).length).toBe(3);
  });

  it("recorded sales change the next recommendation's state", () => {
    db.prepare("UPDATE sim_state SET current_hour=12").run();
    const d1 = computeRecommendation(db, P, merchant, T);
    for (let i = 0; i < 5; i++) {
      const q = createQuote(db, P, 1, T);
      payMockOrder(db, createOrderFromQuote(db, q.id, T).id, "success", T);
    }
    const d2 = computeRecommendation(db, P, merchant, T);
    expect(d2.result.signals.stock).toBe(d1.result.signals.stock - 5);
    expect(listDecisions(db, P)[1].status).toBe("SUPERSEDED");
  });

  it("refuses stale decisions and enforces agent authorization", () => {
    updatePolicy(db, P, { cooldownMinutes: 0, minGainCents: 0 }, merchant, T);
    db.prepare("UPDATE sim_state SET current_hour=12").run();
    const d = computeRecommendation(db, P, merchant, T);
    expect(d.status).toBe("PROPOSED");
    const agent = { kind: "agent" as const, id: "a", scopes: ["pricing:read", "pricing:recommend"] };
    expect(() => publishDecision(db, d.id, agent, T)).toThrow(/scope/);
    const pub = { ...agent, scopes: [...agent.scopes, "pricing:publish"] };
    expect(() => publishDecision(db, d.id, pub, T)).toThrow(/does not allow agents/);
    expect(() => updatePolicy(db, P, { floorCents: 100 }, pub, T)).toThrow(/merchant/);
    updatePolicy(db, P, { agentPublishAllowed: true, mode: "autopilot" }, merchant, T);
    // policy changed => old decision superseded
    expect(() => publishDecision(db, d.id, merchant, T)).toThrow(/SUPERSEDED/);
    const d2 = computeRecommendation(db, P, pub, T);
    expect(publishDecision(db, d2.id, pub, T).priceCents).toBe(d2.result.recommendedPriceCents);
    expect(() => publishDecision(db, d2.id, merchant, T)).toThrow(/PUBLISHED/);
  });

  it("rejects invalid policy", () => {
    expect(() => updatePolicy(db, P, { floorCents: 1000, ceilingCents: 500 }, merchant, T)).toThrow(/Floor/);
    expect(() => updatePolicy(db, P, { floorCents: 455 }, merchant, T)).toThrow(/multiples/);
  });

  it("unforecasted demand shifts surface as sell-through calibration", () => {
    setScenario(db, P, { demandShift: 0.5 }, T);
    for (let i = 0; i < 4; i++) advanceHour(db, P, T);
    expect(getContext(db, P, T).calibration).toBeLessThan(0.95);
  });

  it("cold start without history yields low confidence and approval", () => {
    db = freshDb({ withHistory: false });
    expect(getContext(db, P, T).confidence).toBe("low");
  });
});
