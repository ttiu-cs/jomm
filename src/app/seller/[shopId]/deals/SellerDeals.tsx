"use client";
import { useSeller } from "@/lib/client/seller";
import { usd } from "@/lib/client/format";
import { SourceBadge } from "@/components/ui";

export default function SellerDeals({ shopId }: { shopId: string }) {
  const { data: d, error } = useSeller(shopId);
  if (!d) return <main className="p-6 text-ink-2">{error ?? "Loading…"}</main>;
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-5">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Money received</h2>
        {d.sales.length === 0 && <p className="text-sm text-muted">No orders yet.</p>}
        <ul className="space-y-2">
          {d.sales.map((s) => (
            <li key={s.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {s.name} × {s.qty} · <b className="tnum">{usd(s.total_cents)}</b> {s.origin === "NEGOTIATION" && <span className="text-xs text-ink-2">(negotiated)</span>}
                </span>
                <span className={`text-xs font-semibold ${s.status === "PAID" ? "text-good" : "text-ink-2"}`}>{s.status === "PAID" ? "Paid" : s.status}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <SourceBadge source={s.payment_source} />
                {s.payment_source === "PAYPAL_SANDBOX" && s.capture_id && <span className="break-all font-mono text-[10px] text-muted">capture {s.capture_id}</span>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Conversations your agent handled</h2>
        {d.negotiations.length === 0 && <p className="text-sm text-muted">No negotiations yet.</p>}
        <ul className="space-y-2">
          {d.negotiations.map((n) => (
            <li key={n.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">
                  {n.name} × {n.qty} {n.unit === "each" ? "" : n.unit}
                </span>
                <span className={`text-xs font-semibold ${n.status === "AGREED" ? "text-good" : "text-ink-2"}`}>
                  {n.status === "AGREED" ? `${usd(n.agreed_price_cents)} (listed ${usd(n.published_cents)})` : n.status === "OPEN" ? "Negotiating" : "No deal"}
                </span>
              </div>
              {n.last_message && <div className="mt-0.5 text-xs text-muted">“{n.last_message}”</div>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
