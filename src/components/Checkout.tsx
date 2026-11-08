"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/format";
import { SourceBadge } from "@/components/ui";

type PayPalButtons = { render: (el: HTMLElement) => Promise<void>; close?: () => Promise<void> };
declare global {
  interface Window {
    paypal?: { Buttons: (opts: Record<string, unknown>) => PayPalButtons };
  }
}

export interface OrderView {
  order: { id: string; status: string; payment_source: string; total_cents: number; failure_reason: string | null };
  payment: { provider_order_id: string | null; capture_id: string | null; verified: number } | null;
}

function loadPayPalSdk(clientId: string): Promise<void> {
  if (window.paypal) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the PayPal SDK (network?)"));
    document.head.appendChild(s);
  });
}

/** PayPal Sandbox buttons for a server-created order, or a clearly labeled MOCK when no credentials. */
export function Checkout({ orderId, onDone }: { orderId: string; onDone: (o: OrderView) => void }) {
  const [cfg, setCfg] = useState<{ mode: string; clientId: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ mode: string; clientId: string | null }>("/api/paypal/config")
      .then(setCfg)
      .catch(() => setCfg({ mode: "MOCK_CHECKOUT", clientId: null }));
  }, []);

  useEffect(() => {
    if (cfg?.mode !== "PAYPAL_SANDBOX" || !cfg.clientId || !ref.current) return;
    const el = ref.current;
    let buttons: PayPalButtons | null = null;
    let cancelled = false;
    const refresh = () => api<OrderView>(`/api/orders/${orderId}`).then(onDone);
    loadPayPalSdk(cfg.clientId)
      .then(() => {
        if (cancelled || !window.paypal) return;
        buttons = window.paypal.Buttons({
          style: { layout: "vertical", shape: "rect", label: "pay" },
          createOrder: async () => (await api<{ paypalOrderId: string }>("/api/paypal/orders", { orderId })).paypalOrderId,
          onApprove: async (data: { orderID: string }, actions: { restart: () => Promise<void> }) => {
            setBusy(true);
            try {
              onDone(await api<OrderView>(`/api/paypal/orders/${data.orderID}/capture`, {}));
            } catch (e) {
              const m = e instanceof Error ? e.message : String(e);
              if (/declined/i.test(m)) {
                setErr("Funding source declined. Choose another method.");
                return actions.restart();
              }
              setErr(m);
              refresh().catch(() => {});
            } finally {
              setBusy(false);
            }
          },
          onCancel: async () => {
            await api(`/api/orders/${orderId}/cancel`, {}).catch(() => {});
            refresh().catch(() => {});
          },
          onError: (e: unknown) => setErr(`PayPal error: ${e instanceof Error ? e.message : String(e)}`),
        });
        return buttons.render(el);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      buttons?.close?.().catch(() => {});
      el.innerHTML = "";
    };
  }, [cfg, orderId, onDone]);

  const mock = async (outcome: "success" | "fail") => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/orders/${orderId}/mock-pay`, { outcome });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    onDone(await api<OrderView>(`/api/orders/${orderId}`));
    setBusy(false);
  };

  if (!cfg) return <div className="text-sm text-ink-2">Loading checkout…</div>;
  return (
    <div className="space-y-2">
      {err && <div className="rounded-md border border-bad/40 px-2 py-1 text-sm text-bad">{err}</div>}
      {cfg.mode === "PAYPAL_SANDBOX" ? (
        <>
          <SourceBadge source="PAYPAL_SANDBOX" />
          <div ref={ref} className="min-h-12" />
          <p className="text-[11px] text-muted">PayPal Sandbox (test money). Paid only after the server verifies the capture.</p>
        </>
      ) : (
        <>
          <SourceBadge source="MOCK_CHECKOUT" />
          <p className="text-xs text-ink-2">No PayPal Sandbox keys on this server, so this is an offline MOCK payment. It is not a PayPal payment.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => mock("success")}>
              Pay (MOCK)
            </button>
            <button type="button" disabled={busy} className="rounded-lg border border-line px-3 py-2 text-sm" onClick={() => mock("fail")}>
              Decline
            </button>
          </div>
        </>
      )}
      {busy && <div className="text-xs text-ink-2">Confirming payment with the server…</div>}
    </div>
  );
}
