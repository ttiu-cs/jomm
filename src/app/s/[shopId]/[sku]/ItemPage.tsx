"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, usd } from "@/lib/client/format";
import { SourceBadge } from "@/components/ui";
import { Checkout, type OrderView } from "@/components/Checkout";
import { IconStore } from "@/components/icons";

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

  if (!item) return <main className="mx-auto max-w-md p-6 text-ink-2">{err ?? "Loading…"}</main>;
  const per = item.unit === "each" ? "" : `/${item.unit}`;
  const thread = [...chat, ...(neg?.messages ?? [])];

  return (
    <main className="mx-auto min-h-screen max-w-md pb-12">
      <header className="flex items-center gap-2 bg-leaf px-4 py-3 text-white">
        <IconStore size={20} />
        <Link href={`/shop/${item.shopId}`} className="font-sign text-xl font-bold underline-offset-2 hover:underline">
          {item.shopName}
        </Link>
        <span className="ml-auto text-sm text-white/80">assistant online</span>
      </header>

      {item.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo} alt={item.name} className="aspect-square w-full object-cover" />
      ) : (
        <div className="grid aspect-[4/3] place-items-center bg-surface-2 text-ink-2">No photo</div>
      )}

      <div className="relative -mt-10 px-4">
        <div className="tag pb-4 pl-9 pr-4 pt-3">
          <h1 className="font-sign text-3xl font-bold leading-tight">{item.name}</h1>
          <div className="font-sign tnum text-5xl font-extrabold leading-none">
            {usd(item.listPriceCents)}
            <span className="text-xl font-semibold">{per}</span>
          </div>
          <p className="mt-1">
            {item.available > 0 ? `${item.available} ${item.unit === "each" ? "left" : item.unit + " left"}` : "Sold out"}
            {item.condition ? `, ${item.condition.toLowerCase()}` : ""}
            {item.negotiable ? ". Offers welcome." : "."}
          </p>
          {item.facts.length > 0 && <p className="mt-2 italic">“{item.facts.join(" ")}”</p>}
        </div>
      </div>

      {err && <p className="mx-4 mt-4 rounded-xl border border-tomato/40 bg-tomato/5 px-3 py-2 text-tomato">{err}</p>}

      {!order && item.available > 0 && (
        <div className="space-y-5 px-4 pt-5">
          <div className="flex items-center justify-between rounded-2xl bg-surface p-3">
            <span className="font-bold">How many {item.unit === "each" ? "" : item.unit}</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Less" disabled={!!neg || qty <= 1} onClick={() => setQty(qty - 1)} className="h-10 w-10 rounded-full border border-line text-xl disabled:opacity-30">
                −
              </button>
              <span className="font-sign tnum w-8 text-center text-2xl font-bold">{qty}</span>
              <button type="button" aria-label="More" disabled={!!neg || qty >= Math.min(10, item.available)} onClick={() => setQty(qty + 1)} className="h-10 w-10 rounded-full border border-line text-xl disabled:opacity-30">
                +
              </button>
            </div>
          </div>

          <button type="button" disabled={busy} onClick={buyAtListed} className="w-full rounded-full bg-leaf py-4 text-lg font-bold text-white disabled:opacity-50">
            Buy {qty > 1 ? `${qty} ` : ""}for {usd(item.listPriceCents * qty)}
          </button>

          <section className="rounded-3xl bg-surface p-4">
            <h2 className="font-sign text-2xl font-bold">Ask or make an offer</h2>
            <p className="text-sm text-ink-2">The stall’s assistant answers from what the owner told it.</p>
            <div className="mt-3 space-y-2">
              {thread.map((m, i) => (
                <div key={i} className={`flex ${m.role === "buyer" ? "justify-end" : ""}`}>
                  <p className={`max-w-[85%] rounded-3xl px-3.5 py-2 ${m.role === "buyer" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-leaf-soft"}`}>{m.text}</p>
                </div>
              ))}
            </div>
            {chat.length === 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {["Is it fresh?", "Any flaws?", "Where is it from?"].map((q) => (
                  <button key={q} type="button" onClick={() => ask(q)} className="rounded-full border border-line px-3 py-1.5 text-sm">
                    {q}
                  </button>
                ))}
              </div>
            )}
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                ask(question);
              }}
            >
              <input className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2.5" placeholder="Ask anything" value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Ask the assistant" />
              <button type="submit" disabled={!question.trim() || busy} className="rounded-full border border-leaf px-4 font-bold text-leaf disabled:opacity-40">
                Ask
              </button>
            </form>
            {item.negotiable && (!neg || (neg.status === "OPEN" && !neg.sellerCounterIsFinal)) && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (offer) makeOffer();
                }}
              >
                <div className="flex min-w-0 flex-1 items-center rounded-full border border-line bg-paper px-4">
                  <span className="text-ink-2">$</span>
                  <input type="number" step="0.05" inputMode="decimal" className="min-w-0 flex-1 bg-transparent px-1 py-2.5 outline-none" placeholder={`Your offer${per}`} value={offer} onChange={(e) => setOffer(e.target.value)} aria-label="Your offer per unit" />
                </div>
                <button type="submit" disabled={!offer || busy} className="rounded-full bg-sticker px-4 font-bold text-ink disabled:opacity-40">
                  Offer
                </button>
              </form>
            )}
            {neg?.status === "OPEN" && neg.sellerCounterCents !== null && (
              <button type="button" disabled={busy} onClick={acceptCounter} className="mt-3 w-full rounded-full bg-leaf py-3 font-bold text-white">
                Take {usd(neg.sellerCounterCents)}
                {per}
              </button>
            )}
            {neg && (neg.status === "CLOSED" || neg.status === "EXPIRED") && <p className="mt-2 text-ink-2">No deal this time. You can still buy at the listed price.</p>}
          </section>
          <p className="text-center text-xs text-muted">Everyone gets the same answers at the same moment. The owner’s lowest price is never shown.</p>
        </div>
      )}

      {order && (
        <section className="mx-4 mt-5 rounded-3xl bg-surface p-5">
          {order.order.status === "PAID" ? (
            <div className="space-y-2 text-center">
              <div className="font-sign text-5xl font-extrabold text-leaf">Paid {usd(order.order.total_cents)}</div>
              <SourceBadge source={order.order.payment_source} />
              {order.order.payment_source === "MOCK_CHECKOUT" && <p className="text-sm text-warn">Practice payment: no money moved.</p>}
              <p className="text-ink-2">Show this screen at the stall.</p>
            </div>
          ) : order.order.status === "AWAITING_APPROVAL" || order.order.status === "CREATED" ? (
            <div className="space-y-3">
              <h2 className="font-sign text-3xl font-bold">Pay {usd(order.order.total_cents)}</h2>
              <p className="text-sm text-ink-2">This price is held for you for 5 minutes.</p>
              <Checkout orderId={order.order.id} onDone={onPaid} />
            </div>
          ) : (
            <p className="text-tomato">Not paid ({order.order.status.toLowerCase()}). Nothing was charged.</p>
          )}
        </section>
      )}
    </main>
  );
}
