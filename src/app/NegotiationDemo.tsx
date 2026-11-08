"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLive } from "@/lib/client/useLive";
import { api, hourLabel, usd } from "@/lib/client/format";
import { Card, SourceBadge, TopNav } from "@/components/ui";
import { Checkout, type OrderView } from "@/components/Checkout";

interface SellerView {
  available: boolean;
  stock: number;
  hour: number;
  hoursRemaining: number;
  publishedCents: number;
  walkAwayCents: number;
  expectedDemandAtPublished: number;
  regime: "SCARCE" | "BALANCED" | "SURPLUS";
  reason: string;
  storeOpen: boolean;
  closeHour: number;
}
interface Msg {
  role: "buyer" | "seller";
  kind: string;
  price_cents: number | null;
  text: string;
}
interface Neg {
  id: string;
  status: "OPEN" | "AGREED" | "CLOSED" | "EXPIRED";
  listedPriceCents: number;
  offersLeft: number;
  sellerCounterCents: number | null;
  sellerCounterIsFinal: boolean;
  agreedPriceCents: number | null;
  quote: { id: string; expires_at: string } | null;
  messages: Msg[];
}

const SCENARIOS = [
  { key: "lunch", title: "Before lunch", sub: "11:00 · 40 salads left", icon: "🕚" },
  { key: "closing", title: "Near closing", sub: "18:00 · 30 salads left", icon: "🕕" },
] as const;

const ceil25 = (c: number) => Math.ceil(c / 25) * 25;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const REGIME: Record<SellerView["regime"], { label: string; cls: string }> = {
  SCARCE: { label: "Will sell out", cls: "border-s1/50 text-s1" },
  BALANCED: { label: "Balanced", cls: "border-line text-ink-2" },
  SURPLUS: { label: "Leftovers expected", cls: "border-s2/50 text-s2" },
};

function Step({ n, label, on }: { n: number; label: string; on: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${on ? "text-ink" : "text-muted"}`}>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${on ? "bg-accent text-white" : "bg-surface-2"}`}>{n}</span>
      {label}
    </div>
  );
}

export default function NegotiationDemo() {
  const { data: seller, refresh } = useLive<SellerView>("/api/seller/negotiation-view", 6000);
  const [scenario, setScenario] = useState<string | null>(null);
  const [budget, setBudget] = useState(500);
  const [firstOffer, setFirstOffer] = useState(400);
  const [neg, setNeg] = useState<Neg | null>(null);
  const [running, setRunning] = useState(false);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [neg?.messages.length]);

  const pick = async (key: string) => {
    setErr(null);
    setNeg(null);
    setOrder(null);
    setScenario(key);
    try {
      await api("/api/simulations/jump", { scenario: key });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    refresh();
  };

  /** Simple buyer agent: open low, meet the seller halfway, never exceed the budget. */
  const runBuyerAgent = async () => {
    setErr(null);
    setOrder(null);
    setRunning(true);
    try {
      let offer = Math.min(firstOffer, budget);
      let n = await api<Neg>("/api/negotiations", { offerCents: offer, buyer: "demo-buyer-agent" });
      setNeg(n);
      while (n.status === "OPEN") {
        await sleep(900);
        const counter = n.sellerCounterCents!;
        if (counter <= budget) {
          n = await api<Neg>(`/api/negotiations/${n.id}/accept`, {});
        } else if (n.sellerCounterIsFinal || n.offersLeft <= 0) {
          n = await api<Neg>(`/api/negotiations/${n.id}/decline`, {});
        } else {
          offer = Math.min(budget, Math.max(offer + 25, ceil25((offer + counter) / 2)));
          n = await api<Neg>(`/api/negotiations/${n.id}/offer`, { offerCents: offer });
        }
        setNeg(n);
      }
      if (n.status === "AGREED" && n.quote) {
        const o = await api<OrderView>("/api/orders", { quoteId: n.quote.id });
        setOrder(o);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      refresh();
    }
  };

  const onPaid = useCallback(
    (o: OrderView) => {
      setOrder(o);
      refresh();
    },
    [refresh],
  );

  const paid = order?.order.status === "PAID";
  const stage = paid ? 3 : neg?.status === "AGREED" ? 3 : neg ? 2 : scenario ? 2 : 1;

  return (
    <div>
      <TopNav active="home" />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div>
          <p className="text-sm font-semibold text-s1">Pricing Intelligence for Every Seller Agent</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">A buyer AI asks for a discount. The seller AI answers with math.</h1>
          <p className="mt-2 max-w-3xl text-ink-2">
            Same salad, same listed price, same buyer budget. The seller agent decides from stock, time left and expected demand. Then PayPal takes the payment.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Step n={1} label="Pick a moment" on={stage >= 1} />
          <Step n={2} label="Agents negotiate" on={stage >= 2} />
          <Step n={3} label="Pay with PayPal" on={stage >= 3} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={running}
              onClick={() => pick(s.key)}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition disabled:opacity-50 ${scenario === s.key ? "border-accent bg-accent/5" : "border-line bg-surface hover:border-s1/50"}`}
            >
              <span className="text-3xl" aria-hidden>
                {s.icon}
              </span>
              <span>
                <span className="block font-semibold">{s.title}</span>
                <span className="block text-sm text-ink-2">{s.sub} · listed $7.00</span>
              </span>
            </button>
          ))}
        </div>

        {err && <div className="rounded-lg border border-bad/40 px-3 py-2 text-sm text-bad">{err}</div>}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="🛒 Buyer agent" right={<span className="text-xs text-muted">acts for a shopper</span>}>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="space-y-1">
                <span className="text-xs text-muted">Shopper’s max budget</span>
                <input type="number" step="0.25" min="1" className="w-full rounded-md border border-line bg-surface px-2 py-1.5 tnum" value={(budget / 100).toFixed(2)} onChange={(e) => setBudget(Math.round(parseFloat(e.target.value || "0") * 100))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">First offer</span>
                <input type="number" step="0.25" min="0.5" className="w-full rounded-md border border-line bg-surface px-2 py-1.5 tnum" value={(firstOffer / 100).toFixed(2)} onChange={(e) => setFirstOffer(Math.round(parseFloat(e.target.value || "0") * 100))} />
              </label>
            </div>
            <button
              type="button"
              disabled={running || !seller?.available}
              onClick={runBuyerAgent}
              className="mt-3 w-full rounded-lg bg-accent py-2.5 font-semibold text-white disabled:opacity-40"
            >
              {running ? "Negotiating…" : neg ? "Negotiate again" : "Start negotiation"}
            </button>
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {!neg && <p className="text-sm text-muted">Pick a moment above, then start. The buyer agent opens low, meets the seller halfway, and never goes over budget.</p>}
              {neg?.messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "buyer" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "buyer" ? "bg-accent text-white" : "border border-line bg-surface-2 text-ink"}`}>
                    <div className="mb-0.5 text-[10px] font-semibold uppercase opacity-70">{m.role === "buyer" ? "Buyer agent" : "Seller agent"}</div>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={chatEnd} />
            </div>
            {neg && neg.status !== "OPEN" && (
              <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${neg.status === "AGREED" ? "bg-good/10 text-good" : "bg-surface-2 text-ink-2"}`}>
                {neg.status === "AGREED"
                  ? `Deal: ${usd(neg.agreedPriceCents)} (listed ${usd(neg.listedPriceCents)})`
                  : neg.status === "CLOSED"
                    ? "No deal: the seller’s lowest price is above the shopper’s budget."
                    : "Negotiation expired."}
              </div>
            )}
          </Card>

          <Card title="🧠 Seller agent · private view" right={seller && <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${REGIME[seller.regime].cls}`}>{REGIME[seller.regime].label}</span>}>
            {!seller ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted">Listed price</div>
                    <div className="tnum text-2xl font-bold">{usd(seller.publishedCents)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Lowest it will accept now</div>
                    <div className="tnum text-2xl font-bold text-s1">{seller.available ? usd(seller.walkAwayCents) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Store time · stock</div>
                    <div className="tnum font-semibold">
                      {seller.storeOpen ? hourLabel(seller.hour) : "Closed"} · {seller.stock} left
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Expected sales before {hourLabel(seller.closeHour)}</div>
                    <div className="tnum font-semibold">≈ {Math.round(seller.expectedDemandAtPublished)} at {usd(seller.publishedCents)}</div>
                  </div>
                </div>
                <p className="rounded-lg bg-surface-2 p-3 text-sm">{seller.reason}</p>
                <p className="text-[11px] text-muted">
                  The buyer agent never sees this panel. Every buyer gets the same answer at the same moment. The lowest price comes from the pricing engine (stock, time left, forecast demand, waste
                  cost), is capped by the merchant’s policy, and is never set by an LLM. Demand figures are a synthetic forecast.
                </p>
              </div>
            )}
          </Card>
        </div>

        {order && (
          <Card title="💳 Pay the agreed price" right={<span className="font-mono text-[10px] text-muted">order {order.order.id}</span>}>
            {paid ? (
              <div className="space-y-2">
                <div className="text-lg font-semibold text-good">✓ Paid {usd(order.order.total_cents)}</div>
                <SourceBadge source={order.order.payment_source} />
                {order.order.payment_source === "PAYPAL_SANDBOX" && order.payment?.capture_id && (
                  <div className="break-all font-mono text-[11px] text-muted">PayPal capture {order.payment.capture_id} · verified by server</div>
                )}
                {order.order.payment_source === "MOCK_CHECKOUT" && <div className="text-xs text-warn">Offline mock payment for the demo. No money moved and PayPal was not called.</div>}
                <p className="text-sm text-ink-2">Stock went down by one. The seller agent’s next answer already uses the new stock (see the private view).</p>
              </div>
            ) : order.order.status === "AWAITING_APPROVAL" || order.order.status === "CREATED" ? (
              <div className="max-w-md space-y-2">
                <p className="text-sm text-ink-2">
                  The agreed {usd(order.order.total_cents)} is locked on the server for 5 minutes. A person approves the payment; the buyer agent cannot pay on its own.
                </p>
                <Checkout orderId={order.order.id} onDone={onPaid} />
              </div>
            ) : (
              <p className="text-sm text-bad">
                Not paid ({order.order.status}
                {order.order.failure_reason ? `: ${order.order.failure_reason}` : ""}). No stock was taken.
              </p>
            )}
          </Card>
        )}

        <p className="text-xs text-muted">
          Want the details? <a className="underline" href="/merchant">Merchant Command Center</a> shows hourly pricing, policy and every payment.{" "}
          <a className="underline" href="/lab">Pricing Lab</a> compares fixed vs adaptive pricing (synthetic). <a className="underline" href="/agent">Agent API</a> lets any buyer or seller agent plug in.
        </p>
      </main>
    </div>
  );
}
