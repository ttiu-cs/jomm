"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, usd } from "@/lib/client/format";
import { parseBuyerRequest } from "@/lib/buyer/request";
import { SourceBadge } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/shells";
import { Checkout, type OrderView } from "@/components/Checkout";
import { HangTag } from "@/components/HangTag";
import { IconCart, IconLock, IconStore } from "@/components/icons";

interface CatalogItem {
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
}
interface Neg {
  id: string;
  status: "OPEN" | "AGREED" | "CLOSED" | "EXPIRED";
  qty: number;
  unit: string;
  sellerCounterCents: number | null;
  sellerCounterIsFinal: boolean;
  offersLeft: number;
  agreedPriceCents: number | null;
  quote: { id: string } | null;
  messages: { role: "buyer" | "seller"; text: string }[];
}
interface SellerView {
  walkAwayCents: number;
  publishedCents: number;
  floorCents: number;
  reason: string;
}
type Line = { who: "buyer" | "seller" | "note"; text: string };

const EXAMPLES = ["2 lb of sweet apples, max $6 total", "3 lb peaches, budget $6", "1 box of strawberries under $5", "a wool coat under $50"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round5 = (c: number) => Math.round(c / 5) * 5;

export default function BuyerAgent() {
  const [request, setRequest] = useState(EXAMPLES[0]);
  const [lines, setLines] = useState<Line[]>([]);
  const [result, setResult] = useState<Line | null>(null);
  const [chosen, setChosen] = useState<CatalogItem | null>(null);
  const [seller, setSeller] = useState<SellerView | null>(null);
  const [neg, setNeg] = useState<Neg | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const push = (l: Line) => setLines((x) => [...x, l]);
  const thread: Line[] = [...lines, ...(neg?.messages ?? []).map((m) => ({ who: m.role, text: m.text }) as Line), ...(result ? [result] : [])];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [thread.length]);

  const go = async () => {
    setErr(null);
    setLines([]);
    setResult(null);
    setChosen(null);
    setSeller(null);
    setNeg(null);
    setOrder(null);
    setRunning(true);
    try {
      const r = parseBuyerRequest(request);
      push({ who: "note", text: `Looking for ${r.qty}${r.unit ? " " + r.unit : ""} of “${r.keywords}”${r.budgetCents ? `, ${usd(r.budgetCents)} total at most` : ""}.` });
      const cat = await api<{ items: CatalogItem[] }>(`/api/catalog?q=${encodeURIComponent(r.keywords)}`);
      const items = cat.items.filter((i) => i.available >= r.qty);
      if (!items.length) {
        push({ who: "note", text: cat.items.length ? "Found it, but not enough in stock anywhere." : "No shop sells that yet. Open a sample shop from the seller side first." });
        return;
      }
      const pick = items[0];
      setChosen(pick);
      await sleep(600);
      push({ who: "note", text: `Best match: ${pick.name} at ${pick.shopName}, ${usd(pick.listPriceCents)}${pick.unit === "each" ? "" : "/" + pick.unit}.` });
      api<SellerView>(`/api/seller/negotiation-view?productId=${pick.productId}`).then(setSeller).catch(() => {});
      if (r.question) {
        await sleep(700);
        push({ who: "buyer", text: r.question });
        const a = await api<{ answer: string }>(`/api/shops/${pick.shopId}/items/${encodeURIComponent(pick.sku)}/ask`, { question: r.question });
        await sleep(600);
        push({ who: "seller", text: a.answer });
      }
      const unitBudget = r.budgetCents ? Math.floor(r.budgetCents / r.qty / 5) * 5 : pick.listPriceCents;
      let offer = Math.min(unitBudget, round5(pick.listPriceCents * 0.7));
      await sleep(700);
      let n = await api<Neg>("/api/negotiations", { productId: pick.productId, qty: r.qty, offerCents: offer, buyer: "demo-buyer-agent" });
      setNeg(n);
      while (n.status === "OPEN") {
        await sleep(1100);
        const counter = n.sellerCounterCents!;
        const lastChance = n.sellerCounterIsFinal || n.offersLeft <= 0;
        const closeEnough = counter - offer <= Math.max(5, round5(pick.listPriceCents * 0.03));
        if (counter <= unitBudget && (lastChance || closeEnough)) n = await api<Neg>(`/api/negotiations/${n.id}/accept`, {});
        else if (lastChance) n = await api<Neg>(`/api/negotiations/${n.id}/decline`, {});
        else {
          offer = Math.min(unitBudget, Math.max(offer + 5, round5((offer + counter) / 2)));
          n = await api<Neg>(`/api/negotiations/${n.id}/offer`, { offerCents: offer });
        }
        setNeg(n);
      }
      if (n.status === "AGREED" && n.quote) {
        setResult({ who: "note", text: `Deal reached. Waiting for you to approve the payment.` });
        setOrder(await api<OrderView>("/api/orders", { quoteId: n.quote.id }));
      } else setResult({ who: "note", text: "No deal inside your budget. Nothing was charged." });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const onPaid = useCallback((o: OrderView) => setOrder(o), []);
  const paid = order?.order.status === "PAID";
  const per = chosen && chosen.unit !== "each" ? `/${chosen.unit}` : "";

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-10 pt-8">
        <h1 className="font-sign text-5xl font-extrabold leading-none text-leaf sm:text-6xl">Send a buyer agent shopping</h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-2">Say what you want and what you’ll spend. It finds a stall, asks the stall’s assistant, haggles, and comes back for your OK before paying with PayPal.</p>

        <form
          className="mt-6 flex flex-col gap-2 rounded-3xl bg-surface p-2 shadow-[0_1px_0_var(--line)] sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <input aria-label="What do you want to buy?" className="min-w-0 flex-1 rounded-2xl bg-transparent px-4 py-3 text-xl outline-none" value={request} onChange={(e) => setRequest(e.target.value)} />
          <button type="submit" disabled={running} className="flex items-center justify-center gap-2 rounded-2xl bg-leaf px-6 py-3 text-lg font-bold text-white disabled:opacity-50">
            <IconCart /> {running ? "Shopping…" : "Go shopping"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((s) => (
            <button key={s} type="button" onClick={() => setRequest(s)} className={`rounded-full border px-3 py-1.5 text-sm ${request === s ? "border-leaf bg-leaf-soft text-leaf" : "border-line bg-surface text-ink-2"}`}>
              {s}
            </button>
          ))}
        </div>
        {err && <p className="mt-4 rounded-xl border border-tomato/40 bg-tomato/5 px-3 py-2 text-tomato">{err}</p>}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <section aria-label="Conversation" className="rounded-3xl bg-surface p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between text-sm font-bold">
              <span className="flex items-center gap-2 text-leaf">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-leaf text-white">
                  <IconStore size={18} />
                </span>
                {chosen ? `${chosen.shopName}’s assistant` : "Stall assistant"}
              </span>
              <span className="flex items-center gap-2 text-ink">
                Your buyer agent
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white">
                  <IconCart size={18} />
                </span>
              </span>
            </div>
            <div className="min-h-[280px] space-y-2.5">
              {thread.length === 0 && <p className="pt-16 text-center text-ink-2">Pick an example above, or write your own, then press Go shopping.</p>}
              {thread.map((l, i) =>
                l.who === "note" ? (
                  <p key={i} className="tag-in py-1 text-center text-sm text-ink-2">
                    {l.text}
                  </p>
                ) : (
                  <div key={i} className={`tag-in flex ${l.who === "buyer" ? "justify-end" : "justify-start"}`}>
                    <p className={`max-w-[82%] rounded-3xl px-4 py-2.5 leading-snug ${l.who === "buyer" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-leaf-soft text-ink"}`}>{l.text}</p>
                  </div>
                ),
              )}
              <div ref={endRef} />
            </div>
          </section>

          <aside className="space-y-5">
            {chosen && <HangTag t={{ name: chosen.name, unit: chosen.unit, quantity: chosen.available, listPriceCents: chosen.listPriceCents, floorPriceCents: null, sellBy: null, facts: chosen.facts, condition: chosen.condition }} showPrivate={false} />}

            {order && (
              <section className="rounded-3xl bg-surface p-5 shadow-[0_1px_0_var(--line)]" aria-label="Payment">
                {paid ? (
                  <div className="space-y-2">
                    <div className="font-sign text-4xl font-extrabold text-leaf">Paid {usd(order.order.total_cents)}</div>
                    <SourceBadge source={order.order.payment_source} />
                    {order.order.payment_source === "MOCK_CHECKOUT" && <p className="text-sm text-warn">Practice payment: no money moved and PayPal wasn’t called.</p>}
                    {chosen && (
                      <Link className="inline-block font-bold text-leaf underline underline-offset-2" href={`/seller/${chosen.shopId}/deals`}>
                        See it on the stall’s phone
                      </Link>
                    )}
                  </div>
                ) : order.order.status === "AWAITING_APPROVAL" || order.order.status === "CREATED" ? (
                  <div className="space-y-3">
                    <div className="text-sm text-ink-2">Your agent agreed on</div>
                    <div className="font-sign tnum text-5xl font-extrabold leading-none">
                      {usd(order.order.total_cents)}
                      <span className="ml-2 text-lg font-semibold text-ink-2">
                        {neg ? `${neg.qty} × ${usd(neg.agreedPriceCents)}${per}` : ""}
                      </span>
                    </div>
                    <p className="text-sm text-ink-2">Held for 5 minutes. Your agent can’t pay on its own: you approve below.</p>
                    <Checkout orderId={order.order.id} onDone={onPaid} />
                  </div>
                ) : (
                  <p className="text-tomato">Not paid ({order.order.status.toLowerCase()}). Nothing was charged.</p>
                )}
              </section>
            )}

            {seller && chosen && (
              <details className="rounded-3xl border border-line bg-paper p-5">
                <summary className="flex cursor-pointer items-center gap-2 font-bold">
                  <IconLock size={18} /> Behind the counter (demo only)
                </summary>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs text-ink-2">Listed</div>
                    <div className="font-sign text-2xl font-bold">{usd(seller.publishedCents)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-2">Owner’s lowest</div>
                    <div className="font-sign text-2xl font-bold">{usd(seller.floorCents)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-2">Will go to</div>
                    <div className="font-sign text-2xl font-bold text-leaf">{usd(seller.walkAwayCents)}</div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-ink-2">{seller.reason}</p>
                <p className="mt-2 text-xs text-muted">Shown here so you can see why the assistant answered as it did. Buyer agents never receive this.</p>
              </details>
            )}
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
