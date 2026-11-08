"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { storefrontState } from "@/lib/server/state";
import { useLive } from "@/lib/client/useLive";
import { api, hourLabel, usd } from "@/lib/client/format";
import { SourceBadge } from "@/components/ui";

type S = ReturnType<typeof storefrontState>;
interface Quote {
  id: string;
  unitPriceCents: number;
  qty: number;
  totalCents: number;
  currency: string;
  priceVersion: number;
  expiresAt: string;
}
interface OrderView {
  order: { id: string; status: string; payment_source: string; total_cents: number; failure_reason: string | null };
  payment: { provider_order_id: string | null; capture_id: string | null; verified: number } | null;
}

type PayPalButtons = { render: (el: HTMLElement) => Promise<void>; close?: () => Promise<void> };
declare global {
  interface Window {
    paypal?: { Buttons: (opts: Record<string, unknown>) => PayPalButtons };
  }
}

function loadPayPalSdk(clientId: string): Promise<void> {
  if (window.paypal) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load PayPal SDK (network?)"));
    document.head.appendChild(s);
  });
}

function useCountdown(expiresAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000)) : 0;
}

export default function Storefront() {
  const { data: s, refresh } = useLive<S>("/api/storefront", 5000);
  const [qty, setQty] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [phase, setPhase] = useState<"browse" | "locked" | "paying" | "paid" | "failed" | "expired" | "pending">("browse");
  const [err, setErr] = useState<string | null>(null);
  const [pp, setPp] = useState<{ mode: string; clientId: string | null } | null>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const rawLeft = useCountdown(phase === "locked" || phase === "paying" ? quote?.expiresAt ?? null : null);
  const left = rawLeft;
  const lockLapsed = left === 0;

  useEffect(() => {
    fetch("/api/storefront?view=1", { cache: "no-store" }); // logs a VIEW exposure (conversion denominator)
    api<{ mode: string; clientId: string | null }>("/api/paypal/config").then(setPp).catch(() => setPp({ mode: "MOCK_CHECKOUT", clientId: null }));
  }, []);


  const finish = useCallback(
    (o: OrderView) => {
      setOrder(o);
      const st = o.order.status;
      setPhase(st === "PAID" ? "paid" : st === "PAYMENT_PENDING" ? "pending" : st === "EXPIRED" ? "expired" : st === "FAILED" ? "failed" : "locked");
      refresh();
    },
    [refresh],
  );

  const lockPrice = async () => {
    setErr(null);
    try {
      const q = await api<Quote>("/api/quotes", { qty });
      const o = await api<OrderView>("/api/orders", { quoteId: q.id });
      setQuote(q);
      setOrder(o);
      setPhase("locked");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  // Render PayPal buttons for a locked quote (Sandbox mode only).
  useEffect(() => {
    if (phase !== "locked" || lockLapsed || !order || !pp?.clientId || pp.mode !== "PAYPAL_SANDBOX" || !btnRef.current) return;
    let buttons: PayPalButtons | null = null;
    let cancelled = false;
    const el = btnRef.current;
    loadPayPalSdk(pp.clientId)
      .then(() => {
        if (cancelled || !window.paypal) return;
        buttons = window.paypal.Buttons({
          style: { layout: "vertical", shape: "rect", label: "pay" },
          createOrder: async () => (await api<{ paypalOrderId: string }>("/api/paypal/orders", { orderId: order.order.id })).paypalOrderId,
          onApprove: async (data: { orderID: string }, actions: { restart: () => Promise<void> }) => {
            setPhase("paying");
            try {
              const r = await api<OrderView & { outcome: { status: string } }>(`/api/paypal/orders/${data.orderID}/capture`, {});
              finish(r);
            } catch (e) {
              const m = e instanceof Error ? e.message : String(e);
              if (/declined/i.test(m)) {
                setErr("Your funding source was declined. Choose another method.");
                setPhase("locked");
                return actions.restart();
              }
              setErr(m);
              api<OrderView>(`/api/orders/${order.order.id}`).then(finish).catch(() => setPhase("failed"));
            }
          },
          onCancel: async () => {
            setErr("Payment cancelled. No money was taken.");
            await api(`/api/orders/${order.order.id}/cancel`, {}).catch(() => {});
            setPhase("failed");
          },
          onError: (e: unknown) => {
            setErr(`PayPal error: ${e instanceof Error ? e.message : String(e)}`);
          },
        });
        return buttons.render(el);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      buttons?.close?.().catch(() => {});
      el.innerHTML = "";
    };
  }, [phase, order, pp, finish, lockLapsed]);

  const mockPay = async (outcome: "success" | "fail") => {
    if (!order) return;
    setPhase("paying");
    try {
      await api(`/api/orders/${order.order.id}/mock-pay`, { outcome });
      finish(await api<OrderView>(`/api/orders/${order.order.id}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("failed");
    }
  };

  const reset = () => {
    setQuote(null);
    setOrder(null);
    setErr(null);
    setPhase("browse");
    refresh();
  };

  // A locked quote whose timer ran out is shown as expired; the server enforces expiry independently.
  const view = phase === "locked" && quote && left === 0 ? "expired" : phase;
  const price = s?.price?.priceCents;
  const priceChanged = quote && price !== undefined && price !== quote.unitPriceCents;

  return (
    <main className="mx-auto min-h-screen max-w-md bg-surface px-4 pb-10 pt-5">
      <div className="text-xs text-muted">{s?.product.storeName ?? "…"}</div>
      <div className="mt-3 overflow-hidden rounded-2xl border border-line">
        <div className="flex h-40 items-center justify-center bg-gradient-to-br from-good/25 to-s1/10 text-6xl" aria-hidden>
          🥗
        </div>
        <div className="space-y-1 p-4">
          <h1 className="text-xl font-bold">{s?.product.name ?? "Fresh Garden Salad"}</h1>
          <p className="text-sm text-ink-2">Made fresh this morning. Best today — sold until {s ? hourLabel(s.closeHour) : "close"}.</p>
          <div className="flex items-end justify-between pt-2">
            <div>
              <div className="tnum text-3xl font-bold">{usd(price)}</div>
              <div className="text-[11px] text-muted">
                Current price · v{s?.price?.version} · store time {s ? hourLabel(s.storeHour) : "—"} (demo clock)
              </div>
            </div>
            <div className="text-right text-xs text-ink-2">{s ? (s.storeOpen ? `${s.available} left` : "Closed today") : ""}</div>
          </div>
          <p className="pt-1 text-[11px] text-muted">Same public price for every shopper at this time. Prices may change by the hour; a locked quote never changes.</p>
        </div>
      </div>

      {err && <div className="mt-3 rounded-lg border border-bad/40 px-3 py-2 text-sm text-bad">{err}</div>}

      {view === "browse" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Quantity</span>
            <div className="flex items-center gap-2">
              <button type="button" className="h-9 w-9 rounded-lg border border-line text-lg" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="decrease">
                −
              </button>
              <span className="w-6 text-center tnum">{qty}</span>
              <button type="button" className="h-9 w-9 rounded-lg border border-line text-lg" onClick={() => setQty(Math.min(3, qty + 1))} aria-label="increase">
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            disabled={!s?.storeOpen || !s.available}
            onClick={lockPrice}
            className="w-full rounded-xl bg-accent py-3 text-base font-semibold text-white disabled:opacity-40"
          >
            Lock price {price !== undefined ? usd(price * qty) : ""} for 5 min
          </button>
        </div>
      )}

      {quote && view !== "browse" && (
        <div className="mt-4 space-y-3 rounded-xl border border-line p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Your price-locked quote</span>
            <span className="font-mono text-[10px] text-muted">{quote.id}</span>
          </div>
          <div className="tnum text-2xl font-bold">
            {usd(quote.totalCents)} <span className="text-sm font-normal text-ink-2">({quote.qty} × {usd(quote.unitPriceCents)})</span>
          </div>
          {(view === "locked" || view === "paying") && (
            <div className="text-xs text-ink-2">
              Locked for{" "}
              <b className="tnum">
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </b>{" "}
              · reserved for you · price version v{quote.priceVersion}
            </div>
          )}
          {priceChanged && (view === "locked" || view === "paying") && (
            <div className="rounded-md bg-surface-2 p-2 text-xs text-ink-2">
              The shelf price is now {usd(price)}. Your locked price stays {usd(quote.unitPriceCents)}.
            </div>
          )}

          {view === "locked" && pp?.mode === "PAYPAL_SANDBOX" && (
            <div>
              <SourceBadge source="PAYPAL_SANDBOX" />
              <div ref={btnRef} className="mt-2 min-h-12" />
              <p className="text-[11px] text-muted">PayPal Sandbox: test accounts only, no real money. Payment is confirmed only after the server verifies the capture.</p>
            </div>
          )}
          {view === "locked" && pp?.mode !== "PAYPAL_SANDBOX" && (
            <div className="space-y-2">
              <SourceBadge source="MOCK_CHECKOUT" />
              <p className="text-xs text-ink-2">PayPal Sandbox credentials are not configured on this server, so this is an offline MOCK checkout. It is labeled MOCK everywhere and is not a PayPal payment.</p>
              <div className="flex gap-2">
                <button type="button" className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white" onClick={() => mockPay("success")}>
                  Simulate payment (MOCK)
                </button>
                <button type="button" className="rounded-lg border border-line px-3 py-2 text-sm" onClick={() => mockPay("fail")}>
                  Simulate decline
                </button>
              </div>
            </div>
          )}
          {view === "paying" && <div className="text-sm text-ink-2">Confirming payment with the server…</div>}
          {view === "paid" && order && (
            <div className="space-y-1 text-sm">
              <div className="text-lg font-semibold text-good">✓ Paid — enjoy your salad</div>
              <SourceBadge source={order.order.payment_source} />
              {order.payment?.capture_id && <div className="break-all font-mono text-[10px] text-muted">capture {order.payment.capture_id}</div>}
              <div className="text-xs text-ink-2">Show this screen at the counter. Order {order.order.id}</div>
            </div>
          )}
          {view === "pending" && <div className="text-sm text-warn">Payment pending at PayPal. Your salad stays reserved; the order completes when PayPal confirms.</div>}
          {view === "failed" && <div className="text-sm text-bad">Not paid{order?.order.failure_reason ? ` (${order.order.failure_reason})` : ""}. No inventory was taken.</div>}
          {view === "expired" && <div className="text-sm text-warn">The 5-minute price lock expired before payment. Nothing was charged. Get a new quote at the current price.</div>}
          {(view === "paid" || view === "failed" || view === "expired" || view === "pending") && (
            <button type="button" onClick={reset} className="w-full rounded-lg border border-line py-2 text-sm">
              Back to store
            </button>
          )}
        </div>
      )}
      <p className="mt-6 text-center text-[11px] text-muted">Retail Pricing OS demo storefront · USD · {pp?.mode === "PAYPAL_SANDBOX" ? "PayPal Sandbox" : "offline mock checkout"}</p>
    </main>
  );
}
