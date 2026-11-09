import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshDb } from "./helpers";
import { resaleRange, summarize } from "@/lib/market/channel3";
import { createShopSession, teachTurn } from "@/lib/teach/service";
import { EXAMPLE_SCRIPTS, scriptLine } from "@/lib/teach/examples";
import type { DB } from "@/lib/db/client";

const offer = (title: string, price: number, domain: string) => ({ title, offers: [{ price: { price, currency: "USD" }, domain, condition: "new" }] });
// Shaped like real Channel3 results for "Madewell wool coat" (same brand mixed with unrelated luxury coats).
const COATS = [
  offer("Manon Cocoon Longline Wool Coat", 348, "nuuly.com"),
  offer("The Simone Cocoon Coat", 348, "madewell.com"),
  offer("Officer Coat In Italian Melton Wool Blend", 399.99, "madewell.com"),
  offer("The Alonzo Coat", 398, "madewell.com"),
  offer("Alexa Chung for Madewell Leni Peacoat", 349.99, "madewell.com"),
  offer("Wool Coat", 4777, "garmentory.com"),
  offer("wool coat", 1003, "farfetch.com"),
];

describe("Channel3 price lookup", () => {
  it("summarizes same-brand new prices and drops outliers", () => {
    const s = summarize("Madewell wool coat", COATS)!;
    expect(s.count).toBe(4);
    expect(s.lowCents).toBe(34800);
    expect(s.highCents).toBe(39999);
    expect(s.medianCents).toBe(37400);
  });
  it("needs a few real offers", () => {
    expect(summarize("anything", COATS.slice(0, 2))).toBeNull();
  });
  it("suggests a resale range by condition", () => {
    expect(resaleRange(35000, "Good")).toMatchObject({ lowCents: 10500, highCents: 14000 });
    expect(resaleRange(35000, "Has flaws").highCents).toBeLessThan(resaleRange(35000, "Like new").lowCents);
  });
});

describe("teaching a second-hand item with Channel3", () => {
  let db: DB;
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    db = freshDb();
  });
  afterEach(() => {
    delete process.env.CHANNEL3_API_KEY;
    vi.unstubAllGlobals();
  });

  it("looks the item up, fills the price elsewhere, and suggests a resale price", async () => {
    process.env.CHANNEL3_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ products: COATS }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const s = createShopSession(db, "Mina's Closet");
    const t = await teachTurn(db, s.id, { text: "This is a Madewell wool coat, worn twice, size M." }, new Date(), { rulesOnly: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(t.reply).toMatch(/Channel3: a new Madewell wool coat sells for \$348–\$399\.99/);
    expect(t.reply).toMatch(/fair resale price is about \$1\d\d–\$1\d\d/);
    const coat = t.items[0];
    expect(coat.rules).toMatchObject({ marketSource: "channel3", marketCents: 37400 });
    // The agent no longer needs to ask for the price elsewhere.
    expect(coat.checklist.find((c) => c.key === "marketCents")?.done).toBe(true);
  });

  it("never looks up produce, and asks the owner when there's no key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.CHANNEL3_API_KEY = "test-key";
    const s = createShopSession(db, "Fruit");
    await teachTurn(db, s.id, { text: "These are Fuji apples, 30 lb." }, new Date(), { rulesOnly: true });
    expect(fetchMock).not.toHaveBeenCalled();

    delete process.env.CHANNEL3_API_KEY;
    const c = createShopSession(db, "Mina's Closet 2");
    let reply: string | null = null;
    let last;
    for (const raw of EXAMPLE_SCRIPTS.closet.lines) {
      const line = scriptLine(raw, reply);
      if (!line) continue;
      last = await teachTurn(db, c.id, { text: line }, new Date(), { rulesOnly: true });
      reply = last.reply;
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(last!.items.map((i) => i.rules?.marketCents)).toEqual([35000, 8500, 13000, 20000, 21000]);
    expect(last!.items.every((i) => i.checklist.every((x) => x.done))).toBe(true);
  });
});
