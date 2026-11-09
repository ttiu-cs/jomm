"use client";
import Link from "next/link";
import { useLive } from "@/lib/client/useLive";
import { usd } from "@/lib/client/format";
import { Card, SourceBadge, TopNav } from "@/components/ui";

interface Dash {
  shop: { id: string; name: string };
  items: {
    productId: string;
    sku: string;
    name: string;
    unit: string;
    listPriceCents: number;
    available: number;
    floorCents: number;
    sellBy: string;
    sold: number;
    condition: string | null;
    facts: string[];
  }[];
  negotiations: { id: string; status: string; qty: number; name: string; unit: string; agreed_price_cents: number | null; published_cents: number; last_message: string | null; created_at: string }[];
  sales: { id: string; status: string; payment_source: string; total_cents: number; qty: number; unit_price_cents: number; name: string; unit: string; origin: string; capture_id: string | null; verified: number | null; paid_at: string | null }[];
  totals: { paypalCents: number; mockCents: number; orders: number };
}

const SELL_BY: Record<string, string> = { today: "Sell today", this_week: "This week", no_rush: "No rush" };

export default function SellerDashboard({ shopId }: { shopId: string }) {
  const { data: d, error } = useLive<Dash>(`/api/shops/${shopId}/seller`, 5000);
  if (!d) return <div className="p-8 text-ink-2">{error ? `Error: ${error}` : "Loading…"}</div>;
  return (
    <div>
      <div className="print:hidden">
        <TopNav active="teach" />
      </div>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 print:p-0">
        <div className="flex flex-wrap items-end justify-between gap-2 print:hidden">
          <div>
            <div className="text-xs text-muted">My shop · seller agent is live</div>
            <h1 className="text-2xl font-bold tracking-tight">{d.shop.name}</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/teach" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm">
              Teach today’s items
            </Link>
            <button type="button" onClick={() => window.print()} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white">
              Print QR shelf labels
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 print:hidden">
          <Card>
            <div className="text-xs text-muted">Received via PayPal Sandbox</div>
            <div className="tnum text-2xl font-bold text-good">{usd(d.totals.paypalCents)}</div>
          </Card>
          <Card>
            <div className="text-xs text-muted">Mock payments (not real)</div>
            <div className="tnum text-2xl font-bold text-ink-2">{usd(d.totals.mockCents)}</div>
          </Card>
          <Card>
            <div className="text-xs text-muted">Paid orders</div>
            <div className="tnum text-2xl font-bold">{d.totals.orders}</div>
          </Card>
        </div>

        <Card title="What your agent sells" className="print:hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tnum">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2 font-medium">Item</th>
                  <th className="px-2 font-medium">SKU</th>
                  <th className="px-2 font-medium">Stock</th>
                  <th className="px-2 font-medium">Sold</th>
                  <th className="px-2 font-medium">Price</th>
                  <th className="px-2 font-medium">🔒 Lowest</th>
                  <th className="px-2 font-medium">Urgency</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((i) => (
                  <tr key={i.productId} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2">
                      <Link className="font-semibold underline-offset-2 hover:underline" href={`/s/${d.shop.id}/${encodeURIComponent(i.sku)}`}>
                        {i.name}
                      </Link>
                      {i.facts[0] && <div className="text-xs text-muted">{i.facts.slice(0, 2).join(" · ")}</div>}
                    </td>
                    <td className="px-2 font-mono text-xs">{i.sku}</td>
                    <td className="px-2">
                      {i.available} {i.unit}
                    </td>
                    <td className="px-2">{i.sold}</td>
                    <td className="px-2">{usd(i.listPriceCents)}</td>
                    <td className="px-2">{usd(i.floorCents)}</td>
                    <td className="px-2 text-xs">{SELL_BY[i.sellBy] ?? i.sellBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2 print:hidden">
          <Card title="Deals your agent handled">
            {d.negotiations.length === 0 && <p className="text-sm text-muted">No negotiations yet. Send a buyer agent from the Market page.</p>}
            <ul className="space-y-2">
              {d.negotiations.map((n) => (
                <li key={n.id} className="rounded-lg border border-line p-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">
                      {n.name} × {n.qty}
                    </span>
                    <span className={`text-xs font-semibold ${n.status === "AGREED" ? "text-good" : "text-ink-2"}`}>
                      {n.status === "AGREED" ? `Agreed ${usd(n.agreed_price_cents)} (listed ${usd(n.published_cents)})` : n.status}
                    </span>
                  </div>
                  {n.last_message && <div className="mt-0.5 text-xs text-muted">“{n.last_message}”</div>}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Payments">
            {d.sales.length === 0 && <p className="text-sm text-muted">No orders yet.</p>}
            <ul className="space-y-2">
              {d.sales.map((s) => (
                <li key={s.id} className="rounded-lg border border-line p-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {s.name} × {s.qty} · <b className="tnum">{usd(s.total_cents)}</b> {s.origin === "NEGOTIATION" ? <span className="text-xs text-ink-2">(negotiated)</span> : null}
                    </span>
                    <span className={`text-xs font-semibold ${s.status === "PAID" ? "text-good" : "text-ink-2"}`}>{s.status}</span>
                  </div>
                  <div className="mt-1">
                    <SourceBadge source={s.payment_source} />
                  </div>
                  {s.payment_source === "PAYPAL_SANDBOX" && s.capture_id && <div className="mt-0.5 break-all font-mono text-[10px] text-muted">capture {s.capture_id}{s.verified ? " · server-verified" : ""}</div>}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold print:hidden">QR shelf labels</h2>
          <p className="mb-3 text-xs text-muted print:hidden">Shoppers scan to ask your agent, make an offer and pay with PayPal. Each label carries the item’s SKU.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
            {d.items.map((i) => (
              <div key={i.sku} className="break-inside-avoid rounded-xl border border-line bg-white p-3 text-center text-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/shops/${d.shop.id}/qr/${encodeURIComponent(i.sku)}`} alt={`QR code for ${i.name}`} className="mx-auto h-32 w-32" />
                <div className="mt-1 font-semibold">{i.name}</div>
                <div className="text-lg font-bold">
                  {usd(i.listPriceCents)}
                  {i.unit === "each" ? "" : `/${i.unit}`}
                </div>
                <div className="font-mono text-[10px]">{i.sku}</div>
                <div className="text-[10px]">Scan to ask · make an offer · pay with PayPal</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
