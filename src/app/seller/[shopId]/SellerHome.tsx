"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSeller } from "@/lib/client/seller";
import { usd } from "@/lib/client/format";
import { rememberShop } from "@/components/shells";
import { IconCamera, IconClock, IconQr } from "@/components/icons";

export default function SellerHome({ shopId }: { shopId: string }) {
  const { data: d, error } = useSeller(shopId);
  const opened = useSearchParams().get("opened");
  useEffect(() => rememberShop(shopId), [shopId]);

  if (!d) return <main className="p-6 text-ink-2">{error ?? "Loading…"}</main>;
  const urgent = d.items.filter((i) => i.sellBy === "today" && i.available > 0);
  const low = d.items.filter((i) => i.sellBy !== "today" && i.available > 0 && i.available <= 3);
  const soldOut = d.items.filter((i) => i.available === 0);
  const deals = d.negotiations.filter((n) => n.status === "AGREED").length;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-5">
      {opened && (
        <div className="mb-4 rounded-2xl bg-sticker px-4 py-3 font-bold text-ink" role="status">
          Your shop is open. Your assistant is answering buyers now.
        </div>
      )}

      <section aria-label="Money today" className="rounded-3xl bg-surface p-5 shadow-[0_1px_0_var(--line)]">
        <div className="text-ink-2">Received through PayPal</div>
        <div className="font-sign tnum text-6xl font-extrabold leading-none text-leaf">{usd(d.totals.paypalCents)}</div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-ink-2">
          <span>
            <b className="text-ink">{d.totals.orders}</b> paid orders
          </span>
          <span>
            <b className="text-ink">{deals}</b> deals your assistant made
          </span>
          {d.totals.mockCents > 0 && <span className="text-warn">{usd(d.totals.mockCents)} in practice payments</span>}
        </div>
      </section>

      <Link href={`/seller/${shopId}/teach`} className="mt-4 flex items-center gap-4 rounded-3xl bg-leaf p-5 text-white hover:bg-leaf-2">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15">
          <IconCamera size={30} />
        </span>
        <span>
          <span className="font-sign block text-3xl font-bold leading-tight">{d.items.length ? "Morning walk-through" : "Teach your first items"}</span>
          <span className="block text-white/85">Show what’s in stock and talk. About a minute.</span>
        </span>
      </Link>

      {(urgent.length > 0 || low.length > 0 || soldOut.length > 0) && (
        <section className="mt-6">
          <h2 className="font-sign text-2xl font-bold">Keep an eye on</h2>
          <ul className="mt-2 space-y-2">
            {urgent.map((i) => (
              <li key={i.sku} className="flex items-start gap-3 rounded-2xl border-l-4 border-tomato bg-surface p-3">
                <IconClock className="mt-0.5 shrink-0 text-tomato" />
                <span>
                  <b>{i.name}</b>: {i.available} {i.unit} must sell today. Your assistant can go down to {usd(i.floorCents)}.
                </span>
              </li>
            ))}
            {low.map((i) => (
              <li key={i.sku} className="rounded-2xl border-l-4 border-sticker bg-surface p-3">
                <b>{i.name}</b>: only {i.available} {i.unit} left.
              </li>
            ))}
            {soldOut.map((i) => (
              <li key={i.sku} className="rounded-2xl border-l-4 border-line bg-surface p-3 text-ink-2">
                <b className="text-ink">{i.name}</b> sold out.
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-sign text-2xl font-bold">What your assistant did</h2>
          <Link href={`/seller/${shopId}/deals`} className="font-bold text-leaf underline-offset-2 hover:underline">
            All sales
          </Link>
        </div>
        {d.negotiations.length === 0 ? (
          <div className="mt-2 rounded-2xl border-2 border-dashed border-line p-5 text-ink-2">
            <p>No buyers yet. Get the word out:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/seller/${shopId}/items`} className="flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 font-bold text-leaf shadow-sm">
                <IconQr size={18} /> Print price tags with QR
              </Link>
              <Link href="/market" className="rounded-full bg-surface px-4 py-2 font-bold text-leaf shadow-sm">
                Send a test buyer
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {d.negotiations.slice(0, 4).map((n) => (
              <li key={n.id} className="rounded-2xl bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">
                    {n.name} × {n.qty}
                    {n.unit === "each" ? "" : ` ${n.unit}`}
                  </span>
                  <span className={`font-sign text-xl font-bold ${n.status === "AGREED" ? "text-leaf" : "text-ink-2"}`}>
                    {n.status === "AGREED" ? `Sold ${usd(n.agreed_price_cents)}` : n.status === "OPEN" ? "Talking…" : "No deal"}
                  </span>
                </div>
                {n.last_message && <p className="mt-1 text-sm text-ink-2">“{n.last_message}”</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
