/**
 * The shopper's buyer agent, running on the server.
 *
 * - With OPENAI_API_KEY: an OpenAI tool-calling agent. It turns the shopper's sentence into a
 *   mandate (what, how many, max total), then shops Rosa's stall with the stall's tools (product
 *   feed, Q&A, ACP-style checkout sessions) and the official PayPal Agent Toolkit tools.
 * - Without it: a rule-based agent with the same tools, clearly labeled.
 *
 * The shopper's mandate is enforced here, in the tool code, not by the model: an offer or deal over
 * the shopper's budget is refused before it reaches the stall. The agent can never pay; it stops
 * at "complete", and the shopper approves in PayPal.
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionMessageFunctionToolCall } from "openai/resources/chat/completions";
import type { DB } from "../db/client";
import { listCatalog, answerQuestion } from "../teach/catalog";
import { cancelSession, completeSession, createSession, sessionView, updateSession } from "./checkout";
import { getPayPalToolkit } from "./paypal-toolkit";
import { parseIntent, pickForIntent, type Priority } from "../demo/rosa";
import { DomainError } from "../server/util";

// ------------------------------------------------------------------ events

export type Trace = { method: string; path: string; concept: string; result: string; paypal?: boolean; json?: unknown };
export type AgentEvent =
  | { type: "mode"; agent: "openai" | "rules"; model?: string; paypalToolkit: boolean; note?: string }
  | { type: "mandate"; mandate: Mandate }
  | { type: "note"; text: string }
  | { type: "say"; who: "buyer" | "seller"; text: string }
  | { type: "trace"; trace: Trace }
  | { type: "session"; session: ReturnType<typeof sessionView> }
  | { type: "done"; outcome: "approve" | "walked" | "no_match" | "error"; sessionId?: string; orderId?: string; message?: string };

export interface Mandate {
  want: string;
  quantity: number;
  max_total_cents: number | null;
  priority: Priority;
  questions: string[];
}

const usd = (c: number | null | undefined) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
const total = (s: ReturnType<typeof sessionView>) => s.totals.find((t) => t.type === "total")?.amount ?? 0;

// ------------------------------------------------------------------ tools (shared by both agents)

interface Ctx {
  db: DB;
  shopId: string;
  mandate: Mandate;
  emit: (e: AgentEvent) => void;
  sessionId: string | null;
  spoken: number;
  finished: null | "approve" | "walked";
  asked?: number;
}

function emitNewLines(ctx: Ctx, s: ReturnType<typeof sessionView>) {
  for (const m of s.conversation.slice(ctx.spoken)) ctx.emit({ type: "say", who: m.role, text: m.text });
  ctx.spoken = s.conversation.length;
}

/** Use the agent's own words for its offer, if they quote exactly the offered price and nothing else. */
function applyBuyerWords(db: DB, negotiationId: string, message: string | undefined, offerCents: number) {
  if (!message) return;
  const text = message.trim().slice(0, 240);
  const amounts = text.match(/\$\d+(?:\.\d{1,2})?/g) ?? [];
  if (!text || amounts.length === 0 || amounts.some((a) => Math.round(parseFloat(a.slice(1)) * 100) !== offerCents)) return;
  db.prepare("UPDATE negotiation_messages SET text=? WHERE id=(SELECT MAX(id) FROM negotiation_messages WHERE negotiation_id=? AND role='buyer')").run(text, negotiationId);
}

function overBudget(ctx: Ctx, perUnitCents: number, qty: number) {
  return ctx.mandate.max_total_cents !== null && perUnitCents * qty > ctx.mandate.max_total_cents;
}

const STALL_TOOLS: ChatCompletionTool[] = [
  fn("read_product_feed", "Read the stall's product feed: items, prices per unit, stock, and the owner's own words. Lowest prices are never included.", {}),
  fn("ask_seller", "Ask the stall's agent a question about one item. Answers come only from what the owner said.", {
    sku: { type: "string" },
    question: { type: "string", description: "Short, friendly question" },
  }, ["sku", "question"]),
  fn(
    "open_checkout_session",
    "Open an ACP-style checkout session for one item. Omit offer_per_unit_usd to accept the listed price; include it to propose a lower per-unit price (negotiation extension).",
    {
      sku: { type: "string" },
      quantity: { type: "integer", minimum: 1, maximum: 10 },
      offer_per_unit_usd: { type: "number", description: "Your proposed price per unit in USD, e.g. 2.25" },
      message: { type: "string", description: "What you say to the stall with this offer. Must quote the offer price, e.g. 'Could you do $2.25 a pound?'" },
    },
    ["sku", "quantity"],
  ),
  fn("propose_price", "Make another per-unit offer in the open session (max 3 offers in total).", {
    offer_per_unit_usd: { type: "number" },
    message: { type: "string", description: "What you say, quoting the offer price" },
  }, ["offer_per_unit_usd"]),
  fn("accept_seller_counter", "Accept the stall's current counteroffer.", {}),
  fn("walk_away", "Leave without buying (e.g. the stall's final price is over the shopper's budget). Nothing is charged.", { reason: { type: "string" } }, ["reason"]),
  fn("complete_checkout", "Complete the agreed checkout session. This creates the order; the shopper then approves the payment in PayPal. Call this once a price is agreed.", {}),
];

function fn(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ChatCompletionTool {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } };
}

async function runStallTool(ctx: Ctx, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { db, emit } = ctx;
  switch (name) {
    case "read_product_feed": {
      const items = listCatalog(db, undefined, ctx.shopId).map((i) => ({ sku: i.sku, title: i.name, unit: i.unit, price_per_unit_usd: i.listPriceCents / 100, in_stock: i.available, owner_says: i.facts, negotiable: i.negotiable }));
      emit({ type: "trace", trace: { method: "GET", path: "/agentic/feed", concept: "Discovery · product feed (Store Sync style)", result: `${items.length} items, prices and the owner’s words. No lowest prices.`, json: items } });
      return { items };
    }
    case "ask_seller": {
      ctx.asked = (ctx.asked ?? 0) + 1;
      if (ctx.asked > 2) return { error: "You've asked enough. Make your offer now." };
      const sku = String(args.sku ?? "");
      const question = String(args.question ?? "").slice(0, 200);
      const p = db.prepare("SELECT id FROM products WHERE sku=? AND store_id=?").get(sku, ctx.shopId) as { id: string } | undefined;
      if (!p) return { error: `Unknown sku ${sku}` };
      emit({ type: "say", who: "buyer", text: question });
      const a = await answerQuestion(db, p.id, question);
      emit({ type: "say", who: "seller", text: a.answer });
      emit({ type: "trace", trace: { method: "POST", path: `/shops/…/items/${sku}/ask`, concept: "Product Q&A · answered from the owner’s own words", result: "Same answer for every agent.", json: { question, answer: a.answer } } });
      return { answer: a.answer };
    }
    case "open_checkout_session": {
      if (ctx.sessionId) return { error: "A session is already open. Use propose_price, accept_seller_counter, walk_away or complete_checkout." };
      const sku = String(args.sku ?? "");
      const qty = Math.round(Number(args.quantity ?? ctx.mandate.quantity));
      const offer = args.offer_per_unit_usd === undefined || args.offer_per_unit_usd === null ? undefined : Math.round(Number(args.offer_per_unit_usd) * 100);
      const listed = listCatalog(db, undefined, ctx.shopId).find((i) => i.sku === sku);
      if (!listed) return { error: `Unknown sku ${sku}` };
      if (offer === undefined && ctx.mandate.priority !== "quality") return { error: "The shopper wants a good price: open with an offer (offer_per_unit_usd) instead of paying the listed price." };
      if (overBudget(ctx, offer ?? listed.listPriceCents, qty)) return { error: `Refused by the shopper's mandate: ${qty} × ${usd(offer ?? listed.listPriceCents)} is over the max total ${usd(ctx.mandate.max_total_cents)}.` };
      const body = { items: [{ id: sku, quantity: qty }], ...(offer === undefined ? {} : { negotiation: { offer_per_unit: offer } }), buyer: { agent: "buyer-agent" } };
      const s0 = createSession(db, body);
      if (offer !== undefined) applyBuyerWords(db, s0.id, args.message as string | undefined, offer);
      const s = sessionView(db, s0.id);
      ctx.sessionId = s.id;
      emitNewLines(ctx, s);
      emit({ type: "trace", trace: { method: "POST", path: "/agentic/checkout_sessions", concept: offer === undefined ? "Checkout session · create at the listed price" : "Checkout session · create + price proposal (negotiation extension)", result: summary(s), json: { request: body, response: brief(s) } } });
      emit({ type: "session", session: s });
      return brief(s);
    }
    case "propose_price": {
      if (!ctx.sessionId) return { error: "Open a checkout session first." };
      const offer = Math.round(Number(args.offer_per_unit_usd) * 100);
      const cur = sessionView(db, ctx.sessionId);
      const qty = cur.line_items[0].item.quantity;
      if (overBudget(ctx, offer, qty)) return { error: `Refused by the shopper's mandate: over the max total ${usd(ctx.mandate.max_total_cents)}.` };
      const counter = cur.negotiation.seller_counter_per_unit;
      if (counter !== null && offer >= counter) return { error: `Your offer ${usd(offer)} is not below the stall's counter ${usd(counter)}. Use accept_seller_counter instead.` };
      const req = { negotiation: { offer_per_unit: offer } };
      updateSession(db, ctx.sessionId, req);
      applyBuyerWords(db, ctx.sessionId, args.message as string | undefined, offer);
      const s = sessionView(db, ctx.sessionId);
      emitNewLines(ctx, s);
      emit({ type: "trace", trace: { method: "POST", path: `/agentic/checkout_sessions/${short(s.id)}`, concept: "Checkout session · update (negotiation extension)", result: summary(s), json: { request: req, response: brief(s) } } });
      emit({ type: "session", session: s });
      return brief(s);
    }
    case "accept_seller_counter": {
      if (!ctx.sessionId) return { error: "No open session." };
      const cur = sessionView(db, ctx.sessionId);
      const counter = cur.negotiation.seller_counter_per_unit;
      if (counter === null) return { error: "The stall has not made a counteroffer." };
      if (overBudget(ctx, counter, cur.line_items[0].item.quantity)) return { error: `Refused by the shopper's mandate: the counter totals ${usd(counter * cur.line_items[0].item.quantity)}, over the max total ${usd(ctx.mandate.max_total_cents)}. Walk away or propose lower.` };
      const req = { negotiation: { accept_counter: true } };
      const s = updateSession(db, ctx.sessionId, req);
      emitNewLines(ctx, s);
      emit({ type: "trace", trace: { method: "POST", path: `/agentic/checkout_sessions/${short(s.id)}`, concept: "Checkout session · update: accept the stall’s counter", result: summary(s), json: { request: req, response: brief(s) } } });
      emit({ type: "session", session: s });
      return brief(s);
    }
    case "walk_away": {
      if (!ctx.sessionId) {
        ctx.finished = "walked";
        return { ok: true };
      }
      const s = cancelSession(db, ctx.sessionId);
      emitNewLines(ctx, s);
      emit({ type: "trace", trace: { method: "POST", path: `/agentic/checkout_sessions/${short(s.id)}/cancel`, concept: "Checkout session · cancel (walks away)", result: "canceled · nothing charged", json: { reason: args.reason } } });
      emit({ type: "session", session: s });
      ctx.finished = "walked";
      return brief(s);
    }
    case "complete_checkout": {
      if (!ctx.sessionId) return { error: "No session." };
      const cur = sessionView(db, ctx.sessionId);
      if (cur.status !== "ready_for_payment") return { error: `Session is ${cur.status}; agree on a price first.` };
      if (ctx.mandate.max_total_cents !== null && total(cur) > ctx.mandate.max_total_cents) return { error: "Refused by the shopper's mandate: over budget." };
      const s = completeSession(db, ctx.sessionId);
      emit({ type: "trace", trace: { method: "POST", path: `/agentic/checkout_sessions/${short(s.id)}/complete`, concept: "Checkout session · complete → order for PayPal", result: `Order ${short(s.order!.id)} · ${usd(total(s))} · the shopper approves in PayPal`, json: brief(s) } });
      emit({ type: "session", session: s });
      ctx.finished = "approve";
      return { ...brief(s), next: "Tell the shopper to approve the payment in PayPal. You cannot pay yourself." };
    }
  }
  return { error: `Unknown tool ${name}` };
}

const short = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…` : id);
function summary(s: ReturnType<typeof sessionView>) {
  const unit = s.line_items[0]?.item.unit ?? "";
  const per = unit === "each" ? "" : `/${unit}`;
  if (s.status === "ready_for_payment") return `ready_for_payment · agreed ${usd(s.negotiation.agreed_per_unit)}${per} · total ${usd(total(s))}`;
  if (s.status === "canceled") return "canceled · nothing charged";
  return `${s.status} · stall counters ${usd(s.negotiation.seller_counter_per_unit)}${per}${s.negotiation.seller_counter_is_final ? " (final)" : ""}`;
}
function brief(s: ReturnType<typeof sessionView>) {
  return { id: s.id, status: s.status, line_items: s.line_items, totals: s.totals, payment_provider: s.payment_provider.provider, negotiation: s.negotiation, seller_says: s.messages[0]?.content ?? null, order: s.order };
}

// ------------------------------------------------------------------ mandate

/** Models phrase JSON loosely ("10", null, a single question string…); accept that and normalize. */
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(/[^\d.]/g, "")) : NaN);
export function normalizeMandate(raw: unknown, fallbackWant: string): Mandate {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const q = num(o.quantity);
  const budget = num(o.max_total_usd ?? o.budget ?? o.max_total);
  const questions = (Array.isArray(o.questions) ? o.questions : typeof o.questions === "string" ? [o.questions] : typeof o.question === "string" ? [o.question] : [])
    .filter((x): x is string => typeof x === "string" && x.trim().length > 3)
    .map((x) => x.trim().slice(0, 120))
    .slice(0, 1);
  const priority = o.priority === "cheapest" || o.priority === "quality" || o.priority === "balanced" ? o.priority : "balanced";
  return {
    want: (typeof o.want === "string" && o.want.trim() ? o.want.trim() : fallbackWant).slice(0, 80),
    quantity: Number.isFinite(q) ? Math.min(10, Math.max(1, Math.round(q))) : 1,
    max_total_cents: Number.isFinite(budget) && budget > 0 ? Math.round(Math.min(budget, 1000) * 100) : null,
    priority,
    questions,
  };
}

function rulesMandate(text: string): Mandate {
  const i = parseIntent(text);
  return { want: i.want, quantity: i.qty, max_total_cents: i.budgetCents, priority: i.priority, questions: i.question ? [i.question] : [] };
}

// ------------------------------------------------------------------ agents

export async function runBuyerAgent(db: DB, shopId: string, intentText: string, emit: (e: AgentEvent) => void) {
  const text = intentText.trim().slice(0, 300);
  if (!text) throw new DomainError("VALIDATION", "Tell the agent what to buy.", 422);
  const toolkit = getPayPalToolkit();
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key) {
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
    try {
      await openaiAgent(db, shopId, text, emit, new OpenAI({ apiKey: key }), model, toolkit);
      return;
    } catch (e) {
      // Never echo key fragments back to the page.
      const raw = e instanceof Error ? e.message : String(e);
      const msg = raw.replace(/:?\s*\S*(sk-|\*{4,})\S*/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
      const hint = /401|api key/i.test(raw) ? " Check OPENAI_API_KEY in .env.local (it should start with sk-)." : /model/i.test(raw) ? " Check OPENAI_MODEL." : "";
      emit({ type: "note", text: `OpenAI request failed (${msg}).${hint} Switching to the rule-based agent.` });
    }
  }
  await rulesAgent(db, shopId, text, emit, !!toolkit, !!key);
}

export async function openaiAgent(db: DB, shopId: string, text: string, emit: (e: AgentEvent) => void, client: OpenAI, model: string, toolkit: ReturnType<typeof getPayPalToolkit>) {
  const reasoning = /^(gpt-5|gpt-6|o\d)/.test(model) ? { reasoning_effort: "low" as const } : {};
  // 1) Mandate: what the shopper actually asked for, as numbers the tools can enforce.
  const m = await client.chat.completions.create({
    model,
    ...reasoning,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          [
          "Turn the shopper's sentence into a shopping mandate for their buying agent at a fruit stall. Return JSON:",
          '{"want": what to buy in a few plain words, keeping colour, taste and purpose (e.g. "red fruit", "peaches for jam", "sweet apples for a lunchbox"),',
          '"quantity": integer 1-10 in pounds or boxes (use the number the shopper gave; if none, 1),',
          '"max_total_usd": the total budget as a number, or null if none was given,',
          '"priority": "cheapest" if they mention price, cheap or a budget; "quality" if they say quality matters more than price; otherwise "balanced",',
          '"questions": 0 or 1 question the agent will ask the seller about the product itself, to check it suits the purpose (e.g. "Are they ripe enough for jam?"). Never a question about what the shopper wants.}',
        ].join(" "),
      },
      { role: "user", content: text },
    ],
  });
  let raw: unknown = null;
  try {
    raw = JSON.parse(m.choices[0]?.message?.content?.match(/\{[\s\S]*\}/)?.[0] ?? "null");
  } catch {
    raw = null;
  }
  // If the model's JSON is unusable, read the sentence with the rules but keep shopping with the model.
  const mandate = raw ? normalizeMandate(raw, text) : rulesMandate(text);
  emit({ type: "mode", agent: "openai", model, paypalToolkit: !!toolkit });
  emit({ type: "mandate", mandate });

  // 2) Shop with tools.
  const ctx: Ctx = { db, shopId, mandate, emit, sessionId: null, spoken: 0, finished: null };
  const paypalTools = (toolkit?.getTools() ?? []) as unknown as ChatCompletionTool[];
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "You are a shopper's buying agent at Rosa's fruit stall. You buy FOR the shopper, from Rosa's agent. You already know what the shopper wants (the mandate); never ask the stall what you are looking for.",
        "Follow these steps exactly:",
        "1) Call read_product_feed once.",
        "2) Pick ONE item that best matches the mandate's want (colour, taste, purpose), using the item titles and the owner's words. Tell the shopper which one and why in one short sentence.",
        "3) If the mandate has a question, ask it once with ask_seller about that item. Ask nothing else.",
        "4) Buy mandate.quantity of that item. If priority is quality and the listed total fits the budget, open the session at the listed price (no offer). Otherwise open with an offer: about 65% of list for cheapest, about 85% for balanced, never above the budget per unit.",
        "5) While the stall counters: if the counter fits the budget and is close to your offer, or is marked final, accept it. Otherwise offer again roughly halfway between your last offer and the counter (max 3 offers in total, each below the counter and within budget). If the final counter is over budget, walk_away.",
        "6) When the session is ready_for_payment, call complete_checkout, then tell the shopper in one sentence to approve the payment in PayPal. You can never pay yourself.",
        "Every offer message is one short, friendly sentence to Rosa that quotes the exact offer price, e.g. 'Could you do $1.90 a pound for 3 lb?'.",
        "PayPal Agent Toolkit tools (like get_order) talk to PayPal directly; use them only for an existing PayPal order id.",
        "Between tool calls, keep any text for the shopper to one short sentence.",
      ].join(" "),
    },
    { role: "user", content: `Shopper said: "${text}"\nMandate: ${JSON.stringify(mandate)}` },
  ];
  try {
    await toolLoop(ctx, client, model, messages, paypalTools, toolkit);
  } catch (e) {
    // Don't leave a half-finished deal behind if the model call fails mid-way.
    if (ctx.sessionId && sessionView(db, ctx.sessionId).status === "not_ready_for_payment") cancelSession(db, ctx.sessionId);
    if (ctx.sessionId) ctx.emit({ type: "note", text: "The agent stopped mid-deal; that session was closed. Nothing was charged." });
    throw e;
  }
  finish(ctx);
}

async function toolLoop(ctx: Ctx, client: OpenAI, model: string, messages: ChatCompletionMessageParam[], paypalTools: ChatCompletionTool[], toolkit: ReturnType<typeof getPayPalToolkit>) {
  const { emit } = ctx;
  // Note: chat completions rejects reasoning_effort together with function tools on some models, so it isn't sent here.
  for (let step = 0; step < 14 && !ctx.finished; step++) {
    const r = await client.chat.completions.create({ model, messages, tools: [...STALL_TOOLS, ...paypalTools], parallel_tool_calls: false });
    const msg = r.choices[0]?.message;
    if (!msg) break;
    messages.push(msg as ChatCompletionMessageParam);
    if (msg.content?.trim()) emit({ type: "note", text: msg.content.trim() });
    const calls = (msg.tool_calls ?? []).filter((c): c is ChatCompletionMessageFunctionToolCall => c.type === "function");
    if (!calls.length) break;
    for (const call of calls) {
      let result: unknown;
      if (paypalTools.some((t) => t.type === "function" && t.function.name === call.function.name) && toolkit) {
        const out = await toolkit.handleToolCall(call as never).catch((e: unknown) => ({ content: JSON.stringify({ error: String(e) }) }));
        emit({ type: "trace", trace: { method: "TOOL", path: `PayPal Agent Toolkit · ${call.function.name}`, concept: "PayPal API call made by the agent", result: String((out as { content?: unknown }).content ?? "").slice(0, 140), paypal: true } });
        result = (out as { content?: unknown }).content;
      } else {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* empty */
        }
        try {
          result = await runStallTool(ctx, call.function.name, args);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: typeof result === "string" ? result : JSON.stringify(result) });
    }
  }
}

function finish(ctx: Ctx) {
  const { db, emit } = ctx;
  if (ctx.finished === "approve") {
    const s = sessionView(db, ctx.sessionId!);
    emit({ type: "done", outcome: "approve", sessionId: s.id, orderId: s.order?.id });
  } else if (ctx.finished === "walked" || ctx.sessionId) {
    if (!ctx.finished && ctx.sessionId) cancelSession(db, ctx.sessionId);
    emit({ type: "done", outcome: "walked", sessionId: ctx.sessionId ?? undefined });
  } else emit({ type: "done", outcome: "no_match", message: "The agent didn’t find anything to buy here." });
}

/** Same tools, deterministic strategy. Used when no OpenAI key is set (or OpenAI fails). */
async function rulesAgent(db: DB, shopId: string, text: string, emit: (e: AgentEvent) => void, hasToolkit: boolean, triedOpenAI: boolean) {
  const mandate = rulesMandate(text);
  emit({ type: "mode", agent: "rules", paypalToolkit: hasToolkit, note: triedOpenAI ? undefined : "No OPENAI_API_KEY: rule-based buyer agent" });
  emit({ type: "mandate", mandate });
  const ctx: Ctx = { db, shopId, mandate, emit, sessionId: null, spoken: 0, finished: null };
  const pause = () => new Promise((r) => setTimeout(r, 650));
  const feed = (await runStallTool(ctx, "read_product_feed", {})) as { items: { sku: string; title: string; unit: string; price_per_unit_usd: number; in_stock: number; owner_says: string[] }[] };
  const items = feed.items.map((i) => ({ productId: i.sku, sku: i.sku, shopId, name: i.title, unit: i.unit, listPriceCents: Math.round(i.price_per_unit_usd * 100), available: i.in_stock, facts: i.owner_says }));
  const pick = pickForIntent(items, { want: mandate.want, qty: mandate.quantity, budgetCents: mandate.max_total_cents, priority: mandate.priority, question: null });
  if (!pick) {
    emit({ type: "done", outcome: "no_match", message: "Nothing at this stall fits. The agent moves on." });
    return;
  }
  const it = pick.item;
  emit({ type: "note", text: `Picked ${it.name} at ${usd(it.listPriceCents)}${it.unit === "each" ? "" : `/${it.unit}`}: ${pick.why}.` });
  for (const q of mandate.questions) {
    await pause();
    await runStallTool(ctx, "ask_seller", { sku: it.sku, question: q });
  }
  const list = it.listPriceCents;
  const unitBudget = mandate.max_total_cents ? Math.floor(mandate.max_total_cents / mandate.quantity / 5) * 5 : null;
  const round5 = (c: number) => Math.round(c / 5) * 5;
  const fullPrice = mandate.priority === "quality" && (unitBudget === null || unitBudget >= list);
  let offer = fullPrice ? list : Math.min(round5(list * (mandate.priority === "cheapest" ? 0.6 : 0.85)), unitBudget ?? Infinity);
  await pause();
  const first = (await runStallTool(ctx, "open_checkout_session", { sku: it.sku, quantity: mandate.quantity, ...(fullPrice ? {} : { offer_per_unit_usd: offer / 100 }) })) as { error?: string };
  if (first.error) {
    emit({ type: "note", text: first.error });
    emit({ type: "done", outcome: "walked" });
    return;
  }
  for (let round = 1; round < 6; round++) {
    const s = sessionView(db, ctx.sessionId!);
    if (s.negotiation.status !== "OPEN") break;
    await pause();
    const counter = s.negotiation.seller_counter_per_unit!;
    const final = s.negotiation.seller_counter_is_final || s.negotiation.offers_left <= 0;
    const fits = unitBudget === null || counter <= unitBudget;
    const close = counter - offer <= Math.max(5, round5(list * 0.03));
    if (fits && (final || close || (mandate.priority === "balanced" && round >= 2))) await runStallTool(ctx, "accept_seller_counter", {});
    else if (final) await runStallTool(ctx, "walk_away", { reason: "The stall's price is over the shopper's budget." });
    else {
      offer = Math.min(counter - 5, unitBudget ?? Infinity, Math.max(offer + 5, round5((offer + counter) / 2)));
      await runStallTool(ctx, "propose_price", { offer_per_unit_usd: offer / 100 });
    }
  }
  const s = sessionView(db, ctx.sessionId!);
  if (s.status === "ready_for_payment") {
    await pause();
    await runStallTool(ctx, "complete_checkout", {});
    emit({ type: "note", text: "Price agreed. Please approve the payment in PayPal; I can’t pay on my own." });
    const done = sessionView(db, ctx.sessionId!);
    emit({ type: "done", outcome: "approve", sessionId: done.id, orderId: done.order?.id });
  } else {
    if (s.status !== "canceled") await runStallTool(ctx, "walk_away", { reason: "No deal inside the budget." });
    emit({ type: "done", outcome: "walked", sessionId: s.id });
  }
}
