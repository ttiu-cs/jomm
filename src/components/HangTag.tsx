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
const SELL_BY: Record<string, string> = { today: "Sell today", this_week: "This week", no_rush: "No rush" };

export function tagSteps(t: TagData) {
  return [
    { key: "How many", done: t.quantity !== null },
    { key: "Price", done: t.listPriceCents !== null },
    { key: "Lowest", done: t.floorPriceCents !== null },
    { key: "Details", done: t.facts.length > 0 || !!t.condition },
    { key: "When", done: t.sellBy !== null },
  ];
}

/**
 * A product as a kraft hang tag. The torn-off strip at the bottom holds the owner's private lowest
 * price; `showPrivate` hides it on buyer-facing screens.
 */
export function HangTag({ t, active, showPrivate = true, compact, className = "" }: { t: TagData; active?: boolean; showPrivate?: boolean; compact?: boolean; className?: string }) {
  const steps = tagSteps(t);
  const per = t.unit === "each" ? "" : `/${t.unit}`;
  return (
    <div className={`tag pl-9 pr-4 pt-3 ${compact ? "pb-2" : "pb-3"} ${active ? "ring-2 ring-sticker ring-offset-2 ring-offset-paper" : ""} ${className}`}>
      {t.sellBy === "today" && (
        <span className="absolute -right-1 -top-2 rotate-6 rounded bg-tomato px-2 py-0.5 text-xs font-bold text-white shadow">Sell today</span>
      )}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-sign truncate text-xl font-bold leading-tight">{t.name}</div>
          <div className="font-sign tnum mt-0.5 text-4xl font-extrabold leading-none">
            {money(t.listPriceCents) ?? <span className="text-kraft-ink/40">$ ?</span>}
            <span className="ml-0.5 text-lg font-semibold">{per}</span>
          </div>
          <div className="mt-1 text-sm">
            {t.quantity !== null ? (
              <>
                {t.quantity} {t.unit === "each" ? "in stock" : `${t.unit} in stock`}
              </>
            ) : (
              <span className="opacity-60">Stock not told yet</span>
            )}
            {t.sellBy && t.sellBy !== "today" ? ` · ${SELL_BY[t.sellBy]}` : ""}
          </div>
        </div>
        {t.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.photo} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover shadow-sm" />
        )}
      </div>
      {!compact && t.facts.length > 0 && <p className="mt-2 line-clamp-2 text-sm italic">“{t.facts.join(" ")}”</p>}
      {showPrivate && (
        <div className="tag-perforation mt-2.5 flex items-center justify-between gap-2 pt-2 text-sm">
          <span className="flex items-center gap-1.5">
            <IconLock size={15} />
            Your lowest: <b className="tnum">{money(t.floorPriceCents) ?? "?"}</b>
          </span>
          <span className="text-xs opacity-70">only you see this</span>
        </div>
      )}
      {showPrivate && steps.some((s) => !s.done) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {steps.map((s) => (
            <span key={s.key} className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] ${s.done ? "bg-kraft-ink/80 text-kraft" : "border border-kraft-ink/30"}`}>
              {s.done && <IconCheck size={11} />}
              {s.key}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
