"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSeller } from "@/lib/client/seller";
import { usd } from "@/lib/client/format";
import { rememberShop } from "@/components/shells";

export default function SellerHome({ shopId }: { shopId: string }) {
  const { data: d, error } = useSeller(shopId);
  const opened = useSearchParams().get("opened");
  useEffect(() => rememberShop(shopId), [shopId]);

  if (!d) return <main className="p-6 text-ink-2">{error ?? "Loading…"}</main>;
  const attention = d.items.flatMap((i) => {
    if (i.available === 0) return [{ key: i.sku, tone: "text-ink-2", text: `${i.name} is sold out.` }];
    if (i.sellBy === "today") return [{ key: i.sku, tone: "text-warn", text: `${i.name}: ${i.available} ${i.unit} must sell today. Your agent may go down to ${usd(i.floorCents)}.` }];
    if (i.available <= 3) return [{ key: i.sku, tone: "text-ink-2", text: `${i.name}: only ${i.available} ${i.unit} left.` }];
    return [];
  });
  const agreed = d.negotiations.filter((n) => n.status === "AGREED").length;

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      {opened && <div className="rounded-xl border border-good/40 bg-good/10 px-4 py-3 text-sm font-semibold text-good">🎉 Your shop is open. Your seller agent is now answering buyers.</div>}

      <Link href={`/seller/${shopId}/teach`} className="flex items-center gap-4 rounded-2xl bg-accent p-5 text-white shadow-sm">
        <span className="text-4xl" aria-hidden>
          📷
        </span>
        <span>
          <span className="block text-lg font-bold">{d.items.length ? "Start today’s walk-through" : "Teach your first items"}</span>
          <span className="block text-sm text-white/85">Show the camera what’s in stock and talk. Takes about a minute.</span>
        </span>
      </Link>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-line bg-surface p-3">
          <div className="text-xs text-muted">Paid via PayPal</div>
          <div className="tnum text-xl font-bold text-good">{usd(d.totals.paypalCents)}</div>
          {d.totals.mockCents > 0 && <div className="text-[11px] text-muted">+ {usd(d.totals.mockCents)} mock</div>}
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <div className="text-xs text-muted">Paid orders</div>
          <div className="tnum text-xl font-bold">{d.totals.orders}</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <div className="text-xs text-muted">Deals made</div>
          <div className="tnum text-xl font-bold">{agreed}</div>
        </div>
      </div>

      {attention.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Needs your attention</h2>
          <ul className="space-y-1.5">
            {attention.map((a) => (
              <li key={a.key} className={`rounded-lg border border-line bg-surface px-3 py-2 text-sm ${a.tone}`}>
                {a.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Latest from your agent</h2>
          <Link href={`/seller/${shopId}/deals`} className="text-xs text-s1">
            All deals →
          </Link>
        </div>
        {d.negotiations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
            No buyers yet. Share your <Link className="underline" href={`/shop/${shopId}`}>shop page</Link>, print <Link className="underline" href={`/seller/${shopId}/items`}>QR labels</Link>, or{" "}
            <Link className="underline" href="/market">
              send a test buyer agent
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {d.negotiations.slice(0, 3).map((n) => (
              <li key={n.id} className="rounded-lg border border-line bg-surface p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">
                    {n.name} × {n.qty}
                  </span>
                  <span className={`text-xs font-semibold ${n.status === "AGREED" ? "text-good" : "text-ink-2"}`}>{n.status === "AGREED" ? `Sold at ${usd(n.agreed_price_cents)}` : n.status === "OPEN" ? "Negotiating" : "No deal"}</span>
                </div>
                {n.last_message && <div className="mt-0.5 text-xs text-muted">“{n.last_message}”</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
