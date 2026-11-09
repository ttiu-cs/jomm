"use client";
import Link from "next/link";
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

/** What a shopper sees after scanning a price tag: ask the stall's assistant, make an offer, pay with PayPal. */
export default function ItemPage({ shopId, sku }: { shopId: string; sku: string }) {
  const [item, setItem] = useState<Item | null>(null);
  const [qty, setQty] = useState(1);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<{ role: "buyer" | "seller"; text: string }[]>([]);
  const [offer, setOffer] = useState("");
  const [neg, setNeg] = useState<Neg | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<Item>(`/api/shops/${shopId}/items/${encodeURIComponent(sku)}`)
        .then(setItem)
        .catch((e) => setErr(String(e.message ?? e))),
    [shopId, sku],
  );
  useEffect(() => {
    load();
  }, [load]);

  const guard = async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const ask = (q: string) =>
    guard(async () => {
      if (!q.trim()) return;
      const a = await api<{ answer: string }>(`/api/shops/${shopId}/items/${encodeURIComponent(sku)}/ask`, { question: q });
      setChat((c) => [...c, { role: "buyer", text: q }, { role: "seller", text: a.answer }]);
      setQuestion("");
    });
  const startOrder = async (n: Neg) => {
    if (n.status === "AGREED" && n.quote) setOrder(await api<OrderView>("/api/orders", { quoteId: n.quote.id }));
  };
  const makeOffer = () =>
    guard(async () => {
      const cents = Math.round(parseFloat(offer) * 100);
      const n =
        neg && neg.status === "OPEN"
          ? await api<Neg>(`/api/negotiations/${neg.id}/offer`, { offerCents: cents })
          : await api<Neg>("/api/negotiations", { productId: item!.productId, qty, offerCents: cents, buyer: "shopper" });
      setNeg(n);
      setOffer("");
      await startOrder(n);
    });
  const buyAtListed = () =>
    guard(async () => {
      const n = await api<Neg>("/api/negotiations", { productId: item!.productId, qty, offerCents: item!.listPriceCents, buyer: "shopper" });
      setNeg(n);
      await startOrder(n);
    });
  const acceptCounter = () =>
    guard(async () => {
      const n = await api<Neg>(`/api/negotiations/${neg!.id}/accept`, {});
      setNeg(n);
      await startOrder(n);
    });
  const onPaid = useCallback(
    (o: OrderView) => {
      setOrder(o);
      load();
    },
    [load],
  );

  if (!item) return <main className="mx-auto max-w-md p-6 text-label-2">{err ?? "Loading…"}</main>;
  const per = item.unit === "each" ? "" : ` / ${item.unit}`;
  const thread = [...chat, ...(neg?.messages ?? [])];

  return (
    <main className="mx-auto min-h-screen max-w-[480px] bg-card pb-14">
      <header className="frosted sticky top-0 z-20 flex h-12 items-center justify-between border-b border-black/5 px-4">
        <Link href={`/shop/${item.shopId}`} className="text-[17px] text-link">
          ‹ {item.shopName}
        </Link>
        <span className="flex items-center gap-1.5 text-[13px] text-label-2">
          <span className="h-2 w-2 rounded-full bg-green-fill" /> Assistant online
        </span>
      </header>

      {item.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo} alt={item.name} className="warm-photo aspect-square w-full object-cover" />
      ) : (
        <div className="grid aspect-[4/3] place-items-center bg-canvas text-label-3">No photo</div>
      )}

      <div className="px-5 pt-5">
        <h1 className="display text-[32px] leading-tight">{item.name}</h1>
        <div className="tnum mt-1 text-[24px] font-semibold">
          {usd(item.listPriceCents)}
          <span className="text-[17px] font-normal text-label-2">{per}</span>
        </div>
        <p className="mt-1 text-[15px] text-label-2">
          {item.available > 0 ? `${item.available} ${item.unit === "each" ? "available" : item.unit + " available"}` : "Sold out"}
          {item.condition ? ` · ${item.condition}` : ""}
          {item.negotiable ? " · Offers welcome" : ""}
        </p>
        {item.facts.length > 0 && (
          <p className="hand mt-3 text-[26px]">
            “{item.facts.join(" ")}” <span className="text-[18px] text-label-3">— the owner</span>
          </p>
        )}
      </div>

      {err && <p className="mx-5 mt-4 rounded-2xl bg-red/10 px-4 py-3 text-red">{err}</p>}

      {!order && item.available > 0 && (
        <div className="space-y-6 px-5 pt-6">
          <div className="flex items-center justify-between rounded-[14px] bg-canvas px-4 py-2.5">
            <span className="text-[17px]">Quantity{item.unit === "each" ? "" : ` (${item.unit})`}</span>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Less" disabled={!!neg || qty <= 1} onClick={() => setQty(qty - 1)} className="grid h-8 w-8 place-items-center rounded-full bg-card text-[20px] shadow-sm disabled:opacity-30">
                −
              </button>
              <span className="tnum w-6 text-center text-[17px] font-semibold">{qty}</span>
              <button type="button" aria-label="More" disabled={!!neg || qty >= Math.min(10, item.available)} onClick={() => setQty(qty + 1)} className="grid h-8 w-8 place-items-center rounded-full bg-card text-[20px] shadow-sm disabled:opacity-30">
                +
              </button>
            </div>
          </div>

          <button type="button" disabled={busy} onClick={buyAtListed} className="w-full rounded-[14px] bg-brand py-4 text-[17px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
            Buy {qty > 1 ? `${qty} ` : ""}for {usd(item.listPriceCents * qty)}
          </button>

          <section>
            <h2 className="text-[22px] font-semibold">Ask or make an offer</h2>
            <p className="text-[15px] text-label-2">The stall’s assistant answers from what the owner told it.</p>
            <div className="mt-4 space-y-2">
              {thread.map((m, i) => (
                <div key={i} className={`rise flex ${m.role === "buyer" ? "justify-end" : ""}`}>
                  <p className={`max-w-[80%] rounded-[20px] px-4 py-2.5 text-[16px] leading-snug ${m.role === "buyer" ? "rounded-br-[6px] bg-brand text-white" : "rounded-bl-[6px] bg-[#e9e9eb]"}`}>{m.text}</p>
                </div>
              ))}
            </div>
            {chat.length === 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {["Is it fresh?", "Any flaws?", "Where is it from?"].map((q) => (
                  <button key={q} type="button" onClick={() => ask(q)} className="rounded-full bg-canvas px-3.5 py-1.5 text-[15px] text-link">
                    {q}
                  </button>
                ))}
              </div>
            )}
            <form
              className="mt-3 flex items-center gap-2 rounded-full bg-canvas py-1 pl-4 pr-1"
              onSubmit={(e) => {
                e.preventDefault();
                ask(question);
              }}
            >
              <input className="min-w-0 flex-1 bg-transparent py-2 text-[17px] outline-none placeholder:text-label-3" placeholder="Ask anything" value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Ask the assistant" />
              <button type="submit" disabled={!question.trim() || busy} className="rounded-full px-3 py-2 text-[15px] font-semibold text-link disabled:text-label-3">
                Ask
              </button>
            </form>
            {item.negotiable && (!neg || (neg.status === "OPEN" && !neg.sellerCounterIsFinal)) && (
              <form
                className="mt-2 flex items-center gap-2 rounded-full bg-canvas py-1 pl-4 pr-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (offer) makeOffer();
                }}
              >
                <span className="text-[17px] text-label-2">$</span>
                <input type="number" step="0.05" inputMode="decimal" className="min-w-0 flex-1 bg-transparent py-2 text-[17px] outline-none placeholder:text-label-3" placeholder={`Your offer${per}`} value={offer} onChange={(e) => setOffer(e.target.value)} aria-label="Your offer per unit" />
                <button type="submit" disabled={!offer || busy} className="rounded-full bg-label px-4 py-2 text-[15px] font-semibold text-white disabled:opacity-30">
                  Offer
                </button>
              </form>
            )}
            {neg?.status === "OPEN" && neg.sellerCounterCents !== null && (
              <button type="button" disabled={busy} onClick={acceptCounter} className="mt-3 w-full rounded-[14px] bg-brand py-3.5 text-[17px] font-semibold text-white">
                Accept {usd(neg.sellerCounterCents)}
                {per}
              </button>
            )}
            {neg && (neg.status === "CLOSED" || neg.status === "EXPIRED") && <p className="mt-3 text-[15px] text-label-2">No deal this time. You can still buy at the listed price.</p>}
          </section>
          <p className="text-center text-[12px] text-label-3">Everyone gets the same answers at the same moment. The owner’s lowest price is never shown.</p>
        </div>
      )}

      {order && (
        <section className="mx-5 mt-6 rounded-[22px] bg-canvas p-6">
          {order.order.status === "PAID" ? (
            <div className="space-y-3 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-fill text-[28px] text-white">✓</div>
              <div className="display tnum text-[34px]">Paid {usd(order.order.total_cents)}</div>
              <SourceBadge source={order.order.payment_source} />
              {order.order.payment_source === "MOCK_CHECKOUT" && <p className="text-[13px] text-label-2">Practice payment: no money moved.</p>}
              <p className="text-[15px] text-label-2">Show this screen at the stall.</p>
            </div>
          ) : order.order.status === "AWAITING_APPROVAL" || order.order.status === "CREATED" ? (
            <div className="space-y-3">
              <h2 className="display tnum text-[28px]">Pay {usd(order.order.total_cents)}</h2>
              <p className="text-[15px] text-label-2">This price is held for you for 5 minutes.</p>
              <Checkout orderId={order.order.id} onDone={onPaid} />
            </div>
          ) : (
            <p className="text-red">Not paid ({order.order.status.toLowerCase()}). Nothing was charged.</p>
          )}
        </section>
      )}
    </main>
  );
}
