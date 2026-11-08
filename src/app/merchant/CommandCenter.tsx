"use client";
import { useMemo, useState } from "react";
import type { dashboardState } from "@/lib/server/state";
import type { PolicyDraft } from "@/lib/agent/policy-intent";
import { useLive } from "@/lib/client/useLive";
import { api, hourLabel, pct, usd } from "@/lib/client/format";
import { ActionPill, Btn, Card, Code, SourceBadge, Stat, TopNav } from "@/components/ui";
import { PriceChart, SalesChart } from "@/components/charts";

type State = ReturnType<typeof dashboardState>;
type Decision = NonNullable<State["latestDecision"]>;

const REASON_TEXT: Record<string, string> = {
  LUNCH_PEAK: "Lunch peak",
  POST_PEAK_LULL: "Post-peak lull",
  LOW_STOCK: "Low stock vs demand",
  EXPIRY_RISK: "Expiry / waste risk",
  SLOW_SELL_THROUGH: "Slower than forecast",
  FAST_SELL_THROUGH: "Faster than forecast",
  WEATHER_BOOST: "Weather boost",
  WEATHER_DRAG: "Weather drag",
  EVENT_DEMAND: "Local event",
  LATE_DAY_CLEARANCE: "Late-day clearance",
  PRICE_RECOVERY: "Price recovery",
  HOLD_LOW_GAIN: "Gain below threshold",
  GUARDRAIL_HOLD: "Guardrail hold",
  GUARDRAIL_COOLDOWN: "Cooldown",
  GUARDRAIL_STEP_LIMIT: "Step limit",
  GUARDRAIL_FLOOR: "At floor",
  GUARDRAIL_CEILING: "At ceiling",
  GUARDRAIL_HOURS: "Outside allowed hours",
  BELOW_COST_BLOCKED: "Below-cost blocked",
  POLICY_BOUND_ADJUST: "Policy bound adjust",
  LOW_CONFIDENCE: "Low confidence",
  SOLD_OUT: "Sold out",
  STORE_CLOSED: "Store closed",
};

function ReasonChip({ code }: { code: string }) {
  const guard = code.startsWith("GUARDRAIL") || code === "HOLD_LOW_GAIN" || code === "LOW_CONFIDENCE" || code === "BELOW_COST_BLOCKED";
  return (
    <span title={code} className={`rounded-full border px-2 py-0.5 text-[11px] ${guard ? "border-warn/40 text-warn" : "border-line text-ink-2"}`}>
      {REASON_TEXT[code] ?? code}
    </span>
  );
}

export default function CommandCenter() {
  const { data: s, error, refresh } = useLive<State>("/api/state");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [aiText, setAiText] = useState<{ id: string; text: string; source: string } | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ kind: "ok", text: ok });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const chart = useMemo(() => {
    if (!s) return null;
    const published = (s.priceHistory as { price_cents: number; sim_hour: number }[]).map((p) => ({ hour: p.sim_hour, priceCents: p.price_cents }));
    const projected = s.latestDecision?.simHour === s.sim.current_hour ? s.latestDecision.result.projection.pricePath.map((p) => ({ hour: p.hour, priceCents: p.priceCents })) : [];
    const outcomes = s.hourOutcomes as { sim_hour: number; predicted_sales: number; simulated_sales: number; real_sales: number }[];
    const bars = outcomes.map((o) => ({ hour: o.sim_hour, forecast: o.predicted_sales, simulated: o.simulated_sales, real: o.real_sales }));
    return { published, projected, bars };
  }, [s]);

  if (!s) return <div className="p-8 text-ink-2">{error ? `Error: ${error}` : "Loading…"}</div>;
  const d = s.latestDecision;
  const isCurrent = d && d.simDay === s.sim.sim_day && d.simHour === s.sim.current_hour;
  const salesBy = Object.fromEntries((s.salesBySource as { source: string; units: number; revenue: number }[]).map((r) => [r.source, r]));
  const hoursLeft = Math.max(0, s.product.closeHour - s.sim.current_hour);

  return (
    <div>
      <TopNav active="merchant" />
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs text-muted">{s.product.storeName}</div>
            <h1 className="text-2xl font-bold tracking-tight">
              {s.product.name} <span className="font-mono text-sm font-normal text-ink-2">{s.product.sku}</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md border border-line bg-surface px-2 py-1 tnum">
              Store clock (simulated): Day {s.sim.sim_day} · <b>{s.storeOpen ? hourLabel(s.sim.current_hour) : "CLOSED"}</b>
            </span>
            <SourceBadge source={s.paymentMode} />
            <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${s.policy.mode === "autopilot" ? "border-s1/50 text-s1" : "border-line text-ink-2"}`}>
              {s.policy.mode === "autopilot" ? "AUTOPILOT ON" : "APPROVAL MODE"}
            </span>
          </div>
        </div>

        {msg && <div className={`rounded-lg border px-3 py-2 text-sm ${msg.kind === "ok" ? "border-good/40 text-good" : "border-bad/40 text-bad"}`}>{msg.text}</div>}

        <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Published price" value={usd(s.published?.priceCents)} sub={`v${s.published?.version} · by ${s.published?.actor}`} />
          <Stat label="Available stock" value={s.stock.available} sub={`${s.stock.onHand} on hand · ${s.stock.reserved} reserved`} />
          <Stat
            label="Units sold today"
            value={(salesBy.SIMULATED?.units ?? 0) + (salesBy.PAYPAL_SANDBOX?.units ?? 0) + (salesBy.MOCK_CHECKOUT?.units ?? 0)}
            sub={`${salesBy.SIMULATED?.units ?? 0} sim · ${salesBy.PAYPAL_SANDBOX?.units ?? 0} PayPal · ${salesBy.MOCK_CHECKOUT?.units ?? 0} mock`}
          />
          <Stat label="Selling hours left" value={hoursLeft} sub={`sell-by ${hourLabel(s.batch?.sellByHour ?? s.product.closeHour)}`} />
          <Stat label="Model confidence" value={s.confidence} sub={`${s.exposures.total} logged exposures · ${s.exposures.distinctPrices} prices`} />
          <Stat label="Sell-through vs forecast" value={`${s.calibration >= 1 ? "+" : ""}${((s.calibration - 1) * 100).toFixed(0)}%`} sub="state adjustment, not training" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card title="Today’s price" right={<span className="text-xs text-muted">hour of day →</span>}>
              {chart && (
                <PriceChart
                  openHour={s.product.openHour}
                  closeHour={s.product.closeHour}
                  published={chart.published}
                  projected={chart.projected}
                  floorCents={s.effectiveBounds.floorCents}
                  ceilingCents={s.effectiveBounds.ceilingCents}
                  currentHour={s.storeOpen ? s.sim.current_hour : s.product.closeHour}
                />
              )}
            </Card>

            <RecommendationCard
              d={isCurrent ? d : null}
              state={s}
              busy={busy}
              aiText={aiText}
              onRecompute={() => run("recompute", () => api("/api/pricing/recommend", {}))}
              onPublish={(id) => run("publish", () => api("/api/pricing/publish", { decisionId: id }), "Published. Storefront price updated.")}
              onReject={(id) => run("reject", () => api("/api/pricing/reject", { decisionId: id }))}
              onExplain={(id) =>
                run("explain", async () => {
                  const r = await api<{ text: string; source: string }>("/api/pricing/explain", { decisionId: id });
                  setAiText({ id, ...r });
                })
              }
            />

            <Card title="Forecast vs outcome by hour" right={<SourceBadge source="SIMULATED" />}>
              {chart && <SalesChart openHour={s.product.openHour} closeHour={s.product.closeHour} bars={chart.bars} />}
              <p className="mt-2 text-xs text-muted">
                Forecasts are recorded when each hour starts and compared with what happened. Walk-in demand is a seeded simulation; real checkout sales are counted separately.
              </p>
            </Card>

            <DecisionLedger decisions={s.decisions} />
          </div>

          <div className="space-y-4">
            <TimeMachine s={s} busy={busy} run={run} />
            <MerchantAgent s={s} run={run} busy={busy} />
            <PolicyEditor s={s} run={run} busy={busy} />
            <CostCard s={s} />
            <PaymentActivity s={s} />
          </div>
        </div>
      </main>
    </div>
  );
}

function RecommendationCard({
  d,
  state,
  busy,
  aiText,
  onRecompute,
  onPublish,
  onReject,
  onExplain,
}: {
  d: Decision | null;
  state: State;
  busy: string | null;
  aiText: { id: string; text: string; source: string } | null;
  onRecompute: () => void;
  onPublish: (id: string) => void;
  onReject: (id: string) => void;
  onExplain: (id: string) => void;
}) {
  const r = d?.result;
  return (
    <Card
      title="AI price recommendation"
      right={
        <Btn onClick={onRecompute} disabled={!!busy || !state.storeOpen}>
          {busy === "recompute" ? "Computing…" : "Recompute price"}
        </Btn>
      }
    >
      {!r ? (
        <p className="text-sm text-ink-2">{state.storeOpen ? "No recommendation for the current hour yet. Recompute, or advance the clock." : "Store closed for the day."}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <div className="text-xs text-muted">Now → recommended</div>
              <div className="tnum text-3xl font-bold">
                <span className="text-ink-2">{usd(r.currentPriceCents)}</span> <span className="text-muted">→</span> <span className="text-s1">{usd(r.recommendedPriceCents)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <ActionPill action={r.action} />
              <span className="text-xs text-ink-2">
                {d!.status === "PROPOSED" ? (r.requiresApproval ? "Awaiting merchant approval" : "Ready to publish") : d!.status === "PUBLISHED" ? "Published" : d!.status === "HELD" ? "Held — no change" : d!.status}
              </span>
            </div>
            <div className="text-xs text-ink-2">
              Unconstrained optimum {usd(r.unconstrainedBestCents)}
              <br />
              Feasible now {usd(r.bounds.stepLowCents)}–{usd(r.bounds.stepHighCents)}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {r.reasonCodes.map((c) => (
              <ReasonChip key={c} code={c} />
            ))}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            {r.explanation.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tnum">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 font-medium">Rest of day (expected, model)</th>
                  <th className="font-medium">Units sold</th>
                  <th className="font-medium">Unsold</th>
                  <th className="font-medium">Revenue</th>
                  <th className="font-medium">Contribution*</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <td className="py-1 font-semibold text-s1">Follow recommendation</td>
                  <td>{r.projection.expectedUnitsSold.toFixed(1)}</td>
                  <td>{r.projection.expectedUnsold.toFixed(1)}</td>
                  <td>{usd(r.projection.expectedRevenueCents)}</td>
                  <td className="font-semibold">{usd(r.projection.expectedContributionCents)}</td>
                </tr>
                <tr className="border-t border-line">
                  <td className="py-1 text-ink-2">Hold {usd(r.currentPriceCents)} all day</td>
                  <td>{r.holdProjection.expectedUnitsSold.toFixed(1)}</td>
                  <td>{r.holdProjection.expectedUnsold.toFixed(1)}</td>
                  <td>{usd(r.holdProjection.expectedRevenueCents)}</td>
                  <td>{usd(r.holdProjection.expectedContributionCents)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-muted">
              *Contribution = revenue − payment fees − fulfillment − disposal. Production cost is sunk and excluded. Confidence: {r.confidence}. Model {r.modelVersion}.
            </p>
          </div>
          {aiText?.id === d!.id && (
            <div className="rounded-lg border border-line bg-surface-2 p-2 text-sm">
              <span className="mr-1 text-[10px] font-semibold text-muted">{aiText.source === "llm" ? "LLM NARRATION" : "DETERMINISTIC (no LLM key)"}</span>
              {aiText.text}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Btn kind="primary" disabled={d!.status !== "PROPOSED" || !!busy} onClick={() => onPublish(d!.id)}>
              {busy === "publish" ? "Publishing…" : "Approve & publish"}
            </Btn>
            <Btn disabled={d!.status !== "PROPOSED" || !!busy} onClick={() => onReject(d!.id)}>
              Reject
            </Btn>
            <Btn disabled={!!busy} onClick={() => onExplain(d!.id)}>
              {busy === "explain" ? "Explaining…" : "Explain"}
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

function DecisionLedger({ decisions }: { decisions: State["decisions"] }) {
  return (
    <Card title="Decision ledger (today)">
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-xs tnum">
          <thead className="sticky top-0 bg-surface text-muted">
            <tr>
              <th className="py-1 font-medium">Hour</th>
              <th className="px-2 font-medium">Action</th>
              <th className="px-2 font-medium">Price</th>
              <th className="px-2 font-medium">Reasons</th>
              <th className="px-2 font-medium">Status</th>
              <th className="px-2 font-medium">Actor</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr key={d.id} className="border-t border-line align-top">
                <td className="py-1">{hourLabel(d.simHour)}</td>
                <td className="px-2">
                  <ActionPill action={d.result.action} />
                </td>
                <td className="whitespace-nowrap px-2">
                  {usd(d.result.currentPriceCents)} → {usd(d.result.recommendedPriceCents)}
                </td>
                <td className="px-2 text-ink-2">{d.result.reasonCodes.join(", ")}</td>
                <td className="px-2">{d.status}</td>
                <td className="px-2 text-ink-2">{d.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type RunFn = (label: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>;

function TimeMachine({ s, busy, run }: { s: State; busy: string | null; run: RunFn }) {
  const shift = s.sim.demand_multiplier;
  return (
    <Card title="Time machine (demo)" right={<SourceBadge source="SIMULATED" />}>
      <div className="flex flex-wrap gap-2">
        <Btn kind="primary" disabled={!!busy || !s.storeOpen} onClick={() => run("hour", () => api("/api/simulations/step", { mode: "hour" }))}>
          {busy === "hour" ? "Simulating…" : "Advance 1 hour"}
        </Btn>
        <Btn disabled={!!busy || !s.storeOpen} onClick={() => run("close", () => api("/api/simulations/step", { mode: "close" }), "Ran to close.")}>
          Run to close
        </Btn>
        <Btn disabled={!!busy || s.storeOpen} onClick={() => run("newday", () => api("/api/simulations/step", { mode: "newday" }), "New day: 100 fresh units.")}>
          New day
        </Btn>
        <Btn kind="danger" disabled={!!busy} onClick={() => confirm("Reset the whole demo database?") && run("reset", () => api("/api/simulations/reset", {}), "Demo reset.")}>
          Reset demo
        </Btn>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <label className="space-y-1">
          <span className="text-muted">Weather (forecastable)</span>
          <select className="w-full rounded-md border border-line bg-surface px-2 py-1" value={s.sim.weather} onChange={(e) => run("sc", () => api("/api/simulations/scenario", { weather: e.target.value }))}>
            {["sunny", "cloudy", "rainy", "hot"].map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted">Local event</span>
          <select className="w-full rounded-md border border-line bg-surface px-2 py-1" value={s.sim.event} onChange={(e) => run("sc", () => api("/api/simulations/scenario", { event: e.target.value }))}>
            {["none", "office_event", "street_festival"].map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-muted">Unforecasted traffic vs model: {pct(shift)} (the optimizer only sees this via sell-through)</span>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.1}
            value={shift}
            className="w-full"
            onChange={(e) => run("sc", () => api("/api/simulations/scenario", { demandShift: Number(e.target.value) }))}
          />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted">Advancing simulates seeded walk-in shoppers at the published price, then re-runs the optimizer. Autopilot publishes only when policy allows.</p>
    </Card>
  );
}

function MerchantAgent({ s, run, busy }: { s: State; run: RunFn; busy: string | null }) {
  const [text, setText] = useState("Keep price ≥ $4.50; optimize for today’s demand.");
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const keys = draft ? (Object.keys(draft.patch) as (keyof typeof draft.patch)[]) : [];
  const fmt = (k: string, v: unknown) => (typeof v === "number" && k.endsWith("Cents") ? usd(v) : String(v));
  return (
    <Card title="Merchant agent: plain-language policy">
      <textarea className="h-16 w-full rounded-md border border-line bg-surface p-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
      <div className="mt-2 flex gap-2">
        <Btn disabled={!!busy} onClick={() => run("draft", async () => setDraft(await api<PolicyDraft>("/api/pricing/policy/draft", { text })))}>
          Draft policy
        </Btn>
      </div>
      {draft && (
        <div className="mt-3 space-y-2 rounded-lg border border-line bg-surface-2 p-2 text-xs">
          <div className="font-semibold text-muted">DRAFT · parsed by {draft.source === "llm" ? "LLM (validated)" : "deterministic parser"} · needs your confirmation</div>
          {keys.length ? (
            <ul className="tnum">
              {keys.map((k) => (
                <li key={k}>
                  <Code>{k}</Code>: {fmt(k, s.policy[k as keyof typeof s.policy])} → <b>{fmt(k, draft.patch[k])}</b>
                </li>
              ))}
            </ul>
          ) : null}
          {draft.notes.map((n, i) => (
            <p key={i} className="text-ink-2">
              {n}
            </p>
          ))}
          <div className="flex gap-2">
            <Btn
              kind="primary"
              disabled={!keys.length || !!busy}
              onClick={() =>
                run(
                  "apply",
                  async () => {
                    await api("/api/pricing/policy", { patch: draft.patch });
                    if (s.storeOpen) await api("/api/pricing/recommend", {});
                    setDraft(null);
                  },
                  "Policy updated (new version) and price recomputed.",
                )
              }
            >
              Confirm &amp; recompute
            </Btn>
            <Btn onClick={() => setDraft(null)}>Discard</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

function PolicyEditor({ s, run, busy }: { s: State; run: RunFn; busy: string | null }) {
  const p = s.policy;
  const [form, setForm] = useState<Record<string, string>>({});
  const val = (k: string, cur: string) => form[k] ?? cur;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const save = () => {
    const patch: Record<string, number> = {};
    const dollars = ["floorCents", "ceilingCents", "maxStepCents", "minGainCents"];
    for (const [k, v] of Object.entries(form)) patch[k] = dollars.includes(k) ? Math.round(parseFloat(v) * 100) : parseInt(v, 10);
    return run("policy", () => api("/api/pricing/policy", { patch }).then(() => setForm({})), "Policy saved as new version.");
  };
  const num = (k: string, label: string, cur: string, step = "0.25") => (
    <label className="space-y-1">
      <span className="text-muted">{label}</span>
      <input type="number" step={step} className="w-full rounded-md border border-line bg-surface px-2 py-1 tnum" value={val(k, cur)} onChange={set(k)} />
    </label>
  );
  const toggle = (k: keyof typeof p, label: string, v: unknown) => (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={!!p[k]}
        onChange={() => run("policy", () => api("/api/pricing/policy", { patch: { [k]: v } }), "Policy saved as new version.")}
      />
      <span>{label}</span>
    </label>
  );
  return (
    <Card title={`Pricing policy v${s.policyVersion}`}>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {num("floorCents", "Floor ($)", (p.floorCents / 100).toFixed(2))}
        {num("ceilingCents", "Ceiling ($)", (p.ceilingCents / 100).toFixed(2))}
        {num("maxStepCents", "Max change per publish ($)", (p.maxStepCents / 100).toFixed(2))}
        {num("cooldownMinutes", "Cooldown (store min)", String(p.cooldownMinutes), "15")}
        {num("minGainCents", "Min expected gain ($)", (p.minGainCents / 100).toFixed(2))}
        {num("allowedEndHour", "Repricing ends at hour", String(p.allowedEndHour), "1")}
      </div>
      <div className="mt-2 flex gap-2">
        <Btn disabled={!Object.keys(form).length || !!busy} onClick={save}>
          Save limits
        </Btn>
      </div>
      <div className="mt-3 space-y-1.5 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={p.mode === "autopilot"}
            onChange={() => run("policy", () => api("/api/pricing/policy", { patch: { mode: p.mode === "autopilot" ? "approval" : "autopilot" } }), "Mode changed.")}
          />
          <span>Autopilot (publish within policy without approval)</span>
        </label>
        {toggle("allowBelowFullCost", `Allow below full cost (break-even ${usd(s.unitEconomics.fullCostBreakEvenCents)})`, !p.allowBelowFullCost)}
        {toggle("agentPublishAllowed", "Allow authorized seller agents to publish", !p.agentPublishAllowed)}
        {toggle("lowConfidenceRequiresApproval", "Low confidence always requires approval", !p.lowConfidenceRequiresApproval)}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Effective bounds {usd(s.effectiveBounds.floorCents)}–{usd(s.effectiveBounds.ceilingCents)}
        {s.effectiveBounds.belowCostBlocked ? " (floor raised to full-cost break-even)" : ""}. Quotes already issued keep their locked price.
      </p>
    </Card>
  );
}

function CostCard({ s }: { s: State }) {
  const c = s.costs;
  const r = s.todayReport;
  return (
    <Card title="Unit economics">
      <table className="w-full text-xs tnum">
        <tbody>
          {[
            ["Ingredients", c.ingredientsCents, "sunk"],
            ["Packaging", c.packagingCents, "sunk"],
            ["Labor", c.laborCents, "sunk"],
            ["Production cost (accounting COGS)", s.unitEconomics.productionCostCents, "sunk"],
            ["Fulfillment per order", c.fulfillmentPerOrderCents, "incremental"],
            [`Payment fee (${(c.paymentFeeBps / 100).toFixed(2)}% + ${usd(c.paymentFeeFixedCents)})`, null, "incremental"],
            ["Disposal per unsold unit", c.disposalPerUnitCents, "incremental"],
          ].map(([l, v, t]) => (
            <tr key={String(l)} className="border-t border-line">
              <td className="py-1 text-ink-2">{l}</td>
              <td className="text-right">{v === null ? "" : usd(v as number)}</td>
              <td className="pl-2 text-right text-[10px] text-muted">{t}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-xs font-semibold text-muted">Today so far (all sources)</div>
      <table className="w-full text-xs tnum">
        <tbody>
          <tr>
            <td className="text-ink-2">Revenue</td>
            <td className="text-right">{usd(r.revenueCents)}</td>
          </tr>
          <tr>
            <td className="text-ink-2">Contribution (excl. sunk production)</td>
            <td className="text-right">{usd(r.contributionCents)}</td>
          </tr>
          <tr>
            <td className="text-ink-2">Accounting profit after {usd(r.productionCogsCents)} COGS</td>
            <td className="text-right">{usd(r.accountingProfitCents)}</td>
          </tr>
          <tr>
            <td className="text-ink-2">Wasted units</td>
            <td className="text-right">{s.stock.wasted}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-muted">Illustrative assumptions, configurable. Includes simulated sales — see payment activity for verified captures.</p>
    </Card>
  );
}

function PaymentActivity({ s }: { s: State }) {
  const orders = s.orders as {
    id: string;
    status: string;
    payment_source: string;
    total_cents: number;
    created_at: string;
    provider_order_id: string | null;
    capture_id: string | null;
    verified: number | null;
    failure_reason: string | null;
  }[];
  const sim = (s.salesBySource as { source: string; units: number; revenue: number }[]).find((r) => r.source === "SIMULATED");
  return (
    <Card title="Payment activity">
      <div className="mb-2 flex items-center justify-between text-xs">
        <SourceBadge source="SIMULATED" />
        <span className="tnum text-ink-2">
          {sim?.units ?? 0} walk-in units · {usd(sim?.revenue ?? 0)} (synthetic, no payment)
        </span>
      </div>
      {orders.length === 0 && <p className="text-xs text-muted">No storefront orders yet. Open the Storefront to buy a salad.</p>}
      <ul className="space-y-2">
        {orders.map((o) => (
          <li key={o.id} className="rounded-md border border-line p-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <SourceBadge source={o.payment_source} />
              <span className={`font-semibold ${o.status === "PAID" ? "text-good" : o.status === "FAILED" ? "text-bad" : "text-ink-2"}`}>{o.status}</span>
            </div>
            <div className="mt-1 tnum text-ink-2">
              {usd(o.total_cents)} · {new Date(o.created_at).toLocaleTimeString()} {o.failure_reason ? `· ${o.failure_reason}` : ""}
            </div>
            {o.provider_order_id && (
              <div className="mt-0.5 break-all font-mono text-[10px] text-muted">
                PayPal order {o.provider_order_id}
                {o.capture_id ? ` · capture ${o.capture_id}${o.verified ? " (server-verified)" : ""}` : ""}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
