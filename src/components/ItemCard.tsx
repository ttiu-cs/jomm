import { IconCheck, IconLock } from "./icons";

export interface TagData {
  name: string;
  unit: string;
  quantity: number | null;
  listPriceCents: number | null;
  floorPriceCents: number | null;
  sellBy: "today" | "this_week" | "no_rush" | null;
  facts: string[];
  condition?: string | null;
  photo?: string | null;
}

const money = (c: number | null) => (c === null ? null : `$${(c / 100).toFixed(2)}`);
const SELL_BY: Record<string, string> = { today: "Sell today", this_week: "Sell this week", no_rush: "No rush" };

export function tagSteps(t: TagData) {
  return [
    { key: "Quantity", done: t.quantity !== null },
    { key: "Price", done: t.listPriceCents !== null },
    { key: "Lowest price", done: t.floorPriceCents !== null },
    { key: "Details", done: t.facts.length > 0 || !!t.condition },
    { key: "Deadline", done: t.sellBy !== null },
  ];
}

/**
 * A product as an iOS-style card. `showPrivate` adds the owner-only lowest price and the
 * "still needed" checklist; buyer-facing screens leave it off.
 */
export function ItemCard({ t, active, showPrivate = true, showSteps = true, className = "" }: { t: TagData; active?: boolean; showPrivate?: boolean; showSteps?: boolean; className?: string }) {
  const steps = tagSteps(t);
  const missing = steps.filter((s) => !s.done);
  const per = t.unit === "each" ? "" : ` / ${t.unit}`;
  return (
    <div className={`rounded-[22px] bg-card p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ${active ? "ring-2 ring-brand" : ""} ${className}`}>
      <div className="flex gap-3.5">
        {t.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.photo} alt="" className="warm-photo h-[72px] w-[72px] shrink-0 rounded-[14px] object-cover" />
        ) : (
          <div className="h-[72px] w-[72px] shrink-0 rounded-[14px] bg-fill" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="truncate text-[17px] font-semibold">{t.name}</div>
            {t.sellBy === "today" && <span className="shrink-0 rounded-full bg-red/10 px-2 py-0.5 text-[12px] font-semibold text-red">Sell today</span>}
          </div>
          <div className="tnum mt-0.5 text-[22px] font-semibold leading-tight">
            {money(t.listPriceCents) ?? <span className="text-label-3">Price?</span>}
            <span className="text-[15px] font-normal text-label-2">{t.listPriceCents !== null ? per : ""}</span>
          </div>
          <div className="mt-0.5 text-[14px] text-label-2">
            {t.quantity !== null ? `${t.quantity} ${t.unit === "each" ? "in stock" : `${t.unit} in stock`}` : "Quantity not set"}
            {t.sellBy && t.sellBy !== "today" ? ` · ${SELL_BY[t.sellBy]}` : ""}
          </div>
        </div>
      </div>
      {t.facts.length > 0 && <p className="hand mt-3 line-clamp-2 text-[21px]">“{t.facts.join(" ")}”</p>}
      {showPrivate && (
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[14px]">
          <span className="flex items-center gap-1.5 text-label-2">
            <IconLock size={15} /> Lowest price, only you see it
          </span>
          <span className="tnum font-semibold">{money(t.floorPriceCents) ?? <span className="font-normal text-label-3">Not set</span>}</span>
        </div>
      )}
      {showPrivate && showSteps && missing.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {steps.map((s) => (
            <span key={s.key} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${s.done ? "bg-green-fill/15 text-green" : "bg-fill text-label-2"}`}>
              {s.done && <IconCheck size={12} />}
              {s.key}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
