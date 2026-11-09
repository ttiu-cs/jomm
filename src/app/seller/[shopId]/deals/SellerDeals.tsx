"use client";
import { useSeller } from "@/lib/client/seller";
import { usd } from "@/lib/client/format";
import { SourceBadge } from "@/components/ui";

export default function SellerDeals({ shopId }: { shopId: string }) {
  const { data: d, error } = useSeller(shopId);
  if (!d) return <main className="p-6 text-label-2">{error ?? "Loading…"}</main>;
  return (
    <main className="mx-auto max-w-[720px] px-5 pb-10 pt-6">
      <h1 className="text-[34px] font-bold tracking-tight">Sales</h1>
      <section className="mt-5">
        <h2 className="px-4 text-[13px] uppercase tracking-wide text-label-2">Payments</h2>
        {d.sales.length === 0 ? (
          <p className="mt-1.5 rounded-[14px] bg-card p-4 text-[15px] text-label-2">Payments show up here the moment a buyer pays.</p>
        ) : (
          <ul className="mt-1.5 overflow-hidden rounded-[14px] bg-card">
            {d.sales.map((s, i) => (
              <li key={s.id} className={`px-4 py-3 ${i ? "border-t border-line" : ""}`}>
                <div className="flex items-baseline justify-between gap-3 text-[17px]">
                  <span className="min-w-0 truncate">
                    {s.name} × {s.qty}
                  </span>
                  <span className={`tnum font-semibold ${s.status === "PAID" ? "" : "text-label-3"}`}>{usd(s.total_cents)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-label-2">
                  <SourceBadge source={s.payment_source} />
                  {s.origin === "NEGOTIATION" && <span>Negotiated by your assistant</span>}
                  {s.status !== "PAID" && <span>{s.status.toLowerCase().replace("_", " ")}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-7">
        <h2 className="px-4 text-[13px] uppercase tracking-wide text-label-2">Conversations</h2>
        {d.negotiations.length === 0 ? (
          <p className="mt-1.5 rounded-[14px] bg-card p-4 text-[15px] text-label-2">When a shopper or buyer agent makes an offer, the whole conversation is kept here.</p>
        ) : (
          <ul className="mt-1.5 overflow-hidden rounded-[14px] bg-card">
            {d.negotiations.map((n, i) => (
              <li key={n.id} className={`px-4 py-3 ${i ? "border-t border-line" : ""}`}>
                <div className="flex items-baseline justify-between gap-2 text-[17px]">
                  <span>
                    {n.name} × {n.qty}
                    {n.unit === "each" ? "" : ` ${n.unit}`}
                  </span>
                  <span className={`text-[15px] ${n.status === "AGREED" ? "font-semibold text-green" : "text-label-2"}`}>
                    {n.status === "AGREED" ? `${usd(n.agreed_price_cents)}${n.unit === "each" ? " each" : ` / ${n.unit}`}` : n.status === "OPEN" ? "Talking…" : "No deal"}
                  </span>
                </div>
                {n.last_message && <p className="mt-0.5 text-[14px] text-label-2">{n.last_message}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
