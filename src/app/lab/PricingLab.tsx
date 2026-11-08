"use client";
import { useCallback, useEffect, useState } from "react";
import type { runLab } from "@/lib/server/lab";
import { api, hourLabel, usd } from "@/lib/client/format";
import { Btn, Card, SourceBadge, TopNav } from "@/components/ui";
import { CompareChart } from "@/components/charts";

type Lab = ReturnType<typeof runLab>;

const DEFAULTS = { weather: "cloudy", event: "none", fixedPrice: "700", stock: "100", seeds: "20", seed: "42", truthSensitivity: "1", truthDemand: "1" };

export default function PricingLab() {
  const [p, setP] = useState(DEFAULTS);
  const [lab, setLab] = useState<Lab | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (params: typeof DEFAULTS) => {
    setLoading(true);
    setErr(null);
    try {
      setLab(await api<Lab>(`/api/simulations/comparison?${new URLSearchParams(params)}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(DEFAULTS), 0);
    return () => clearTimeout(t);
  }, [load]);

  const field = (k: keyof typeof DEFAULTS, label: string, opts?: string[], step?: string) => (
    <label className="space-y-1 text-xs">
      <span className="text-muted">{label}</span>
      {opts ? (
        <select className="w-full rounded-md border border-line bg-surface px-2 py-1" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })}>
          {opts.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input type="number" step={step} className="w-full rounded-md border border-line bg-surface px-2 py-1 tnum" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
      )}
    </label>
  );

  const rows = lab ? lab.day.fixed.hours.map((h, i) => ({ hour: h.hour, fixed: h.priceCents, adaptive: lab.day.adaptive.hours[i].priceCents })) : [];
  const metrics: [string, keyof Lab["summary"]["fixed"], boolean][] = [
    ["Revenue", "revenueCents", true],
    ["Contribution (excl. sunk production)", "contributionCents", true],
    ["Accounting profit (after COGS)", "accountingProfitCents", true],
    ["Units sold", "unitsSold", false],
    ["Unsold / wasted units", "unsold", false],
    ["Disposal cost", "disposalCents", true],
  ];

  return (
    <div>
      <TopNav active="lab" />
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Pricing Lab: fixed vs adaptive</h1>
          <SourceBadge source="SIMULATED" />
        </div>
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          Synthetic simulation only, not observed business lift. Both strategies see the same seeded shoppers, each with the same private willingness-to-buy draw (common random numbers), under the documented demand model.
        </div>
        <Card title="Assumptions">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {field("weather", "Weather", ["sunny", "cloudy", "rainy", "hot"])}
            {field("event", "Local event", ["none", "office_event", "street_festival"])}
            {field("fixedPrice", "Fixed price (¢)", undefined, "25")}
            {field("stock", "Opening stock", undefined, "10")}
            {field("seed", "Base seed")}
            {field("seeds", "Days (seeds)")}
            {field("truthSensitivity", "True price sensitivity ×", undefined, "0.1")}
            {field("truthDemand", "True traffic ×", undefined, "0.1")}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Btn kind="primary" disabled={loading} onClick={() => load(p)}>
              {loading ? "Simulating…" : "Run simulation"}
            </Btn>
            <span className="text-xs text-muted">“True ×” values bend the simulated world away from what the optimizer believes, to test misspecification.</span>
          </div>
          {err && <p className="mt-2 text-sm text-bad">{err}</p>}
        </Card>

        {lab && (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title={`Average over ${lab.summary.seeds} simulated days`}>
                <table className="w-full text-sm tnum">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1 text-left font-medium">Metric</th>
                      <th className="text-right font-medium text-s2">Fixed {usd(lab.assumptions.fixedPriceCents)}</th>
                      <th className="text-right font-medium text-s1">Adaptive</th>
                      <th className="text-right font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map(([label, k, money]) => {
                      const f = lab.summary.fixed[k];
                      const a = lab.summary.adaptive[k];
                      return (
                        <tr key={k} className="border-t border-line">
                          <td className="py-1 text-ink-2">{label}</td>
                          <td className="text-right">{money ? usd(f) : f.toFixed(1)}</td>
                          <td className="text-right">{money ? usd(a) : a.toFixed(1)}</td>
                          <td className="text-right text-ink-2">{money ? usd(a - f) : (a - f).toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-sm">
                  Contribution lift: <b className="tnum">{lab.summary.contributionLiftPct.toFixed(1)}%</b> · adaptive better on{" "}
                  <b className="tnum">{(lab.summary.adaptiveWinsShare * 100).toFixed(0)}%</b> of days.
                </p>
              </Card>
              <Card title={`One simulated day (seed ${lab.assumptions.seed}): price path`}>
                <CompareChart rows={rows} />
              </Card>
            </div>

            <Card title="Hour by hour (single seeded day)">
              <div className="overflow-x-auto">
                <table className="w-full text-xs tnum">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 text-left font-medium">Hour</th>
                      <th className="text-right font-medium">Shoppers</th>
                      <th className="text-right font-medium text-s2">Fixed sold</th>
                      <th className="text-right font-medium text-s2">Fixed stock</th>
                      <th className="text-right font-medium text-s1">Adaptive price</th>
                      <th className="text-right font-medium text-s1">Adaptive sold</th>
                      <th className="text-right font-medium text-s1">Adaptive stock</th>
                      <th className="pl-3 text-left font-medium">Adaptive reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lab.day.fixed.hours.map((f, i) => {
                      const a = lab.day.adaptive.hours[i];
                      return (
                        <tr key={f.hour} className="border-t border-line">
                          <td className="py-1">{hourLabel(f.hour)}</td>
                          <td className="text-right">{f.shoppers}</td>
                          <td className="text-right">
                            {f.sold}
                            {f.lostToStockout ? ` (+${f.lostToStockout} lost)` : ""}
                          </td>
                          <td className="text-right">{f.stockAfter}</td>
                          <td className="text-right">{usd(a.priceCents)}</td>
                          <td className="text-right">
                            {a.sold}
                            {a.lostToStockout ? ` (+${a.lostToStockout} lost)` : ""}
                          </td>
                          <td className="text-right">{a.stockAfter}</td>
                          <td className="pl-3 text-ink-2">{a.reasonCodes?.join(", ")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Sensitivity: what if the model is wrong?">
              <table className="w-full text-sm tnum">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1 text-left font-medium">Simulated world vs optimizer belief</th>
                    <th className="text-right font-medium">Fixed contribution</th>
                    <th className="text-right font-medium">Adaptive contribution</th>
                    <th className="text-right font-medium">Lift</th>
                    <th className="text-right font-medium">Adaptive wins</th>
                  </tr>
                </thead>
                <tbody>
                  {lab.sensitivity.map((r) => (
                    <tr key={r.label} className="border-t border-line">
                      <td className="py-1 text-ink-2">{r.label}</td>
                      <td className="text-right">{usd(r.summary.fixed.contributionCents)}</td>
                      <td className="text-right">{usd(r.summary.adaptive.contributionCents)}</td>
                      <td className={`text-right font-semibold ${r.summary.contributionLiftPct < 0 ? "text-bad" : ""}`}>{r.summary.contributionLiftPct.toFixed(1)}%</td>
                      <td className="text-right">{(r.summary.adaptiveWinsShare * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">
                Adaptive pricing can lose when the demand model is wrong (e.g. shoppers more price-sensitive than assumed). This is why the product logs exposures, reports confidence and keeps merchant guardrails.
              </p>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
