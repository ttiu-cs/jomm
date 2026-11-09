"use client";
import { useCallback, useEffect, useState } from "react";
import { api, usd } from "@/lib/client/format";
import { SourceBadge } from "@/components/ui";
import { Checkout, type OrderView } from "@/components/Checkout";

interface Item {
  shopId: string;
  shopName: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  listPriceCents: number;
  available: number;
  condition: string | null;
  facts: string[];
  negotiable: boolean;
  photo: string | null;
}
interface Neg {
  id: string;
  status: string;
  sellerCounterCents: number | null;
  sellerCounterIsFinal: boolean;
  offersLeft: number;
  agreedPriceCents: number | null;
  quote: { id: string } | null;
  messages: { role: "buyer" | "seller"; text: string }[];
}

/** What a shopper sees after scanning a shelf QR: ask the seller agent, make an offer, pay with PayPal. */
export default function ItemPage({ shopId, sku }: { shopId: string; sku: string }) {
  const [item, setItem] = useState<Item | null>(null);
  const [qty, setQty] = useState(1);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<{ role: "buyer" | "seller"; text: string }[]>([]);
  const [offer, setOffer] = useState("");
  const [neg, setNeg] = useState<Neg | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => api<Item>(`/api/shops/${shopId}/items/${encodeURIComponent(sku)}`).then(setItem).catch((e) => setErr(String(e.message ?? e))), [shopId, sku]);
  useEffect(() => {
    load();
  }, [load]);

  const guard = async (fn: () => Promise<void>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const ask = () =>
    guard(async () => {
      const q = question.trim();
      if (!q) return;
      const a = await api<{ answer: string }>(`/api/shops/${shopId}/items/${encodeURIComponent(sku)}/ask`, { question: q });
      setChat((c) => [...c, { role: "buyer", text: q }, { role: "seller", text: a.answer }]);
      setQuestion("");
    });
  const makeOffer = () =>
    guard(async () => {
      const cents = Math.round(parseFloat(offer) * 100);
      const n = neg && neg.status === "OPEN" ? await api<Neg>(`/api/negotiations/${neg.id}/offer`, { offerCents: cents }) : await api<Neg>("/api/negotiations", { productId: item!.productId, qty, offerCents: cents, buyer: "shopper" });
      setNeg(n);
      setOffer("");
      if (n.status === "AGREED" && n.quote) setOrder(await api<OrderView>("/api/orders", { quoteId: n.quote.id }));
    });
  const acceptCounter = () =>
    guard(async () => {
      const n = await api<Neg>(`/api/negotiations/${neg!.id}/accept`, {});
      setNeg(n);
      if (n.quote) setOrder(await api<OrderView>("/api/orders", { quoteId: n.quote.id }));
    });
  const onPaid = useCallback(
    (o: OrderView) => {
      setOrder(o);
      load();
    },
    [load],
  );

  if (!item) return <main className="mx-auto max-w-md p-6 text-ink-2">{err ?? "Loading…"}</main>;
  const per = item.unit === "each" ? "" : `/${item.unit}`;
  return (
    <main className="mx-auto min-h-screen max-w-md space-y-4 bg-surface px-4 pb-10 pt-5">
      <div className="text-xs text-muted">{item.shopName} · seller agent online</div>
      <div className="overflow-hidden rounded-2xl border border-line">
        {item.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photo} alt={item.name} className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-surface-2 text-6xl" aria-hidden>
            🛍️
          </div>
        )}
        <div className="space-y-1 p-4">
          <h1 className="text-xl font-bold">{item.name}</h1>
          <div className="tnum text-3xl font-bold">
            {usd(item.listPriceCents)}
            <span className="text-base font-normal text-ink-2">{per}</span>
          </div>
          <div className="text-xs text-ink-2">
            {item.available} {item.unit} left {item.condition ? `· ${item.condition}` : ""} · SKU {item.sku}
          </div>
          {item.facts.length > 0 && (
            <ul className="list-disc pl-5 pt-1 text-sm text-ink-2">
              {item.facts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {err && <div className="rounded-lg border border-bad/40 px-3 py-2 text-sm text-bad">{err}</div>}

      {!order && (
        <>
          <section className="space-y-2 rounded-xl border border-line p-3">
            <h2 className="text-sm font-semibold">Ask the seller agent</h2>
            {chat.map((m, i) => (
              <div key={i} className={`rounded-xl px-3 py-2 text-sm ${m.role === "buyer" ? "ml-8 bg-accent text-white" : "mr-8 bg-surface-2"}`}>
                {m.text}
              </div>
            ))}
            <div className="flex gap-2">
              <input className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm" placeholder="Are they sweet?" value={question} onChange={(e) => setQuestion(e.target.value)} />
              <button type="button" onClick={ask} className="rounded-lg border border-line px-3 text-sm">
                Ask
              </button>
            </div>
          </section>

          <section className="space-y-2 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Make an offer</h2>
              <label className="flex items-center gap-1 text-xs text-ink-2">
                Qty
                <input type="number" min={1} max={Math.min(10, item.available)} disabled={!!neg} value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))} className="w-14 rounded border border-line bg-surface px-1 py-0.5" />
                {item.unit}
              </label>
            </div>
            {neg?.messages.map((m, i) => (
              <div key={i} className={`rounded-xl px-3 py-2 text-sm ${m.role === "buyer" ? "ml-8 bg-accent text-white" : "mr-8 bg-surface-2"}`}>
                {m.text}
              </div>
            ))}
            {(!neg || (neg.status === "OPEN" && !neg.sellerCounterIsFinal)) && (
              <div className="flex gap-2">
                <input type="number" step="0.05" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm" placeholder={`Your price${per}`} value={offer} onChange={(e) => setOffer(e.target.value)} />
                <button type="button" onClick={makeOffer} disabled={!offer} className="rounded-lg bg-accent px-3 text-sm font-semibold text-white disabled:opacity-40">
                  Offer
                </button>
              </div>
            )}
            {neg?.status === "OPEN" && neg.sellerCounterCents !== null && (
              <button type="button" onClick={acceptCounter} className="w-full rounded-lg border border-accent py-2 text-sm font-semibold text-accent">
                Accept {usd(neg.sellerCounterCents)}
                {per}
              </button>
            )}
            {neg && neg.status !== "OPEN" && neg.status !== "AGREED" && <p className="text-sm text-ink-2">No deal this time.</p>}
            <p className="text-[11px] text-muted">Everyone gets the same answers at the same moment. The seller’s lowest price stays private.</p>
          </section>
        </>
      )}

      {order && (
        <section className="space-y-2 rounded-xl border border-line p-3">
          {order.order.status === "PAID" ? (
            <>
              <div className="text-lg font-semibold text-good">✓ Paid {usd(order.order.total_cents)}</div>
              <SourceBadge source={order.order.payment_source} />
              {order.order.payment_source === "MOCK_CHECKOUT" && <p className="text-xs text-warn">Offline mock payment. No money moved.</p>}
              <p className="text-sm text-ink-2">Show this screen at the counter.</p>
            </>
          ) : order.order.status === "AWAITING_APPROVAL" || order.order.status === "CREATED" ? (
            <>
              <h2 className="text-sm font-semibold">Pay {usd(order.order.total_cents)} (locked for 5 minutes)</h2>
              <Checkout orderId={order.order.id} onDone={onPaid} />
            </>
          ) : (
            <p className="text-sm text-bad">Not paid ({order.order.status}).</p>
          )}
        </section>
      )}
    </main>
  );
}
