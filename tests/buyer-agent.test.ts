import { beforeEach, describe, expect, it } from "vitest";
import type OpenAI from "openai";
import { freshDb } from "./helpers";
import { setPayPalApi } from "@/lib/paypal/client";
import { setupRosa } from "@/lib/demo/setup";
import { normalizeMandate, openaiAgent, runBuyerAgent, type AgentEvent } from "@/lib/agentic/buyer-agent";
import { parseIntent, pickForIntent } from "@/lib/demo/rosa";
import { listCatalog } from "@/lib/teach/catalog";
import type { DB } from "@/lib/db/client";

let db: DB;
beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  db = freshDb();
  setPayPalApi(null);
});

type Msg = { role: string; content?: string | null; tool_calls?: unknown[] };
/** A scripted stand-in for the OpenAI model: returns the mandate, then one tool call per turn. */
function fakeOpenAI(steps: ((msgs: Msg[]) => { content?: string; call?: { name: string; args: Record<string, unknown> } })[], mandate: object) {
  let i = 0;
  const calls: { tools?: unknown[] }[] = [];
  const client = {
    chat: {
      completions: {
        create: async (req: { messages: Msg[]; tools?: unknown[]; response_format?: unknown }) => {
          calls.push(req);
          if (req.response_format) return { choices: [{ message: { role: "assistant", content: JSON.stringify(mandate) } }] };
          const step = steps[i++]?.(req.messages) ?? { content: "Done." };
          const tool_calls = step.call ? [{ id: `c${i}`, type: "function", function: { name: step.call.name, arguments: JSON.stringify(step.call.args) } }] : undefined;
          return { choices: [{ message: { role: "assistant", content: step.content ?? null, tool_calls } }] };
        },
      },
    },
  };
  return { client: client as unknown as OpenAI, calls };
}
/** A buyer that reacts to the stall's counter (the stall's price depends on the time of day). */
const haggle = (m: Msg[]) => {
  const t = lastTool(m);
  if (t.status === "in_progress") return { content: "Please approve in PayPal." };
  if (t.status === "ready_for_payment") return { call: { name: "complete_checkout", args: {} } };
  const c = t.negotiation?.seller_counter_per_unit;
  if (c != null && c * 4 <= 1000) return { call: { name: "accept_seller_counter", args: {} } };
  return { call: { name: "propose_price", args: { offer_per_unit_usd: 2.45, message: "Meet me at $2.45?" } } };
};
const lastTool = (msgs: Msg[]) => JSON.parse(String([...msgs].reverse().find((m) => m.role === "tool")?.content ?? "{}"));

describe("OpenAI buyer agent (scripted model)", () => {
  it("shops through the stall's tools, speaks in its own words, and stops at checkout", async () => {
    const { shopId } = await setupRosa(db);
    const events: AgentEvent[] = [];
    let sku = "";
    const { client, calls } = fakeOpenAI(
      [
        () => ({ call: { name: "read_product_feed", args: {} } }),
        (m) => {
          sku = lastTool(m).items.find((x: { title: string }) => x.title === "White peaches").sku;
          return { call: { name: "ask_seller", args: { sku, question: "Good for jam?" } } };
        },
        () => ({ call: { name: "open_checkout_session", args: { sku, quantity: 4, offer_per_unit_usd: 9, message: "How about $9.00?" } } }),
        (m) => {
          expect(lastTool(m).error).toMatch(/mandate/);
          return { call: { name: "open_checkout_session", args: { sku, quantity: 4, offer_per_unit_usd: 2.2, message: "Hi Rosa! Could you do $2.20 a pound for jam peaches?" } } };
        },
        ...Array.from({ length: 6 }, () => haggle),
      ],
      { want: "peaches for jam", quantity: 4, max_total_usd: 10, priority: "balanced", questions: ["Good for jam?"] },
    );
    await openaiAgent(db, shopId, "4 lb peaches for jam, under $10", (e) => events.push(e), client, "gpt-test", null);

    expect(events.find((e) => e.type === "mode")).toMatchObject({ agent: "openai", model: "gpt-test" });
    expect(events.find((e) => e.type === "mandate")).toMatchObject({ mandate: { quantity: 4, max_total_cents: 1000 } });
    const said = events.filter((e) => e.type === "say").map((e) => (e as { text: string }).text);
    expect(said).toContain("Hi Rosa! Could you do $2.20 a pound for jam peaches?");
    const done = events.find((e) => e.type === "done") as { outcome: string; orderId?: string };
    expect(done.outcome).toBe("approve");
    expect(done.orderId).toBeTruthy();
    const order = db.prepare("SELECT total_cents, status FROM orders WHERE id=?").get(done.orderId) as { total_cents: number; status: string };
    expect(order.total_cents).toBeLessThanOrEqual(1000);
    expect(order.status).toBe("CREATED");
    // The model was offered the stall tools; PayPal toolkit tools only when Sandbox keys exist.
    const names = (calls[1].tools as { function: { name: string } }[]).map((t) => t.function.name);
    expect(names).toEqual(expect.arrayContaining(["read_product_feed", "open_checkout_session", "complete_checkout"]));
    expect(names).not.toContain("get_order");
    // Chat completions rejects reasoning_effort together with function tools on some models.
    expect((calls[1] as { reasoning_effort?: unknown }).reasoning_effort).toBeUndefined();
  });

  it("ignores agent words that quote a different price than the offer", async () => {
    const { shopId } = await setupRosa(db);
    const events: AgentEvent[] = [];
    const { client } = fakeOpenAI(
      [
        () => ({ call: { name: "read_product_feed", args: {} } }),
        (m) => ({ call: { name: "open_checkout_session", args: { sku: lastTool(m).items[0].sku, quantity: 1, offer_per_unit_usd: 2, message: "I'll give you $1.00" } } }),
        () => ({ call: { name: "walk_away", args: { reason: "test" } } }),
      ],
      { want: "apples", quantity: 1, max_total_usd: null, priority: "cheapest", questions: [] },
    );
    await openaiAgent(db, shopId, "apples", (e) => events.push(e), client, "gpt-test", null);
    const said = events.filter((e) => e.type === "say" && e.who === "buyer").map((e) => (e as { text: string }).text);
    expect(said.join(" ")).not.toContain("$1.00");
    expect(events.at(-1)).toMatchObject({ type: "done", outcome: "walked" });
  });
});

describe("rule-based buyer agent (no OpenAI key)", () => {
  it("stays inside the budget or walks away", async () => {
    const { shopId } = await setupRosa(db);
    const run = async (text: string) => {
      const ev: AgentEvent[] = [];
      await runBuyerAgent(db, shopId, text, (e) => ev.push(e));
      return ev;
    };
    const jam = await run("4 lb peaches for jam, under $10");
    expect(jam.find((e) => e.type === "mode")).toMatchObject({ agent: "rules" });
    const ok = jam.at(-1) as { outcome: string; orderId: string };
    expect(ok.outcome).toBe("approve");
    expect((db.prepare("SELECT total_cents FROM orders WHERE id=?").get(ok.orderId) as { total_cents: number }).total_cents).toBeLessThanOrEqual(1000);

    const rex = await run("2 boxes of strawberries. I’ll pay $5 total, not a cent more.");
    expect(rex.at(-1)).toMatchObject({ type: "done", outcome: "walked" });
  }, 20000);
});

describe("reading the shopper's intent", () => {
  it("accepts loosely typed model JSON", () => {
    expect(normalizeMandate({ want: "red fruit", quantity: "2", max_total_usd: "$10", priority: "cheapest", questions: "Are they sweet?" }, "x")).toEqual({
      want: "red fruit",
      quantity: 2,
      max_total_cents: 1000,
      priority: "cheapest",
      questions: ["Are they sweet?"],
    });
    expect(normalizeMandate({ quantity: null, max_total_usd: null, priority: "?" }, "red ones")).toMatchObject({ want: "red ones", quantity: 1, max_total_cents: null, priority: "balanced", questions: [] });
  });
  it("doesn't read a $ amount as a quantity, and matches colours", async () => {
    expect(parseIntent("red ones under $10")).toMatchObject({ qty: 1, budgetCents: 1000 });
    const { shopId } = await setupRosa(db);
    const items = listCatalog(db, undefined, shopId).map((i) => ({ productId: i.productId, sku: i.sku, shopId, name: i.name, unit: i.unit, listPriceCents: i.listPriceCents, available: i.available, facts: i.facts }));
    expect(["Strawberries", "Fuji apples"]).toContain(pickForIntent(items, parseIntent("red ones under $10"))?.item.name);
  });
});
