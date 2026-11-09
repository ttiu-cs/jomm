"use client";
import { useSeller } from "@/lib/client/seller";
import { usd } from "@/lib/client/format";
import { SourceBadge } from "@/components/ui";

export default function SellerDeals({ shopId }: { shopId: string }) {
  const { data: d, error } = useSeller(shopId);
  if (!d) return <main className="p-6 text-ink-2">{error ?? "Loading…"}</main>;
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 pb-10 pt-5">
      <section>
        <h2 className="font-sign text-3xl font-bold">Money in</h2>
        {d.sales.length === 0 && <p className="mt-2 text-ink-2">No payments yet. They show up here the moment a buyer pays.</p>}
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          {d.sales.map((s) => (
            <li key={s.id} className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <b>{s.name}</b> × {s.qty}
                  {s.origin === "NEGOTIATION" && <span className="ml-1.5 rounded-full bg-sticker/60 px-2 py-0.5 text-xs font-bold">negotiated</span>}
                </span>
                <span className={`font-sign tnum text-2xl font-bold ${s.status === "PAID" ? "text-leaf" : "text-ink-2"}`}>{usd(s.total_cents)}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                <SourceBadge source={s.payment_source} />
                {s.status !== "PAID" && <span>{s.status.toLowerCase().replace("_", " ")}</span>}
                {s.payment_source === "PAYPAL_SANDBOX" && s.capture_id && <span className="break-all font-mono text-xs">capture {s.capture_id}</span>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-sign text-3xl font-bold">Conversations</h2>
        {d.negotiations.length === 0 && <p className="mt-2 text-ink-2">When a buyer or buyer agent makes an offer, the whole back-and-forth is kept here.</p>}
        <ul className="mt-3 space-y-2">
          {d.negotiations.map((n) => (
            <li key={n.id} className="rounded-2xl bg-surface p-4">
              <div className="flex items-baseline justify-between gap-2">
                <b>
                  {n.name} × {n.qty} {n.unit === "each" ? "" : n.unit}
                </b>
                <span className={`text-sm font-bold ${n.status === "AGREED" ? "text-leaf" : "text-ink-2"}`}>
                  {n.status === "AGREED" ? `${usd(n.agreed_price_cents)} each (listed ${usd(n.published_cents)})` : n.status === "OPEN" ? "Still talking" : "No deal"}
                </span>
              </div>
              {n.last_message && <p className="mt-1 text-sm text-ink-2">“{n.last_message}”</p>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
