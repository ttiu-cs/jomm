"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, usd } from "@/lib/client/format";
import { parseBuyerRequest } from "@/lib/buyer/request";
import { SourceBadge } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/shells";
import { Checkout, type OrderView } from "@/components/Checkout";
import { ItemCard } from "@/components/ItemCard";
import { photoFor } from "@/lib/client/demoPhotos";
import { IconCart, IconCheck, IconLock, IconStore } from "@/components/icons";

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

const EXAMPLES = ["2 lb of sweet apples, max $6 total", "3 lb peaches, budget $7", "1 box of strawberries under $5", "a wool coat under $60"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round5 = (c: number) => Math.round(c / 5) * 5;

export default function BuyerAgent({ initialRequest, shopId, auto }: { initialRequest?: string; shopId?: string; auto?: boolean } = {}) {
  const [request, setRequest] = useState(initialRequest || EXAMPLES[0]);
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

  const go = async (text = request) => {
    setErr(null);
    setLines([]);
    setResult(null);
    setChosen(null);
    setSeller(null);
    setNeg(null);
    setOrder(null);
    setRunning(true);
    try {
      const r = parseBuyerRequest(text);
      push({ who: "note", text: `Looking for ${r.qty}${r.unit ? " " + r.unit : ""} of “${r.keywords}”${r.budgetCents ? `, ${usd(r.budgetCents)} total at most` : ""}.` });
      const cat = await api<{ items: CatalogItem[] }>(`/api/catalog?q=${encodeURIComponent(r.keywords)}${shopId ? `&shop=${encodeURIComponent(shopId)}` : ""}`);
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

  const started = useRef(false);
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      go(initialRequest || EXAMPLES[0]);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPaid = useCallback((o: OrderView) => setOrder(o), []);
  const paid = order?.order.status === "PAID";
  const per = chosen && chosen.unit !== "each" ? `/${chosen.unit}` : "";

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-[1024px] px-5 pb-16 pt-12">
        <div className="text-center">
          <h1 className="display text-[44px] leading-tight sm:text-[56px]">Send a buyer agent shopping.</h1>
          <p className="mx-auto mt-3 max-w-2xl text-[19px] text-label-2">Say what you want and what you’ll spend. It finds a stall, asks the stall’s assistant, haggles, and comes back for your OK before paying with PayPal.</p>
        </div>

        <form
          className="mx-auto mt-8 flex max-w-2xl items-center gap-2 rounded-full bg-fill p-1.5 pl-5"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <input aria-label="What do you want to buy?" className="min-w-0 flex-1 bg-transparent py-2 text-[17px] outline-none" value={request} onChange={(e) => setRequest(e.target.value)} />
          <button type="submit" disabled={running} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-50">
            <IconCart size={18} /> {running ? "Shopping…" : "Shop"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((s) => (
            <button key={s} type="button" onClick={() => setRequest(s)} className={`rounded-full px-3.5 py-1.5 text-[14px] ${request === s ? "bg-label text-white" : "bg-canvas text-label-2 hover:text-label"}`}>
              {s}
            </button>
          ))}
        </div>
        {err && <p className="mx-auto mt-4 max-w-2xl rounded-2xl bg-red/10 px-4 py-3 text-red">{err}</p>}

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section aria-label="Conversation" className="rounded-[28px] bg-canvas p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3 text-[13px] text-label-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-label text-white">
                  <IconStore size={15} />
                </span>
                <span className="truncate">{chosen ? `${chosen.shopName}’s agent` : "Stall’s agent"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                Your agent
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-white">
                  <IconCart size={15} />
                </span>
              </span>
            </div>
            <div className="min-h-[300px] space-y-2">
              {thread.length === 0 && <p className="pt-20 text-center text-[17px] text-label-3">Choose an example or write your own, then tap Shop.</p>}
              {thread.map((l, i) =>
                l.who === "note" ? (
                  <p key={i} className="rise py-1.5 text-center text-[12px] font-medium text-label-3">
                    {l.text}
                  </p>
                ) : (
                  <div key={i} className={`rise flex ${l.who === "buyer" ? "justify-end" : "justify-start"}`}>
                    <p className={`max-w-[78%] rounded-[20px] px-4 py-2.5 text-[16px] leading-snug ${l.who === "buyer" ? "rounded-br-[6px] bg-brand text-white" : "rounded-bl-[6px] bg-[#e9e9eb] text-label"}`}>{l.text}</p>
                  </div>
                ),
              )}
              <div ref={endRef} />
            </div>
          </section>

          <aside className="space-y-5">
            {chosen && <ItemCard t={{ name: chosen.name, unit: chosen.unit, quantity: chosen.available, listPriceCents: chosen.listPriceCents, floorPriceCents: null, sellBy: null, facts: chosen.facts, condition: chosen.condition, photo: photoFor("fruit", chosen.name)?.src ?? photoFor("closet", chosen.name)?.src ?? null }} showPrivate={false} />}

            {order && (
              <section className="rounded-[28px] bg-card p-6 shadow-[0_2px_16px_rgba(0,0,0,0.08)]" aria-label="Payment">
                {paid ? (
                  <div className="space-y-3 text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-fill text-white">
                      <IconCheck size={30} />
                    </div>
                    <div className="display tnum text-[34px]">Paid {usd(order.order.total_cents)}</div>
                    <SourceBadge source={order.order.payment_source} />
                    {order.order.payment_source === "MOCK_CHECKOUT" && <p className="text-[13px] text-label-2">Practice payment: no money moved and PayPal wasn’t called.</p>}
                    {chosen && (
                      <Link className="block text-[15px] text-link" href={`/seller/${chosen.shopId}/deals`}>
                        See it on the stall’s phone ›
                      </Link>
                    )}
                  </div>
                ) : order.order.status === "AWAITING_APPROVAL" || order.order.status === "CREATED" ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-[15px] text-label-2">Your agent agreed on</div>
                      <div className="display tnum text-[44px] leading-none">{usd(order.order.total_cents)}</div>
                      <div className="mt-1 text-[15px] text-label-2">{neg ? `${neg.qty} × ${usd(neg.agreedPriceCents)}${per}, held for 5 minutes` : ""}</div>
                    </div>
                    <Checkout orderId={order.order.id} onDone={onPaid} />
                    <p className="text-[13px] text-label-3">Your agent can’t pay on its own. You approve every payment.</p>
                  </div>
                ) : (
                  <p className="text-red">Not paid ({order.order.status.toLowerCase()}). Nothing was charged.</p>
                )}
              </section>
            )}

            {seller && chosen && (
              <details className="rounded-[22px] bg-canvas p-5">
                <summary className="flex cursor-pointer items-center gap-2 text-[15px] font-semibold">
                  <IconLock size={16} /> Behind the counter <span className="font-normal text-label-2">(demo only)</span>
                </summary>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[12px] text-label-2">Listed</div>
                    <div className="tnum text-[22px] font-semibold">{usd(seller.publishedCents)}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-label-2">Owner’s lowest</div>
                    <div className="tnum text-[22px] font-semibold">{usd(seller.floorCents)}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-label-2">Will go to</div>
                    <div className="tnum text-[22px] font-semibold text-brand">{usd(seller.walkAwayCents)}</div>
                  </div>
                </div>
                <p className="mt-3 text-[14px] text-label-2">{seller.reason}</p>
                <p className="mt-2 text-[12px] text-label-3">Shown so you can see why the assistant answered as it did. Buyer agents never receive this.</p>
              </details>
            )}
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
