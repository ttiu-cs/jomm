"use client";
import { useState } from "react";
import { hourLabel, usd } from "@/lib/client/format";

const W = 640;
const PAD = { l: 44, r: 12, t: 12, b: 26 };

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden>
            <line x1="1" y1="4" x2="17" y2="4" stroke={i.color} strokeWidth="2" strokeDasharray={i.dashed ? "4 3" : undefined} strokeLinecap="round" />
          </svg>
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, lines }: { x: number; y: number; lines: string[] }) {
  const left = Math.min(Math.max(x, 70), W - 70);
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-1 text-[11px] leading-tight text-ink shadow-sm"
      style={{ left: `${(left / W) * 100}%`, top: y }}
    >
      {lines.map((l, i) => (
        <div key={i} className={i === 0 ? "font-semibold" : "tnum text-ink-2"}>
          {l}
        </div>
      ))}
    </div>
  );
}

export interface PricePoint {
  hour: number;
  priceCents: number;
}

/** Published price as a step line, projected path (dashed), policy bounds. */
export function PriceChart({
  openHour,
  closeHour,
  published,
  projected,
  floorCents,
  ceilingCents,
  currentHour,
  height = 200,
}: {
  openHour: number;
  closeHour: number;
  published: PricePoint[];
  projected: PricePoint[];
  floorCents: number;
  ceilingCents: number;
  currentHour: number;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const lo = Math.min(floorCents, ...published.map((p) => p.priceCents)) - 50;
  const hi = Math.max(ceilingCents, ...published.map((p) => p.priceCents)) + 50;
  const x = (h: number) => PAD.l + ((h - openHour) / (closeHour - openHour)) * (W - PAD.l - PAD.r);
  const y = (c: number) => PAD.t + (1 - (c - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  // price in effect at each hour
  const priceAt = (h: number) => {
    let p: number | null = null;
    for (const pt of published) if (pt.hour <= h) p = pt.priceCents;
    return p;
  };
  const endHour = Math.min(currentHour, closeHour);
  let d = "";
  for (let h = openHour; h < endHour + (endHour < closeHour ? 1 : 0); h++) {
    const p = priceAt(h);
    if (p === null) continue;
    const x2 = Math.min(h + 1, endHour < closeHour ? endHour + 1 : closeHour);
    d += `${d ? "L" : "M"}${x(h)},${y(p)} L${x(x2)},${y(p)} `;
  }
  let dp = "";
  for (const pt of projected.filter((p) => p.hour > currentHour)) dp += `${dp ? "L" : `M${x(pt.hour)},${y(priceAt(currentHour) ?? pt.priceCents)} L`}${x(pt.hour)},${y(pt.priceCents)} L${x(pt.hour + 1)},${y(pt.priceCents)} `;

  const ticks: number[] = [];
  for (let c = Math.ceil(lo / 100) * 100; c <= hi; c += 100) ticks.push(c);
  const hours = Array.from({ length: closeHour - openHour + 1 }, (_, i) => openHour + i);
  const hp = hover !== null ? (hover <= currentHour ? priceAt(hover) : projected.find((p) => p.hour === hover)?.priceCents ?? null) : null;

  return (
    <div>
      <Legend
        items={[
          { label: "Published price", color: "var(--series-1)" },
          { label: "Optimizer’s projected path (forecast)", color: "var(--series-1)", dashed: true },
          { label: "Policy floor / ceiling", color: "var(--muted)", dashed: true },
        ]}
      />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Price by store hour" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">
                {usd(t).replace(".00", "")}
              </text>
            </g>
          ))}
          {hours.map((h) => (
            <text key={h} x={x(h)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">
              {h}
            </text>
          ))}
          {[floorCents, ceilingCents].map((c, i) => (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(c)} y2={y(c)} stroke="var(--muted)" strokeDasharray="3 4" strokeWidth="1" />
              <text x={W - PAD.r} y={y(c) - 3} textAnchor="end" fontSize="10" fill="var(--muted)">
                {i ? "ceiling" : "floor"} {usd(c)}
              </text>
            </g>
          ))}
          {currentHour < closeHour && <line x1={x(currentHour)} x2={x(currentHour)} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-2)" strokeWidth="1" strokeDasharray="2 2" />}
          <path d={dp} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeDasharray="5 4" opacity="0.7" />
          <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && hp !== null && (
            <>
              <line x1={x(hover + 0.5)} x2={x(hover + 0.5)} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-2)" strokeWidth="1" opacity="0.4" />
              <circle cx={x(hover + 0.5)} cy={y(hp)} r="4.5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
            </>
          )}
          {hours.slice(0, -1).map((h) => (
            <rect key={h} x={x(h)} y={0} width={x(h + 1) - x(h)} height={H} fill="transparent" onMouseEnter={() => setHover(h)} />
          ))}
        </svg>
        {hover !== null && hp !== null && <Tooltip x={x(hover + 0.5)} y={4} lines={[`${hourLabel(hover)}–${hourLabel(hover + 1)}`, `${hover < currentHour ? "Charged" : hover === currentHour ? "Published now" : "Projected"} ${usd(hp)}`]} />}
      </div>
    </div>
  );
}

export interface SalesBar {
  hour: number;
  forecast: number | null;
  simulated: number | null;
  real: number | null;
}

/** Forecast at decision time vs actual units sold, by store hour. */
export function SalesChart({ openHour, closeHour, bars, height = 170 }: { openHour: number; closeHour: number; bars: SalesBar[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const max = Math.max(4, ...bars.map((b) => Math.max(b.forecast ?? 0, (b.simulated ?? 0) + (b.real ?? 0))));
  const n = closeHour - openHour;
  const slot = (W - PAD.l - PAD.r) / n;
  const bw = Math.min(16, slot / 2 - 3);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const base = y(0);
  const step = max > 20 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const bar = (x0: number, v: number, color: string, key: string) =>
    v > 0 ? <path key={key} d={`M${x0},${base} V${y(v) + 3} q0,-3 3,-3 h${bw - 6} q3,0 3,3 V${base} Z`} fill={color} /> : null;
  const hb = bars.find((b) => b.hour === hover);

  return (
    <div>
      <Legend
        items={[
          { label: "Forecast at decision time", color: "var(--series-2)" },
          { label: "Actual sold (simulated + real)", color: "var(--series-1)" },
        ]}
      />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Forecast versus actual sales by hour" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
              <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">
                {t}
              </text>
            </g>
          ))}
          {Array.from({ length: n }, (_, i) => openHour + i).map((h, i) => {
            const b = bars.find((x) => x.hour === h);
            const cx = PAD.l + slot * i + slot / 2;
            return (
              <g key={h}>
                {b && b.forecast !== null && bar(cx - bw - 1, b.forecast, "var(--series-2)", "f")}
                {b && b.simulated !== null && bar(cx + 1, (b.simulated ?? 0) + (b.real ?? 0), "var(--series-1)", "a")}
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">
                  {h}
                </text>
                <rect x={PAD.l + slot * i} y={0} width={slot} height={H} fill={hover === h ? "var(--text)" : "transparent"} opacity={hover === h ? 0.04 : 1} onMouseEnter={() => setHover(h)} />
              </g>
            );
          })}
        </svg>
        {hb && hb.forecast !== null && (
          <Tooltip
            x={PAD.l + slot * (hb.hour - openHour) + slot / 2}
            y={4}
            lines={[
              `${hourLabel(hb.hour)}–${hourLabel(hb.hour + 1)}`,
              `Forecast ${hb.forecast.toFixed(1)} units`,
              `Simulated sold ${hb.simulated ?? 0}`,
              `Real checkout sold ${hb.real ?? 0}`,
            ]}
          />
        )}
      </div>
    </div>
  );
}

/** Two-series hourly price comparison (fixed vs adaptive) for the lab. */
export function CompareChart({ rows, height = 190 }: { rows: { hour: number; fixed: number; adaptive: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!rows.length) return null;
  const H = height;
  const open = rows[0].hour;
  const close = rows[rows.length - 1].hour + 1;
  const vals = rows.flatMap((r) => [r.fixed, r.adaptive]);
  const lo = Math.min(...vals) - 50;
  const hi = Math.max(...vals) + 50;
  const x = (h: number) => PAD.l + ((h - open) / (close - open)) * (W - PAD.l - PAD.r);
  const y = (c: number) => PAD.t + (1 - (c - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = (k: "fixed" | "adaptive") => rows.map((r, i) => `${i ? "L" : "M"}${x(r.hour)},${y(r[k])} L${x(r.hour + 1)},${y(r[k])}`).join(" ");
  const ticks: number[] = [];
  for (let c = Math.ceil(lo / 100) * 100; c <= hi; c += 100) ticks.push(c);
  const hr = rows.find((r) => r.hour === hover);
  return (
    <div>
      <Legend
        items={[
          { label: "Adaptive price", color: "var(--series-1)" },
          { label: "Fixed price", color: "var(--series-2)" },
        ]}
      />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Fixed versus adaptive price by hour" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
              <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">
                {usd(t).replace(".00", "")}
              </text>
            </g>
          ))}
          {rows.map((r) => (
            <text key={r.hour} x={x(r.hour)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">
              {r.hour}
            </text>
          ))}
          <path d={path("fixed")} fill="none" stroke="var(--series-2)" strokeWidth="2" />
          <path d={path("adaptive")} fill="none" stroke="var(--series-1)" strokeWidth="2" />
          {rows.map((r) => (
            <rect key={r.hour} x={x(r.hour)} y={0} width={x(r.hour + 1) - x(r.hour)} height={H} fill="transparent" onMouseEnter={() => setHover(r.hour)} />
          ))}
        </svg>
        {hr && <Tooltip x={x(hr.hour + 0.5)} y={4} lines={[`${hourLabel(hr.hour)}`, `Adaptive ${usd(hr.adaptive)}`, `Fixed ${usd(hr.fixed)}`]} />}
      </div>
    </div>
  );
}
