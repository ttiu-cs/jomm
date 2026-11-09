"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, usd } from "@/lib/client/format";
import { useSeller } from "@/lib/client/seller";
import { Checkout, type OrderView } from "@/components/Checkout";
import { SiteHeader } from "@/components/shells";
import { IconCart, IconCheck, IconLock, IconStore } from "@/components/icons";
import { PERSONAS, ROSA } from "@/lib/demo/rosa";
import { prefetch, speak, stopVoice } from "@/lib/client/voice";

// ------------------------------------------------------------------ types

interface Session {
  id: string;
  status: "not_ready_for_payment" | "ready_for_payment" | "in_progress" | "completed" | "canceled";
  line_items: { id: string; product_id: string; item: { title: string; unit: string; quantity: number }; base_amount: number; total: number }[];
  totals: { type: string; amount: number }[];
  negotiation: { status: string; offers_left: number; seller_counter_per_unit: number | null; seller_counter_is_final: boolean; agreed_per_unit: number | null };
  order: { id: string; status: string; payment_source: string; paypal_order_id: string | null; capture_id: string | null } | null;
}
interface Mandate {
  want: string;
  quantity: number;
  max_total_cents: number | null;
  priority: "cheapest" | "quality" | "balanced";
  questions: string[];
}
type Line = { who: "buyer" | "seller" | "note"; text: string };
type Trace = { method: string; path: string; concept: string; result: string; paypal?: boolean; json?: unknown };
type Outcome = "running" | "approve" | "paid" | "walked" | "error";
type AgentEvent =
  | { type: "mode"; agent: "openai" | "rules"; model?: string; paypalToolkit: boolean; note?: string }
  | { type: "mandate"; mandate: Mandate }
  | { type: "note"; text: string }
  | { type: "say"; who: "buyer" | "seller"; text: string }
  | { type: "trace"; trace: Trace }
  | { type: "session"; session: Session }
  | { type: "done"; outcome: "approve" | "walked" | "no_match" | "error"; sessionId?: string; orderId?: string; message?: string };
interface Run {
  key: number;
  who: string;
  emoji: string;
  says: string;
  mode: { agent: "openai" | "rules"; model?: string; paypalToolkit: boolean } | null;
  mandate: Mandate | null;
  lines: Line[];
  trace: Trace[];
  session: Session | null;
  outcome: Outcome;
  orderId: string | null;
  error?: string;
}

// ------------------------------------------------------------------ page

export default function Demo() {
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [taught, setTaught] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [intent, setIntent] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const active = runs[runs.length - 1] ?? null;
  const busy = active?.outcome === "running";

  // Set up (restock) Rosa's stall once per page load, even though dev mode runs effects twice.
  const setupOnce = useRef<Promise<SetupData> | null>(null);
  useEffect(() => {
    setupOnce.current ??= api<SetupData>("/api/demo/rosa", {});
    setupOnce.current
      .then(setSetup)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const markTaught = useCallback(() => setTaught(true), []);
  const patch = useCallback((key: number, f: (r: Run) => Partial<Run>) => setRuns((rs) => rs.map((r) => (r.key === key ? { ...r, ...f(r) } : r))), []);

  /** Sends the shopper's sentence to their buyer agent (server-side) and streams what it does. */
  const send = async (text: string) => {
    const t = text.trim();
    if (!setup || busy || !t) return;
    const persona = PERSONAS.find((p) => p.says === t);
    const key = Date.now();
    setRuns((rs) => [...rs, { key, who: persona?.name ?? "Shopper", emoji: persona?.emoji ?? "🛒", says: t, mode: null, mandate: null, lines: [], trace: [], session: null, outcome: "running", orderId: null }]);
    setTimeout(() => boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    try {
      const res = await fetch("/api/buyer-agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: t, shopId: setup.shopId }) });
      if (!res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const raw = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (raw) apply(key, JSON.parse(raw) as AgentEvent);
        }
      }
    } catch (e) {
      patch(key, () => ({ outcome: "error", error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const apply = (key: number, e: AgentEvent) => {
    if (e.type === "mode") patch(key, () => ({ mode: { agent: e.agent, model: e.model, paypalToolkit: e.paypalToolkit } }));
    else if (e.type === "mandate") patch(key, () => ({ mandate: e.mandate }));
    else if (e.type === "note") patch(key, (r) => ({ lines: [...r.lines, { who: "note", text: e.text }] }));
    else if (e.type === "say") patch(key, (r) => ({ lines: [...r.lines, { who: e.who, text: e.text }] }));
    else if (e.type === "trace") patch(key, (r) => ({ trace: [...r.trace, e.trace] }));
    else if (e.type === "session") patch(key, () => ({ session: e.session }));
    else if (e.type === "done")
      patch(key, (r) => ({
        outcome: e.outcome === "approve" ? "approve" : e.outcome === "error" ? "error" : "walked",
        orderId: e.orderId ?? null,
        error: e.outcome === "error" ? e.message : undefined,
        lines: e.outcome === "no_match" && e.message ? [...r.lines, { who: "note", text: e.message }] : r.lines,
      }));
  };

  const onPaid = useCallback(
    (key: number) => async (o: OrderView) => {
      const paid = o.order.status === "PAID";
      const sandbox = o.order.payment_source === "PAYPAL_SANDBOX";
      if (!paid && ["CREATED", "AWAITING_APPROVAL"].includes(o.order.status)) return; // still open: shopper can retry
      const pp: Trace[] = !paid
        ? [{ method: "—", path: "PayPal payment not completed", concept: `Order ${o.order.status.toLowerCase()}`, result: o.order.failure_reason ?? "Nothing was charged.", paypal: true }]
        : sandbox
        ? [
            { method: "POST", path: "PayPal /v2/checkout/orders", concept: "PayPal Orders v2 · create (server-side, amount from the agreed quote)", result: `PayPal order ${o.payment?.provider_order_id ?? ""}`, paypal: true },
            { method: "—", path: "Shopper approves in PayPal", concept: "Human in the loop: agents can’t pay on their own", result: "Approved", paypal: true },
            { method: "POST", path: "PayPal /v2/checkout/orders/{id}/capture", concept: "PayPal Orders v2 · capture, verified by the server", result: paid ? `COMPLETED · capture ${o.payment?.capture_id ?? ""}` : o.order.status, paypal: true },
          ]
        : [{ method: "—", path: "Practice payment", concept: "PayPal Sandbox keys aren’t set on this server, so PayPal wasn’t called", result: paid ? "Marked paid as PRACTICE (no money moved)" : o.order.status, paypal: true }];
      patch(key, (r) => ({ outcome: paid ? "paid" : r.outcome, trace: [...r.trace, ...pp] }));
      if (!paid) return;
      // The buyer agent double-checks the payment with PayPal itself (PayPal Agent Toolkit get_order).
      const c = await api<{ checked: boolean; message: string; trace: Trace }>("/api/buyer-agent/confirm", { orderId: o.order.id }).catch(() => null);
      if (c) patch(key, (r) => ({ trace: [...r.trace, c.trace], lines: [...r.lines, { who: "note", text: c.checked ? `The shopper’s agent checked with PayPal: ${c.message}` : c.message }] }));
    },
    [patch],
  );

  return (
    <div className="bg-canvas">
      <SiteHeader />
      <main className="mx-auto max-w-[1240px] px-5 pb-20 pt-10">
        <header className="text-center">
          <p className="hand text-[26px]">A Tuesday at {ROSA.shopName}</p>
          <h1 className="display mx-auto mt-1 max-w-3xl text-[40px] leading-[1.05] sm:text-[56px]">A shopper tells their agent what to buy. Rosa gets paid.</h1>
          <p className="mx-auto mt-3 max-w-2xl text-[18px] text-label-2">Rosa taught her stall’s agent this morning. Now a shopper sends their shopping agent with their own goal. The two agents make the deal, and PayPal pays Rosa.</p>
        </header>

        <Steps taught={taught} anyRun={runs.length > 0} paid={runs.some((r) => r.outcome === "paid")} />
        {err && <p className="mt-4 rounded-2xl bg-red/10 px-4 py-3 text-red">{err}</p>}

        {/* Act 1: Rosa teaches (played back) */}
        <TeachPlayback data={setup} onDone={markTaught} />

        {/* Act 2: the shopper's intent */}
        <section className={`mt-12 transition-opacity ${taught ? "" : "pointer-events-none opacity-40"}`} aria-label="Shopper’s agent">
          <h2 className="text-center text-[28px] font-semibold sm:text-[34px]">2. What should the shopper’s agent buy?</h2>
          {setup && (
            <div className="mt-1 flex justify-center">
              <HowRosaTaught data={setup} label="ⓘ What does Rosa’s agent know?" />
            </div>
          )}
          <p className="text-center text-[17px] text-label-2">Type it the way a shopper would say it to a friend: what, how much, what for, and the budget.</p>
          <form
            className="mx-auto mt-6 flex max-w-3xl flex-col gap-2 rounded-[28px] bg-card p-2 shadow-[0_18px_40px_-24px_rgba(60,30,10,0.4)] sm:flex-row sm:items-center sm:rounded-full sm:pl-6"
            onSubmit={(e) => {
              e.preventDefault();
              send(intent);
            }}
          >
            <input
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[19px] outline-none placeholder:text-label-3 focus-visible:outline-none sm:px-0"
              placeholder="e.g. 4 lb peaches for jam, under $10"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              aria-label="What should the shopper’s agent buy?"
            />
            <button type="submit" disabled={busy || !intent.trim() || !setup} className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-brand px-6 py-3.5 text-[17px] font-semibold text-white hover:bg-brand-hover disabled:opacity-40">
              <IconCart size={20} /> {busy ? "Shopping…" : "Send the shopper’s agent"}
            </button>
          </form>
          <div className="mx-auto mt-4 flex max-w-4xl flex-wrap justify-center gap-2">
            <span className="py-1.5 text-[14px] text-label-3">Try:</span>
            {PERSONAS.map((p) => (
              <button key={p.id} type="button" disabled={busy} onClick={() => setIntent(p.says)} className={`rounded-full px-3.5 py-1.5 text-left text-[14px] ${intent === p.says ? "bg-label text-white" : "bg-card text-label-2 hover:text-label"}`}>
                {p.emoji} {p.says}
              </button>
            ))}
          </div>
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

const total = (s: Session) => s.totals.find((t) => t.type === "total")?.amount ?? 0;

// ------------------------------------------------------------------ pieces

function Steps({ taught, anyRun, paid }: { taught: boolean; anyRun: boolean; paid: boolean }) {
  const steps = [
    { t: "Rosa (shop owner) teaches her agent", done: taught },
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

type Check = { key: string; label: string; done: boolean; skipped?: boolean };
interface SetupData {
  shopId: string;
  startedAt: string;
  transcript: { role: "owner" | "agent"; text: string }[];
  checklists: { name: string; checklist: Check[] }[];
  learned: {
    name: string;
    unit: string;
    quantity: number | null;
    listPriceCents: number | null;
    floorPriceCents: number | null;
    sellBy: string | null;
    facts: string[];
    condition: string | null;
    rules: { closeHour?: number | null; marketCents?: number | null; marketNote?: string | null; demand?: string | null; bulk?: { minQty: number; pctOff: number } | false | null; leftover?: string | null };
  }[];
}

/** Which checklist items Rosa's n-th line in a scene answers (line 1: what/how many/facts, 2: prices, 3: deadline, then one rule each). */
function answeredKeys(lineInScene: number, checklist: Check[]): Set<string> {
  const keys = new Set<string>();
  if (lineInScene >= 1) ["quantity", "facts"].forEach((k) => keys.add(k));
  if (lineInScene >= 2) ["price", "floor"].forEach((k) => keys.add(k));
  if (lineInScene >= 3) keys.add("sellBy");
  const rules = checklist.map((c) => c.key).filter((k) => !["quantity", "price", "floor", "facts", "sellBy"].includes(k));
  rules.slice(0, Math.max(0, lineInScene - 3)).forEach((k) => keys.add(k));
  return keys;
}

/** Rosa's morning, played back like a short clip: her words and her agent's questions, through the real teaching pipeline. */
function TeachPlayback({ data, onDone }: { data: SetupData | null; onDone: () => void }) {
  const steps = useMemo(() => {
    if (!data) return [];
    let owner = -1;
    const bounds = ROSA.scenes.map((s) => s.lines.length);
    return data.transcript.map((m) => {
      if (m.role === "owner") owner++;
      let left = Math.max(0, owner);
      let scene = 0;
      while (scene < bounds.length - 1 && left >= bounds[scene]) left -= bounds[scene++];
      return { ...m, scene, lineInScene: left + 1 };
    });
  }, [data]);
  const [i, setI] = useState(0);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const finished = steps.length > 0 && i >= steps.length;
  const doneRef = useRef(false);
  useEffect(() => {
    if (finished && !doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  }, [finished, onDone]);
  useEffect(() => {
    mutedRef.current = muted;
    if (muted) stopVoice();
  }, [muted]);
  // Each line is revealed, then spoken (Rosa's voice / her agent's voice); the next one is preloaded.
  useEffect(() => {
    if (!started || !steps.length) return;
    const ctl = { on: true };
    (async () => {
      for (let k = 0; k < steps.length && ctl.on; k++) {
        const st = steps[k];
        if (steps[k + 1]) prefetch(steps[k + 1].role, steps[k + 1].text);
        setI(k + 1);
        await speak(st.role, st.text, { muted: mutedRef.current });
      }
    })();
    return () => {
      ctl.on = false;
      stopVoice();
    };
  }, [started, steps]);

  const cur = steps[Math.min(i, steps.length - 1)];
  const sceneIdx = finished ? ROSA.scenes.length - 1 : (cur?.scene ?? 0);
  const scene = ROSA.scenes[sceneIdx];
  const visible = steps.slice(0, Math.min(i, steps.length)).filter((s) => s.scene === sceneIdx).slice(-4);
  const lastOwnerLine = (si: number) => {
    if (finished) return 99;
    const shown = steps.slice(0, i).filter((s) => s.scene === si && s.role === "owner");
    return shown.length;
  };

  return (
    <section className="mt-10 grid items-stretch gap-5 lg:grid-cols-[1fr_1fr]" aria-label="Rosa teaches">
      <div className="grain relative min-h-[460px] overflow-hidden rounded-[28px] bg-black">
        <video key={started || finished ? ROSA.clips.scenes[sceneIdx] : ROSA.clips.open} src={started || finished ? ROSA.clips.scenes[sceneIdx] : ROSA.clips.open} poster={scene.photo} autoPlay loop muted playsInline className="warm-photo absolute inset-0 h-full w-full object-cover" />
        <span key={`f${sceneIdx}`} className="focus-square z-10" aria-hidden />
        {!started && !finished && data && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/35">
            <button type="button" onClick={() => setStarted(true)} className="flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[17px] font-semibold text-label shadow-lg">
              ▶ Play Rosa’s video
            </button>
          </div>
        )}
        {started && !finished && (
          <button type="button" onClick={() => setMuted((m) => !m)} className="frosted-dark absolute right-[92px] top-4 z-10 rounded-full px-3 py-1.5 text-[14px] text-white" aria-label={muted ? "Sound on" : "Sound off"}>
            {muted ? "🔇" : "🔊"}
          </button>
        )}
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
          <span className="frosted-dark flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-white">
            <span className="rec-dot h-2 w-2 rounded-full bg-[#ff3b30]" /> Rosa’s phone · scripted replay
          </span>
        </div>
        {!finished && steps.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setStarted(false);
              setI(steps.length);
            }}
            className="frosted-dark absolute right-4 top-4 z-10 rounded-full px-3.5 py-1.5 text-[14px] text-white"
          >
            Skip ›
          </button>
        )}
        <div className="absolute inset-x-4 bottom-4 z-10 space-y-2">
          {!data && <p className="frosted-dark w-fit rounded-full px-4 py-2 text-[14px] text-white">Setting up Rosa’s stall…</p>}
          {visible.map((m, k) =>
            m.role === "owner" ? (
              <p key={`${m.scene}-${k}-${m.text}`} className="rise ml-auto w-fit max-w-[85%] rounded-[20px] rounded-br-[6px] bg-brand px-4 py-2.5 text-[15px] leading-snug text-white">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/70">Rosa · Shop owner</span>
                {m.text}
              </p>
            ) : (
              <p key={`${m.scene}-${k}-${m.text}`} className="rise frosted flex w-fit max-w-[88%] items-start gap-2 rounded-[20px] rounded-bl-[6px] px-3.5 py-2.5 text-[15px] leading-snug text-label">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-label text-white">
                  <IconStore size={11} />
                </span>
                <span>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-label-3">Rosa’s agent (AI)</span>
                  {m.text}
                </span>
              </p>
            ),
          )}
        </div>
      </div>

      <div className="flex flex-col rounded-[28px] bg-card p-6">
        <h2 className="text-[28px] font-semibold">1. Rosa teaches her agent</h2>
        <p className="mt-1 text-[16px] text-label-2">Her agent keeps asking until it has what it needs to haggle like Rosa would: prices elsewhere, closing time, bulk deals, what happens to leftovers, how fast things sell.</p>
        <ul className="mt-4 space-y-3">
          {ROSA.scenes.map((s, si) => {
            const cl = data?.checklists[si]?.checklist ?? [];
            const answered = answeredKeys(lastOwnerLine(si), cl);
            const done = cl.filter((c) => answered.has(c.key) && c.done).length;
            return (
              <li key={s.photo} className={`rounded-[18px] bg-canvas p-3 transition ${si <= sceneIdx || finished ? "opacity-100" : "opacity-35"}`}>
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.photo} alt="" className="warm-photo h-12 w-12 rounded-[12px] object-cover" />
                  <div className="min-w-0 flex-1 text-[15px] leading-snug">
                    <div className="font-semibold">{s.learned.split(" · ")[0]}</div>
                    <div className="text-label-2">
                      {s.learned.split(" · ")[1]} · <IconLock size={12} className="-mt-0.5 inline" /> {s.learned.split(" · ")[2]}
                    </div>
                  </div>
                  <span className={`tnum shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${cl.length && done === cl.length ? "bg-green-fill/15 text-green" : "bg-fill text-label-2"}`}>
                    {done}/{cl.length || "–"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {cl.map((c) => {
                    const on = answered.has(c.key) && c.done;
                    return (
                      <span key={c.key} className={`rounded-full px-2 py-0.5 text-[11px] ${on ? "bg-label text-white" : "bg-fill text-label-3"}`}>
                        {on ? "✓ " : ""}
                        {c.label}
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto pt-4 text-[14px]">
          {finished ? (
            <p className="rise flex items-center gap-2 font-medium text-green">
              <IconCheck size={18} /> Nothing missing. Stall is open to shoppers’ agents; the lowest prices stay private.
            </p>
          ) : (
            <p className="text-label-3">{data ? "Listening…" : "Setting up Rosa’s stall…"}</p>
          )}
          {data && <HowRosaTaught data={data} />}
        </div>
      </div>
    </section>
  );
}

const SELL_BY_TXT: Record<string, string> = { today: "Must sell today", this_week: "This week", no_rush: "No rush" };
const hour12 = (h: number) => `${((h + 11) % 12) + 1} ${h >= 12 ? "pm" : "am"}`;

/** Shows exactly what Rosa said and what her agent took from it, so the demo isn't a black box. */
function HowRosaTaught({ data, label = "ⓘ How Rosa taught her agent" }: { data: SetupData; label?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"learned" | "conversation">("learned");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[15px] font-medium text-link hover:underline">
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="How Rosa taught her agent" onClick={() => setOpen(false)}>
          <div className="max-h-[88vh] w-full max-w-[760px] overflow-y-auto rounded-[28px] bg-card p-6 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[24px] font-semibold">How Rosa taught her agent</h3>
                <p className="text-[15px] text-label-2">One short conversation this morning, pointing her phone at each crate. Everything the agent sells and haggles with comes from this.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-fill px-3 py-1.5 text-[14px]">
                Close
              </button>
            </div>
            <div className="mt-4 inline-flex rounded-full bg-fill p-1 text-[14px]">
              {(["learned", "conversation"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 ${tab === t ? "bg-card font-semibold shadow-sm" : "text-label-2"}`}>
                  {t === "learned" ? "What the agent knows" : "The conversation"}
                </button>
              ))}
            </div>
            {tab === "learned" ? (
              <div className="mt-4 space-y-3">
                {data.learned.map((it) => {
                  const r = it.rules;
                  const per = it.unit === "each" ? "" : `/${it.unit}`;
                  const rows: [string, string, boolean?][] = [
                    ["Stock", `${it.quantity ?? "?"} ${it.unit}`],
                    ["Listed price", `${usd(it.listPriceCents)}${per}`],
                    ["Lowest price", `${usd(it.floorPriceCents)}${per}`, true],
                    ["Sell by", SELL_BY_TXT[it.sellBy ?? ""] ?? "—"],
                    ...(typeof r.closeHour === "number" ? ([["Closing time", hour12(r.closeHour), true]] as [string, string, boolean][]) : []),
                    ["Price elsewhere", typeof r.marketCents === "number" ? `${usd(r.marketCents)}${per} at ${(r.marketNote ?? "other shops").replace(/^the /, "the ")}` : "—", true],
                    ["Bulk deal", r.bulk ? `${r.bulk.pctOff}% off ${r.bulk.minQty}+ ${it.unit}` : r.bulk === false ? "None" : "—", true],
                    ["If unsold", r.leftover === "waste" ? "Thrown away" : r.leftover === "use" ? "She uses them" : r.leftover === "keep" ? "They keep" : "—", true],
                    ["How fast it sells", r.demand === "high" ? "Sells out" : r.demand === "slow" ? "Slow this week" : r.demand === "normal" ? "Steady" : "—", true],
                    ["Buyers are told", [...it.facts, ...(it.condition ? [it.condition] : [])].join(" · ") || "—"],
                  ];
                  return (
                    <div key={it.name} className="rounded-[18px] bg-canvas p-4">
                      <div className="text-[17px] font-semibold">{it.name}</div>
                      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[14px] sm:grid-cols-2">
                        {rows.map(([k, v, priv]) => (
                          <div key={k} className="flex justify-between gap-3 border-b border-line py-1">
                            <dt className="flex items-center gap-1 text-label-2">
                              {priv && <IconLock size={11} />}
                              {k}
                            </dt>
                            <dd className="text-right">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                })}
                <p className="flex items-center gap-1.5 text-[13px] text-label-3">
                  <IconLock size={12} /> Private to Rosa’s agent. Shoppers and their agents only see the listing and what buyers are told.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {data.transcript.map((m, k) => (
                  <div key={k} className={`flex ${m.role === "owner" ? "justify-end" : ""}`}>
                    <p className={`max-w-[80%] rounded-[18px] px-3.5 py-2 text-[14px] leading-snug ${m.role === "owner" ? "rounded-br-[6px] bg-brand text-white" : "rounded-bl-[6px] bg-fill"}`}>
                      <span className={`block text-[11px] font-semibold ${m.role === "owner" ? "text-white/70" : "text-label-3"}`}>{m.role === "owner" ? "Rosa" : "Her agent"}</span>
                      {m.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Conversation({ run, onPaid }: { run: Run | null; onPaid: (o: OrderView) => void }) {
  const end = useRef<HTMLDivElement>(null);
  const msgs: Line[] = run?.lines ?? [];
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
            <b className="block text-label">Rosa’s agent (AI)</b>sells for Rosa, the shop owner
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-right">
          <span>
            <b className="block text-label">{run && run.who !== "Shopper" ? `${run.who}’s agent` : "Shopper’s agent"}</b>buys for {run && run.who !== "Shopper" ? run.who : "the shopper"}
          </span>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-[16px] text-white">{run?.emoji ?? <IconCart size={16} />}</span>
        </span>
      </div>
      {!run && <p className="m-auto max-w-[260px] text-center text-[16px] text-label-3">Pick a shopper above. Their agent will talk to Rosa’s agent here.</p>}
      {run && (
        <div className="flex-1 space-y-2">
          <p className="hand text-[22px]">{run.who}: “{run.says}”</p>
          {run.mode && (
            <p className="text-center text-[11px] font-medium uppercase tracking-wide text-label-3">
              {run.mode.agent === "openai" ? `OpenAI agent · ${run.mode.model}` : "Rule-based agent (no OpenAI key)"} · {run.mode.paypalToolkit ? "PayPal Agent Toolkit on" : "PayPal Agent Toolkit off (no Sandbox keys)"}
            </p>
          )}
          {run.mandate && (
            <div className="rise rounded-[16px] border border-line bg-canvas px-4 py-3 text-[14px]">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-label-3">Shopper’s mandate</div>
              <div className="mt-1">
                {run.mandate.quantity} × {run.mandate.want} · {run.mandate.priority === "cheapest" ? "best price" : run.mandate.priority === "quality" ? "best quality" : "good value"} ·{" "}
                <b>{run.mandate.max_total_cents === null ? "no budget limit" : `never over ${usd(run.mandate.max_total_cents)}`}</b>
              </div>
              <div className="mt-0.5 text-[12px] text-label-3">Enforced by the server: an offer or deal over budget is refused before it reaches the stall.</div>
            </div>
          )}
          {msgs.map((l, i) =>
            l.who === "note" ? (
              <p key={i} className="rise break-words py-1 text-center text-[12px] font-medium text-label-3 [overflow-wrap:anywhere]">
                {l.text}
              </p>
            ) : (
              <div key={i} className={`rise flex ${l.who === "buyer" ? "justify-end" : ""}`}>
                <p className={`max-w-[82%] rounded-[20px] px-4 py-2.5 text-[15px] leading-snug ${l.who === "buyer" ? "rounded-br-[6px] bg-brand text-white" : "rounded-bl-[6px] bg-fill"}`}>{l.text}</p>
              </div>
            ),
          )}
          {run.outcome === "running" && <p className="text-center text-[12px] text-label-3">…</p>}
          {run.outcome === "walked" && run.session && <p className="rise rounded-[16px] bg-canvas p-3 text-center text-[15px] text-label-2">No deal. The shopper’s budget was below what Rosa allows, so her agent held the line. Nothing was charged.</p>}
          {run.outcome === "error" && <p className="rounded-[16px] bg-red/10 p-3 text-[15px] text-red">{run.error}</p>}
          {(run.outcome === "approve" || run.outcome === "paid") && run.orderId && run.session && (
            <div className="rise mt-3 rounded-[20px] bg-canvas p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] text-label-2">Agreed total</span>
                <span className="display tnum text-[30px]">{usd(total(run.session))}</span>
              </div>
              {run.outcome === "approve" ? (
                <>
                  <p className="mb-3 mt-1 text-[14px] text-label-2">{run.who === "Shopper" ? "The shopper’s" : `${run.who}’s`} agent can’t pay on its own. {run.who === "Shopper" ? "The shopper approves" : `${run.who} approves`} in PayPal:</p>
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
          <div className={`${sales.length ? "-mt-6" : "pt-3"} space-y-3 px-3 pb-4`}>
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
                          {r ? ` · ${r.who === "Shopper" ? "a shopper" : r.who}` : ""}
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
            {latest?.session && <WhyPanel run={latest} />}
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

/** Seller-private: why Rosa's agent was willing to go as low as it did, from what Rosa taught it. */
function WhyPanel({ run }: { run: Run }) {
  const li = run.session!.line_items[0];
  const [v, setV] = useState<{ walkAwayCents: number; why: { factor: string; effect: number }[] | null; pressure: number | null } | null>(null);
  useEffect(() => {
    api<{ walkAwayCents: number; why: { factor: string; effect: number }[] | null; pressure: number | null }>(`/api/seller/negotiation-view?productId=${li.product_id}&qty=${li.item.quantity}`)
      .then(setV)
      .catch(() => setV(null));
  }, [li.product_id, li.item.quantity, run.outcome]);
  if (!v?.why) return null;
  return (
    <div className="rounded-[20px] bg-card p-4 text-[12px]">
      <div className="flex items-center gap-1.5 font-semibold text-label">
        <IconLock size={12} /> Why my agent priced {li.item.title.toLowerCase()} this way
      </div>
      <div className="mt-1 text-label-2">
        Willing to go to <b className="tnum text-label">{usd(v.walkAwayCents)}</b> ({Math.round((v.pressure ?? 0) * 100)}% of the way to my lowest)
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {v.why.map((w) => (
          <li key={w.factor} className="flex justify-between gap-2">
            <span className="text-label-2">{w.factor}</span>
            <span className={`tnum shrink-0 font-semibold ${w.effect > 0 ? "text-brand" : w.effect < 0 ? "text-green" : "text-label-3"}`}>{w.effect > 0 ? `+${Math.round(w.effect * 100)}` : w.effect < 0 ? `−${Math.round(-w.effect * 100)}` : "·"}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 text-label-3">Only Rosa sees this. + means more flexible, − means firmer.</div>
    </div>
  );
}

/** Rosa's reaction, chosen from what actually happened (scripted lines for the demo). */
function rosaSays(r: Run, items: { name: string; sellBy: string }[]): string | null {
  if (r.outcome === "walked" && r.session) return "Didn’t go under my price. Good agent.";
  if (r.outcome !== "paid" || !r.session) return null;
  const li = r.session.line_items[0];
  const item = items.find((i) => i.name === li.item.title);
  if (li.total >= li.base_amount) return "Full price! Somebody knows good fruit.";
  if (item?.sellBy === "today") return "Peaches gone before they turned. No waste today!";
  return "A fair deal, and I never looked up from the crates.";
}
