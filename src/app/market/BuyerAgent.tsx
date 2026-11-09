"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { api, usd } from "@/lib/client/format";
import { parseBuyerRequest } from "@/lib/buyer/request";
import { Card, SourceBadge } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/shells";
import { Checkout, type OrderView } from "@/components/Checkout";

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
  score?: number;
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
  stock: number;
  unit: string;
}
type Line = { who: "buyer" | "seller" | "system"; text: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round5 = (c: number) => Math.round(c / 5) * 5;

export default function BuyerAgent() {
  const [request, setRequest] = useState("2 lb of sweet apples, max $6 total");
  const [lines, setLines] = useState<Line[]>([]);
  const [result, setResult] = useState<Line | null>(null);
  const [candidates, setCandidates] = useState<CatalogItem[]>([]);
  const [chosen, setChosen] = useState<CatalogItem | null>(null);
  const [seller, setSeller] = useState<SellerView | null>(null);
  const [neg, setNeg] = useState<Neg | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const push = (l: Line) => setLines((x) => [...x, l]);

  const go = async () => {
    setErr(null);
    setLines([]);
    setResult(null);
    setCandidates([]);
    setChosen(null);
    setSeller(null);
    setNeg(null);
    setOrder(null);
    setRunning(true);
    try {
      const r = parseBuyerRequest(request);
      push({ who: "system", text: `Understood: ${r.qty}${r.unit ? " " + r.unit : ""} · “${r.keywords}”${r.budgetCents ? ` · budget ${usd(r.budgetCents)} total` : ""}` });
      await sleep(500);
      push({ who: "buyer", text: "Searching shops that have a seller agent…" });
      const cat = await api<{ items: CatalogItem[] }>(`/api/catalog?q=${encodeURIComponent(r.keywords)}`);
      const items = cat.items.filter((i) => i.available >= r.qty);
      setCandidates(cat.items.slice(0, 3));
      if (!items.length) {
        push({ who: "system", text: cat.items.length ? "Found matches, but none with enough stock." : "No shop sells that yet. Teach a shop first (Step 1)." });
        return;
      }
      const pick = items[0];
      setChosen(pick);
      await sleep(700);
      push({ who: "buyer", text: `Best match: ${pick.name} at ${pick.shopName}, listed ${usd(pick.listPriceCents)}${pick.unit === "each" ? "" : "/" + pick.unit}.` });
      api<SellerView>(`/api/seller/negotiation-view?productId=${pick.productId}`).then(setSeller).catch(() => {});

      if (r.question) {
        await sleep(700);
        push({ who: "buyer", text: r.question });
        const a = await api<{ answer: string }>(`/api/shops/${pick.shopId}/items/${encodeURIComponent(pick.sku)}/ask`, { question: r.question });
        await sleep(500);
        push({ who: "seller", text: a.answer });
      }

      const unitBudget = r.budgetCents ? Math.floor(r.budgetCents / r.qty / 5) * 5 : pick.listPriceCents;
      let offer = Math.min(unitBudget, round5(pick.listPriceCents * 0.7));
      await sleep(700);
      let n = await api<Neg>("/api/negotiations", { productId: pick.productId, qty: r.qty, offerCents: offer, buyer: "demo-buyer-agent" });
      setNeg(n);
      while (n.status === "OPEN") {
        await sleep(1000);
        const counter = n.sellerCounterCents!;
        const lastChance = n.sellerCounterIsFinal || n.offersLeft <= 0;
        const closeEnough = counter - offer <= Math.max(5, round5(pick.listPriceCents * 0.03));
        // Keep haggling while offers remain; accept once the seller's offer is final (or close) and within budget.
        if (counter <= unitBudget && (lastChance || closeEnough)) n = await api<Neg>(`/api/negotiations/${n.id}/accept`, {});
        else if (lastChance) n = await api<Neg>(`/api/negotiations/${n.id}/decline`, {});
        else {
          offer = Math.min(unitBudget, Math.max(offer + 5, round5((offer + counter) / 2)));
          n = await api<Neg>(`/api/negotiations/${n.id}/offer`, { offerCents: offer });
        }
        setNeg(n);
      }
      if (n.status === "AGREED" && n.quote) {
        setResult({ who: "system", text: `Deal: ${usd(n.agreedPriceCents)}${n.unit === "each" ? "" : "/" + n.unit} × ${n.qty} = ${usd((n.agreedPriceCents ?? 0) * n.qty)}. Waiting for your approval in PayPal.` });
        setOrder(await api<OrderView>("/api/orders", { quoteId: n.quote.id }));
      } else setResult({ who: "system", text: "No deal within your budget. Nothing was charged." });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const onPaid = useCallback((o: OrderView) => setOrder(o), []);
  const paid = order?.order.status === "PAID";
  const negLines: Line[] = (neg?.messages ?? []).map((m) => ({ who: m.role, text: m.text }));

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div>
          <p className="text-sm font-semibold text-s1">For shoppers · try a buyer agent</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Tell your buyer agent what you want.</h1>
          <p className="mt-2 text-ink-2">It finds a shop, asks the seller agent what the owner said, negotiates within your budget, and you approve the payment in PayPal.</p>
          <p className="mt-1 text-sm text-muted">
            No shops yet?{" "}
            <Link className="underline" href="/seller">
              Create one in a minute
            </Link>{" "}
            or use the fruit-stand example.
          </p>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <input className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-lg" value={request} onChange={(e) => setRequest(e.target.value)} />
          <button type="submit" disabled={running} className="rounded-xl bg-accent px-6 py-3 font-semibold text-white disabled:opacity-40">
            {running ? "Shopping…" : "Send buyer agent"}
          </button>
        </form>
        <div className="flex flex-wrap gap-2 text-xs">
          {["2 lb of sweet apples, max $6 total", "3 lb peaches, budget $6", "1 box of strawberries under $5", "a wool coat under $50"].map((s) => (
            <button key={s} type="button" onClick={() => setRequest(s)} className="rounded-full border border-line bg-surface px-3 py-1 text-ink-2 hover:text-ink">
              {s}
            </button>
          ))}
        </div>
        {err && <div className="rounded-lg border border-bad/40 px-3 py-2 text-sm text-bad">{err}</div>}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="🛒 Your buyer agent ↔ 🏪 seller agent">
            <div className="space-y-2">
              {lines.length === 0 && <p className="text-sm text-muted">Type what you want above and press “Send buyer agent”.</p>}
              {[...lines, ...negLines, ...(result ? [result] : [])]
                .map((l, i) => (
                  <div key={i} className={`flex ${l.who === "buyer" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
                        l.who === "buyer" ? "bg-accent text-white" : l.who === "seller" ? "border border-line bg-surface-2" : "bg-transparent text-xs text-muted"
                      }`}
                    >
                      {l.who !== "system" && <div className="mb-0.5 text-[10px] font-semibold uppercase opacity-70">{l.who === "buyer" ? "Buyer agent" : `Seller agent · ${chosen?.shopName ?? ""}`}</div>}
                      {l.text}
                    </div>
                  </div>
                ))}
            </div>
          </Card>

          <div className="space-y-4">
            {candidates.length > 0 && (
              <Card title="Shops found">
                <ul className="space-y-2">
                  {candidates.map((c) => (
                    <li key={c.productId} className={`rounded-lg border p-2 text-sm ${chosen?.productId === c.productId ? "border-accent" : "border-line"}`}>
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold">{c.name}</span>
                        <span className="tnum">
                          {usd(c.listPriceCents)}
                          {c.unit === "each" ? "" : "/" + c.unit}
                        </span>
                      </div>
                      <div className="text-xs text-ink-2">
                        {c.shopName} · {c.available} {c.unit} left {c.negotiable ? "· negotiable" : ""}
                      </div>
                      {c.facts[0] && <div className="mt-1 text-xs text-muted">“{c.facts[0]}”</div>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {seller && chosen && (
              <details open className="rounded-xl border border-line bg-surface p-4">
                <summary className="cursor-pointer text-sm font-semibold">🔒 Behind the scenes: the seller agent’s private limits</summary>
                <div className="mt-3">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted">Listed</div>
                    <div className="tnum font-bold">{usd(seller.publishedCents)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Owner’s floor</div>
                    <div className="tnum font-bold">{usd(seller.floorCents)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Will go down to</div>
                    <div className="tnum font-bold text-s1">{usd(seller.walkAwayCents)}</div>
                  </div>
                </div>
                <p className="mt-2 rounded-lg bg-surface-2 p-2 text-sm">{seller.reason}</p>
                <p className="mt-1 text-[11px] text-muted">Shown only to explain the demo. The buyer agent never receives this.</p>
                </div>
              </details>
            )}
            {order && (
              <Card title="💳 Approve the payment">
                {paid ? (
                  <div className="space-y-2">
                    <div className="text-lg font-semibold text-good">✓ Paid {usd(order.order.total_cents)}</div>
                    <SourceBadge source={order.order.payment_source} />
                    {order.order.payment_source === "PAYPAL_SANDBOX" && order.payment?.capture_id && (
                      <div className="break-all font-mono text-[11px] text-muted">PayPal capture {order.payment.capture_id} · verified by server</div>
                    )}
                    {order.order.payment_source === "MOCK_CHECKOUT" && <div className="text-xs text-warn">Offline mock payment. No money moved and PayPal was not called.</div>}
                    {chosen && (
                      <Link className="inline-block text-sm underline" href={`/seller/${chosen.shopId}/deals`}>
                        See it on the owner’s dashboard →
                      </Link>
                    )}
                  </div>
                ) : order.order.status === "AWAITING_APPROVAL" || order.order.status === "CREATED" ? (
                  <div className="space-y-2">
                    <p className="text-sm text-ink-2">The agreed {usd(order.order.total_cents)} is locked for 5 minutes. You approve; the buyer agent cannot pay on its own.</p>
                    <Checkout orderId={order.order.id} onDone={onPaid} />
                  </div>
                ) : (
                  <p className="text-sm text-bad">Not paid ({order.order.status}). Nothing was charged.</p>
                )}
              </Card>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
