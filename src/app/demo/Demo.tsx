"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, usd } from "@/lib/client/format";
import { useSeller } from "@/lib/client/seller";
import { Checkout, type OrderView } from "@/components/Checkout";
import { SiteHeader } from "@/components/shells";
import { IconCart, IconCheck, IconLock, IconStore } from "@/components/icons";
import { PERSONAS, ROSA, parseIntent, pickForIntent, type CatalogItemLite, type Intent } from "@/lib/demo/rosa";

// ------------------------------------------------------------------ types

interface Session {
  id: string;
  status: "not_ready_for_payment" | "ready_for_payment" | "in_progress" | "completed" | "canceled";
  line_items: { id: string; item: { title: string; unit: string; quantity: number }; base_amount: number; total: number }[];
  totals: { type: string; amount: number }[];
  negotiation: { status: string; offers_left: number; seller_counter_per_unit: number | null; seller_counter_is_final: boolean; agreed_per_unit: number | null };
  messages: { content: string }[];
  conversation: { role: "buyer" | "seller"; text: string }[];
  order: { id: string; status: string; payment_source: string; paypal_order_id: string | null; capture_id: string | null } | null;
}
interface FeedItem {
  id: string;
  product_id: string;
  shop_id: string;
  title: string;
  facts: string[];
  unit: string;
  price: { amount: number };
  quantity_available: number;
}
type Line = { who: "buyer" | "seller" | "note"; text: string };
type Trace = { method: string; path: string; concept: string; result: string; paypal?: boolean; json?: unknown };
type Outcome = "running" | "approve" | "paid" | "walked" | "error";
interface Run {
  key: number;
  who: string;
  emoji: string;
  says: string;
  intent: Intent;
  lines: Line[];
  trace: Trace[];
  session: Session | null;
  outcome: Outcome;
  orderId: string | null;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round5 = (c: number) => Math.round(c / 5) * 5;

// ------------------------------------------------------------------ page

export default function Demo() {
  const [setup, setSetup] = useState<{ shopId: string; startedAt: string } | null>(null);
  const [taught, setTaught] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const lastSessionId = useRef<string | null>(null);
  const active = runs[runs.length - 1] ?? null;
  const busy = active?.outcome === "running";

  useEffect(() => {
    api<{ shopId: string; startedAt: string }>("/api/demo/rosa", {})
      .then(setSetup)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const patch = useCallback((key: number, f: (r: Run) => Partial<Run>) => setRuns((rs) => rs.map((r) => (r.key === key ? { ...r, ...f(r) } : r))), []);

  const start = async (who: string, emoji: string, says: string, intent: Intent) => {
    if (!setup || busy) return;
    const key = Date.now();
    setRuns((rs) => [...rs, { key, who, emoji, says, intent, lines: [], trace: [], session: null, outcome: "running", orderId: null }]);
    setTimeout(() => boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    const say = (l: Line) => patch(key, (r) => ({ lines: [...r.lines, l] }));
    const trace = (t: Trace) => patch(key, (r) => ({ trace: [...r.trace, t] }));
    const show = (s: Session) => patch(key, () => ({ session: s }));
    try {
      await runAgent({ shopId: setup.shopId, intent, say, trace, show });
      const s = await api<Session>(`/api/agentic/checkout_sessions/${lastSessionId.current}`);
      show(s);
      patch(key, () => (s.order ? { outcome: "approve", orderId: s.order.id } : { outcome: "walked" }));
    } catch (e) {
      patch(key, () => ({ outcome: "error", error: e instanceof Error ? e.message : String(e) }));
    }
  };

  /** The buyer agent: reads the feed, picks by intent, asks, haggles within budget, completes checkout. */
  async function runAgent(o: { shopId: string; intent: Intent; say: (l: Line) => void; trace: (t: Trace) => void; show: (s: Session) => void }) {
    const { intent, say, trace, show } = o;
    say({ who: "note", text: `Intent: ${intent.priority === "cheapest" ? "best price" : intent.priority === "quality" ? "best quality" : "good value"} · ${intent.qty} × “${intent.want}”${intent.budgetCents ? ` · ${usd(intent.budgetCents)} max` : " · no budget limit"}` });
    await sleep(500);

    const feed = await api<{ items: FeedItem[] }>(`/api/agentic/feed?shop=${o.shopId}`);
    trace({ method: "GET", path: "/agentic/feed", concept: "Discovery · product feed (Store Sync style)", result: `${feed.items.length} items, prices and the owner’s words. No lowest prices.`, json: feed.items.map((i) => ({ id: i.id, title: i.title, price: i.price.amount, facts: i.facts })) });
    const items: CatalogItemLite[] = feed.items.map((i) => ({ productId: i.product_id, sku: i.id, shopId: i.shop_id, name: i.title, unit: i.unit, listPriceCents: i.price.amount, available: i.quantity_available, facts: i.facts }));
    const pick = pickForIntent(items, intent);
    await sleep(700);
    if (!pick) {
      say({ who: "note", text: "Nothing at this stall fits. The agent moves on." });
      throw new Error("No matching item");
    }
    const it = pick.item;
    const per = it.unit === "each" ? "" : `/${it.unit}`;
    say({ who: "note", text: `Picked ${it.name} at ${usd(it.listPriceCents)}${per}: ${pick.why}.` });

    if (intent.question) {
      await sleep(700);
      say({ who: "buyer", text: intent.question });
      const a = await api<{ answer: string }>(`/api/shops/${it.shopId}/items/${encodeURIComponent(it.sku)}/ask`, { question: intent.question });
      trace({ method: "POST", path: `/shops/…/items/${it.sku}/ask`, concept: "Product Q&A · answered from Rosa’s own words", result: "Same answer for every agent." });
      await sleep(600);
      say({ who: "seller", text: a.answer });
    }

    const list = it.listPriceCents;
    const unitBudget = intent.budgetCents ? Math.floor(intent.budgetCents / intent.qty / 5) * 5 : null;
    const fullPrice = intent.priority === "quality" && (unitBudget === null || unitBudget >= list);
    await sleep(800);
    const body = { items: [{ id: it.sku, quantity: intent.qty }], ...(fullPrice ? {} : { negotiation: { offer_per_unit: Math.min(round5(list * (intent.priority === "cheapest" ? 0.6 : 0.85)), unitBudget ?? Infinity) } }), buyer: { agent: "demo-buyer-agent" } };
    let offer = body.negotiation?.offer_per_unit ?? list;
    let s = await api<Session>("/api/agentic/checkout_sessions", body);
    lastSessionId.current = s.id;
    trace({ method: "POST", path: "/agentic/checkout_sessions", concept: fullPrice ? "Checkout session · create at the listed price" : "Checkout session · create + price proposal (negotiation extension)", result: sessionSummary(s), json: { request: body, response: pickSession(s) } });
    show(s);
    let round = 1;
    while (s.negotiation.status === "OPEN") {
      await sleep(1100);
      const counter = s.negotiation.seller_counter_per_unit!;
      const final = s.negotiation.seller_counter_is_final || s.negotiation.offers_left <= 0;
      const fits = unitBudget === null || counter <= unitBudget;
      const close = counter - offer <= Math.max(5, round5(list * 0.03));
      let req: unknown;
      let path = `/agentic/checkout_sessions/${short(s.id)}`;
      if (fits && (final || close || (intent.priority === "balanced" && round >= 2))) {
        req = { negotiation: { accept_counter: true } };
        s = await api<Session>(`/api/agentic/checkout_sessions/${s.id}`, req);
      } else if (final) {
        path += "/cancel";
        req = {};
        s = await api<Session>(`/api/agentic/checkout_sessions/${s.id}/cancel`, {});
      } else {
        offer = Math.min(counter - 5, unitBudget ?? Infinity, Math.max(offer + 5, round5((offer + counter) / 2)));
        req = { negotiation: { offer_per_unit: offer } };
        s = await api<Session>(`/api/agentic/checkout_sessions/${s.id}`, req);
      }
      round++;
      trace({ method: "POST", path, concept: path.endsWith("cancel") ? "Checkout session · cancel (over budget, walks away)" : "Checkout session · update (negotiation extension)", result: sessionSummary(s), json: { request: req, response: pickSession(s) } });
      show(s);
    }
    if (s.status === "ready_for_payment") {
      await sleep(800);
      s = await api<Session>(`/api/agentic/checkout_sessions/${s.id}/complete`, {});
      trace({ method: "POST", path: `/agentic/checkout_sessions/${short(s.id)}/complete`, concept: "Checkout session · complete → order for PayPal", result: `Order ${short(s.order!.id)} · ${usd(total(s))} · waiting for the shopper to approve in PayPal`, json: pickSession(s) });
      show(s);
    }
  }

  const onPaid = useCallback(
    (key: number) => (o: OrderView) => {
      const paid = o.order.status === "PAID";
      const sandbox = o.order.payment_source === "PAYPAL_SANDBOX";
      const pp: Trace[] = sandbox
        ? [
            { method: "POST", path: "PayPal /v2/checkout/orders", concept: "PayPal Orders v2 · create (server-side)", result: `PayPal order ${o.payment?.provider_order_id ?? ""}`, paypal: true },
            { method: "—", path: "Shopper approves in PayPal", concept: "Human in the loop: agents can’t pay on their own", result: "Approved", paypal: true },
            { method: "POST", path: "PayPal /v2/checkout/orders/{id}/capture", concept: "PayPal Orders v2 · capture, verified by the server", result: paid ? `COMPLETED · capture ${o.payment?.capture_id ?? ""}` : o.order.status, paypal: true },
          ]
        : [{ method: "—", path: "Practice payment", concept: "PayPal Sandbox keys aren’t set on this server, so PayPal wasn’t called", result: paid ? "Marked paid as PRACTICE (no money moved)" : o.order.status, paypal: true }];
      patch(key, (r) => ({ outcome: paid ? "paid" : r.outcome, trace: [...r.trace, ...pp] }));
    },
    [patch],
  );

  const status = (id: string) => {
    const r = [...runs].reverse().find((x) => x.who === id);
    if (!r) return null;
    return r.outcome === "paid" ? `Paid ${usd(r.session ? total(r.session) : 0)}` : r.outcome === "walked" ? "Walked away" : r.outcome === "approve" ? "Waiting for approval" : r.outcome === "running" ? "Shopping…" : "Error";
  };

  return (
    <div className="bg-canvas">
      <SiteHeader />
      <main className="mx-auto max-w-[1240px] px-5 pb-20 pt-10">
        <header className="text-center">
          <p className="hand text-[26px]">A Tuesday at {ROSA.shopName}</p>
          <h1 className="display mx-auto mt-1 max-w-3xl text-[40px] leading-[1.05] sm:text-[56px]">Shoppers’ agents come to Rosa’s stall. Rosa gets paid.</h1>
          <p className="mx-auto mt-3 max-w-2xl text-[18px] text-label-2">Rosa told her agent about today’s fruit once. Now pick a shopper: each sends an AI agent with a different goal, and Rosa’s agent sells to each one her way, then PayPal pays her.</p>
        </header>

        <Steps taught={taught} anyRun={runs.length > 0} paid={runs.some((r) => r.outcome === "paid")} />
        {err && <p className="mt-4 rounded-2xl bg-red/10 px-4 py-3 text-red">{err}</p>}

        {/* Act 1: Rosa teaches (played back) */}
        <TeachPlayback ready={!!setup} onDone={() => setTaught(true)} />

        {/* Act 2: pick a shopper */}
        <section className={`mt-12 transition-opacity ${taught ? "" : "pointer-events-none opacity-40"}`} aria-label="Shoppers">
          <h2 className="text-[28px] font-semibold">2. Who’s shopping?</h2>
          <p className="text-[17px] text-label-2">Each shopper tells their own agent what they want. Same stall, same rules, different deals.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PERSONAS.map((p) => (
              <button key={p.id} type="button" disabled={busy || !setup} onClick={() => start(p.name, p.emoji, p.says, p.intent)} className="group rounded-[22px] bg-card p-5 text-left shadow-[0_1px_0_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-16px_rgba(60,30,10,0.35)] disabled:opacity-60">
                <div className="flex items-center justify-between">
                  <span className="text-[28px]" aria-hidden>
                    {p.emoji}
                  </span>
                  {status(p.name) && <span className="rounded-full bg-fill px-2.5 py-1 text-[12px] font-medium text-label-2">{status(p.name)}</span>}
                </div>
                <div className="mt-2 text-[17px] font-semibold">{p.name}’s agent</div>
                <p className="mt-1 text-[15px] leading-snug text-label-2">“{p.says}”</p>
                <span className="mt-3 inline-block text-[15px] font-medium text-link group-hover:underline">Send to Rosa’s stall ›</span>
              </button>
            ))}
          </div>
          <form
            className="mt-3 flex items-center gap-2 rounded-full bg-card p-1.5 pl-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) start("You", "🛒", custom.trim(), parseIntent(custom));
            }}
          >
            <input className="min-w-0 flex-1 bg-transparent py-2 text-[17px] outline-none placeholder:text-label-3" placeholder="Or write your own: “4 lb peaches for jam, under $10”" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Your shopping intent" />
            <button type="submit" disabled={busy || !custom.trim() || !setup} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-40">
              <IconCart size={18} /> Send agent
            </button>
          </form>
        </section>

        {/* Act 3: the deal, the interface, and Rosa's phone */}
        <section ref={boardRef} className="mt-10 scroll-mt-20" aria-label="Deal">
          <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr_320px]">
            <Conversation run={active} onPaid={active ? onPaid(active.key) : () => {}} />
            <Interface run={active} />
            {setup ? <RosaPhone shopId={setup.shopId} since={setup.startedAt} runs={runs} /> : <div />}
          </div>
        </section>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ helpers

const short = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…` : id);
const total = (s: Session) => s.totals.find((t) => t.type === "total")?.amount ?? 0;
function sessionSummary(s: Session) {
  const n = s.negotiation;
  const unit = s.line_items[0]?.item.unit ?? "";
  const per = unit === "each" ? "" : `/${unit}`;
  if (s.status === "ready_for_payment") return `ready_for_payment · agreed ${usd(n.agreed_per_unit)}${per} · total ${usd(total(s))}`;
  if (s.status === "canceled") return "canceled · nothing charged";
  return `${s.status} · stall counters ${usd(n.seller_counter_per_unit)}${per}${n.seller_counter_is_final ? " (final)" : ""}`;
}
function pickSession(s: Session) {
  return { id: s.id, status: s.status, line_items: s.line_items, totals: s.totals, payment_provider: "paypal", negotiation: s.negotiation, order: s.order };
}

// ------------------------------------------------------------------ pieces

function Steps({ taught, anyRun, paid }: { taught: boolean; anyRun: boolean; paid: boolean }) {
  const steps = [
    { t: "Rosa teaches her agent", done: taught },
    { t: "Shoppers’ agents arrive", done: anyRun },
    { t: "PayPal pays Rosa", done: paid },
  ];
  return (
    <ol className="mx-auto mt-8 flex max-w-2xl items-center justify-between gap-2 text-[13px] sm:text-[15px]">
      {steps.map((s, i) => (
        <li key={s.t} className="flex flex-1 items-center gap-2">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${s.done ? "bg-green-fill text-white" : "bg-fill text-label-2"}`}>{s.done ? <IconCheck size={16} /> : i + 1}</span>
          <span className={s.done ? "font-medium" : "text-label-2"}>{s.t}</span>
        </li>
      ))}
    </ol>
  );
}

/** Rosa's morning, played back like a short clip (no live camera in the demo). */
function TeachPlayback({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const all = useMemo(() => ROSA.scenes.flatMap((s, si) => s.lines.map((l, li) => ({ si, li, text: l }))), []);
  const [i, setI] = useState(0);
  const finished = i >= all.length;
  const doneRef = useRef(false);
  useEffect(() => {
    if (finished) {
      if (ready && !doneRef.current) {
        doneRef.current = true;
        onDone();
      }
      return;
    }
    const t = setTimeout(() => setI((x) => x + 1), i === 0 ? 900 : 1300);
    return () => clearTimeout(t);
  }, [i, finished, ready, onDone]);
  const cur = all[Math.min(i, all.length - 1)];
  const scene = ROSA.scenes[finished ? ROSA.scenes.length - 1 : cur.si];
  const learnedCount = finished ? ROSA.scenes.length : cur.si + (cur.li === 2 && i > 0 ? 1 : 0);

  return (
    <section className="mt-10 grid items-stretch gap-5 lg:grid-cols-[1fr_1fr]" aria-label="Rosa teaches">
      <div className="grain relative min-h-[380px] overflow-hidden rounded-[28px] bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={scene.photo} src={scene.photo} alt="" className="handheld warm-photo absolute inset-0 h-full w-full object-cover" />
        <span key={`f${scene.photo}`} className="focus-square z-10" aria-hidden />
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
          <span className="frosted-dark flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-white">
            <span className="rec-dot h-2 w-2 rounded-full bg-[#ff3b30]" /> Rosa’s phone · scripted replay
          </span>
        </div>
        {!finished && (
          <button type="button" onClick={() => setI(all.length)} className="frosted-dark absolute right-4 top-4 z-10 rounded-full px-3.5 py-1.5 text-[14px] text-white">
            Skip ›
          </button>
        )}
        <div className="absolute inset-x-4 bottom-4 z-10 space-y-2">
          {all
            .slice(0, Math.min(i, all.length))
            .filter((l) => l.si === (finished ? ROSA.scenes.length - 1 : cur.si))
            .map((l) => (
              <p key={`${l.si}-${l.li}`} className="rise ml-auto w-fit max-w-[88%] rounded-[20px] rounded-br-[6px] bg-brand px-4 py-2.5 text-[16px] leading-snug text-white">
                {l.text}
              </p>
            ))}
        </div>
      </div>

      <div className="flex flex-col rounded-[28px] bg-card p-6">
        <h2 className="text-[28px] font-semibold">1. Rosa teaches her agent</h2>
        <p className="mt-1 text-[16px] text-label-2">She points her phone at each crate and talks, once, before opening. Her agent turns it into listings and private selling rules.</p>
        <ul className="mt-5 space-y-3">
          {ROSA.scenes.map((s, k) => (
            <li key={s.photo} className={`flex items-center gap-3 rounded-[18px] bg-canvas p-3 transition ${k < learnedCount ? "opacity-100" : "opacity-30"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.photo} alt="" className="warm-photo h-14 w-14 rounded-[12px] object-cover" />
              <div className="min-w-0 text-[15px] leading-snug">
                <div className="font-semibold">{s.learned.split(" · ")[0]}</div>
                <div className="text-label-2">
                  {s.learned.split(" · ")[1]} · <IconLock size={12} className="-mt-0.5 inline" /> {s.learned.split(" · ")[2]} · {s.learned.split(" · ")[3]}
                </div>
              </div>
              {k < learnedCount && <IconCheck size={20} className="ml-auto shrink-0 text-green" />}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-5 text-[14px]">
          {finished && ready ? (
            <p className="rise flex items-center gap-2 font-medium text-green">
              <IconCheck size={18} /> Stall is open to shoppers’ agents. The lowest prices stay private.
            </p>
          ) : (
            <p className="text-label-3">{ready ? "Listening…" : "Setting up Rosa’s stall…"}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Conversation({ run, onPaid }: { run: Run | null; onPaid: (o: OrderView) => void }) {
  const end = useRef<HTMLDivElement>(null);
  const msgs: Line[] = run ? [...run.lines, ...(run.session?.conversation ?? []).map((m) => ({ who: m.role, text: m.text }) as Line)] : [];
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [msgs.length]);
  return (
    <div className="flex min-h-[520px] min-w-0 flex-col rounded-[28px] bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3 text-[13px] text-label-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-label text-white">
            <IconStore size={16} />
          </span>
          <span className="truncate">
            <b className="block text-label">Rosa’s agent</b>sells for Rosa
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-right">
          <span>
            <b className="block text-label">{run ? `${run.who}’s agent` : "Shopper’s agent"}</b>buys for {run ? (run.who === "You" ? "you" : run.who) : "a shopper"}
          </span>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-[16px] text-white">{run?.emoji ?? <IconCart size={16} />}</span>
        </span>
      </div>
      {!run && <p className="m-auto max-w-[260px] text-center text-[16px] text-label-3">Pick a shopper above. Their agent will talk to Rosa’s agent here.</p>}
      {run && (
        <div className="flex-1 space-y-2">
          <p className="hand text-[22px]">{run.who === "You" ? "You" : run.who}: “{run.says}”</p>
          {msgs.map((l, i) =>
            l.who === "note" ? (
              <p key={i} className="rise py-1 text-center text-[12px] font-medium text-label-3">
                {l.text}
              </p>
            ) : (
              <div key={i} className={`rise flex ${l.who === "buyer" ? "justify-end" : ""}`}>
                <p className={`max-w-[82%] rounded-[20px] px-4 py-2.5 text-[15px] leading-snug ${l.who === "buyer" ? "rounded-br-[6px] bg-brand text-white" : "rounded-bl-[6px] bg-fill"}`}>{l.text}</p>
              </div>
            ),
          )}
          {run.outcome === "running" && <p className="text-center text-[12px] text-label-3">…</p>}
          {run.outcome === "walked" && <p className="rise rounded-[16px] bg-canvas p-3 text-center text-[15px] text-label-2">No deal. The shopper’s budget was below what Rosa allows, so her agent held the line. Nothing was charged.</p>}
          {run.outcome === "error" && <p className="rounded-[16px] bg-red/10 p-3 text-[15px] text-red">{run.error}</p>}
          {(run.outcome === "approve" || run.outcome === "paid") && run.orderId && run.session && (
            <div className="rise mt-3 rounded-[20px] bg-canvas p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] text-label-2">Agreed total</span>
                <span className="display tnum text-[30px]">{usd(total(run.session))}</span>
              </div>
              {run.outcome === "approve" ? (
                <>
                  <p className="mb-3 mt-1 text-[14px] text-label-2">{run.who === "You" ? "Your" : `${run.who}’s`} agent can’t pay on its own. {run.who === "You" ? "You approve" : `${run.who} approves`} in PayPal:</p>
                  <Checkout orderId={run.orderId} onDone={onPaid} />
                </>
              ) : (
                <p className="mt-2 flex items-center gap-2 text-[16px] font-semibold text-green">
                  <IconCheck size={20} /> Paid. Rosa’s phone just buzzed →
                </p>
              )}
            </div>
          )}
          <div ref={end} />
        </div>
      )}
    </div>
  );
}

function Interface({ run }: { run: Run | null }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex min-h-[520px] min-w-0 flex-col rounded-[28px] bg-[#1f1813] p-5 text-white">
      <div className="mb-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="text-[17px] font-bold text-[#7fb2ff]">PayPal</span> agent interface
        </div>
        <p className="text-[12px] text-white/50">Checkout sessions in the Agentic Commerce Protocol shape (PayPal Agent Ready) + PayPal Orders v2. Tap a call to see the data.</p>
      </div>
      {!run && <p className="m-auto max-w-[260px] text-center text-[14px] text-white/40">Every call between the agents and PayPal shows up here.</p>}
      <ol className="space-y-2">
        {run?.trace.map((t, i) => (
          <li key={i} className="rise">
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className={`w-full rounded-[14px] p-3 text-left ${t.paypal ? "bg-[#0b2a5c]" : "bg-white/[0.06]"} hover:bg-white/10`}>
              <div className="flex min-w-0 items-center gap-2 font-mono text-[12px]">
                <span className={`rounded px-1.5 py-0.5 font-semibold ${t.method === "GET" ? "bg-[#2f7a3b]" : t.method === "POST" ? "bg-[#e0592a]" : "bg-white/20"}`}>{t.method}</span>
                <span className="min-w-0 truncate text-white/90">{t.path}</span>
              </div>
              <div className="mt-1.5 text-[13px] font-medium">{t.concept}</div>
              <div className="text-[12px] text-white/60">{t.result}</div>
              {open === i && t.json !== undefined && <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-black/40 p-2 text-[11px] leading-snug text-white/80">{JSON.stringify(t.json, null, 2)}</pre>}
            </button>
          </li>
        ))}
      </ol>
      {run && (
        <p className="mt-auto flex items-center gap-1.5 pt-4 text-[12px] text-white/50">
          <IconLock size={13} /> Rosa’s lowest prices never leave her side. Amounts are set by the server, never by an agent.
        </p>
      )}
    </div>
  );
}

function RosaPhone({ shopId, since, runs }: { shopId: string; since: string; runs: Run[] }) {
  const { data, refresh } = useSeller(shopId);
  const paidKeys = runs.filter((r) => r.outcome === "paid").length;
  useEffect(() => {
    if (paidKeys) refresh();
  }, [paidKeys, refresh]);
  const sales = (data?.sales ?? []).filter((s) => s.status === "PAID" && s.paid_at && s.paid_at >= since);
  const today = sales.reduce((a, s) => a + s.total_cents, 0);
  const byOrder = new Map(runs.filter((r) => r.orderId).map((r) => [r.orderId!, r]));
  const latest = runs[runs.length - 1];
  const reaction = latest ? rosaSays(latest, data?.items ?? []) : null;
  return (
    <aside className="mx-auto w-full max-w-[340px] lg:sticky lg:top-20 lg:self-start" aria-label="Rosa's phone">
      <div className="rounded-[44px] bg-[#1d1d1f] p-[9px] shadow-[0_30px_60px_-24px_rgba(0,0,0,0.45)]">
        <div className="relative min-h-[520px] overflow-hidden rounded-[36px] bg-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/photos/stall-live.jpg" alt="" className="warm-photo h-28 w-full object-cover" />
          <div className="absolute left-1/2 top-2 h-6 w-20 -translate-x-1/2 rounded-full bg-black" />
          <div className="-mt-6 space-y-3 px-3 pb-4">
            {sales.length > 0 && (
              <ul className="space-y-2">
                {sales.slice(0, 3).map((s, i) => {
                  const r = byOrder.get(s.id);
                  return (
                    <li key={s.id} className={`${i === 0 ? "rise" : ""} frosted flex items-center gap-2.5 rounded-[18px] p-2.5 shadow-sm`}>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#003087] text-[11px] font-bold text-white">PP</span>
                      <span className="min-w-0 text-[13px] leading-snug">
                        <b className="block">PayPal · You received {usd(s.total_cents)}</b>
                        <span className="text-label-2">
                          {s.qty} {s.unit} {s.name.toLowerCase()}
                          {r ? ` · ${r.who === "You" ? "a shopper" : r.who}` : ""}
                          {s.payment_source === "MOCK_CHECKOUT" ? " · practice" : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="rounded-[20px] bg-card p-4">
              <div className="text-[13px] text-label-2">Rosa’s day so far</div>
              <div className="display tnum text-[40px] leading-none">{usd(today)}</div>
              <div className="mt-1 text-[13px] text-label-2">
                {sales.length} sale{sales.length === 1 ? "" : "s"} by her agent{sales.some((s) => s.payment_source === "MOCK_CHECKOUT") ? " · practice payments" : ""}
              </div>
            </div>
            {reaction && <p className="hand rise px-1 text-[22px] leading-tight">Rosa: “{reaction}”</p>}
            <ul className="rounded-[20px] bg-card px-4 py-2">
              {(data?.items ?? []).map((it) => (
                <li key={it.sku} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-0">
                  <span>{it.name}</span>
                  <span className="tnum text-label-2">
                    {it.available} {it.unit} left{it.sellBy === "today" ? " · today" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Rosa's reaction, chosen from what actually happened (scripted lines for the demo). */
function rosaSays(r: Run, items: { name: string; sellBy: string }[]): string | null {
  if (r.outcome === "walked") return "Didn’t go under my price. Good agent.";
  if (r.outcome !== "paid" || !r.session) return null;
  const li = r.session.line_items[0];
  const item = items.find((i) => i.name === li.item.title);
  if (li.total >= li.base_amount) return "Full price! Somebody knows good fruit.";
  if (item?.sellBy === "today") return "Peaches gone before they turned. No waste today!";
  return "A fair deal, and I never looked up from the crates.";
}
