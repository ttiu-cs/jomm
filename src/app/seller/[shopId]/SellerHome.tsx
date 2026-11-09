"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSeller } from "@/lib/client/seller";
import { usd } from "@/lib/client/format";
import { rememberShop } from "@/components/shells";
import { IconCamera } from "@/components/icons";

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "Good morning! Fresh stock in?" : h < 17 ? "Afternoon! Here’s how it’s going." : "Evening. Here’s how today went.";
}

export default function SellerHome({ shopId }: { shopId: string }) {
  const { data: d, error } = useSeller(shopId);
  const opened = useSearchParams().get("opened");
  useEffect(() => rememberShop(shopId), [shopId]);

  if (!d) return <main className="p-6 text-label-2">{error ?? "Loading…"}</main>;
  const urgent = d.items.filter((i) => i.sellBy === "today" && i.available > 0);
  const low = d.items.filter((i) => i.sellBy !== "today" && i.available > 0 && i.available <= 3);
  const soldOut = d.items.filter((i) => i.available === 0);
  const deals = d.negotiations.filter((n) => n.status === "AGREED").length;
  const notes = [
    ...urgent.map((i) => ({ k: i.sku, dot: "bg-[#ff3b30]", text: `${i.name}: ${i.available} ${i.unit} must sell today. Your assistant can go down to ${usd(i.floorCents)}.` })),
    ...low.map((i) => ({ k: i.sku, dot: "bg-[#ff9500]", text: `${i.name}: only ${i.available} ${i.unit} left.` })),
    ...soldOut.map((i) => ({ k: i.sku, dot: "bg-label-3", text: `${i.name} is sold out.` })),
  ];

  return (
    <main className="mx-auto max-w-[720px] px-5 pb-10 pt-6">
      <p className="hand text-[26px]">{greeting()}</p>
      <h1 className="text-[34px] font-bold tracking-tight">Today at {d.shop.name}</h1>
      {opened && (
        <div className="rise mt-3 rounded-[14px] bg-green-fill/15 px-4 py-3 text-[15px] font-medium text-green" role="status">
          Your shop is open. Your assistant is answering buyers now.
        </div>
      )}

      <section aria-label="Money" className="mt-4 rounded-[22px] bg-card p-5">
        <div className="text-[15px] text-label-2">Received with PayPal</div>
        <div className="display tnum text-[48px] leading-none">{usd(d.totals.paypalCents)}</div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
          <div>
            <div className="tnum text-[22px] font-semibold">{d.totals.orders}</div>
            <div className="text-[13px] text-label-2">Paid orders</div>
          </div>
          <div>
            <div className="tnum text-[22px] font-semibold">{deals}</div>
            <div className="text-[13px] text-label-2">Deals by your assistant</div>
          </div>
        </div>
        {d.totals.mockCents > 0 && <p className="mt-3 text-[13px] text-warn">Plus {usd(d.totals.mockCents)} in practice payments (no real money).</p>}
      </section>

      <Link href={`/seller/${shopId}/teach`} className="relative mt-4 block overflow-hidden rounded-[22px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/photos/stall-live.jpg" alt="" className="warm-photo h-40 w-full object-cover" />
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-black/0 p-5 text-white">
          <div className="flex w-full items-center justify-between gap-3">
            <div>
              <div className="text-[22px] font-semibold">{d.items.length ? "Morning walk-through" : "Teach your first items"}</div>
              <div className="text-[15px] text-white/85">Show what’s in stock and talk. About a minute.</div>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-label">
              <IconCamera size={22} />
            </span>
          </div>
        </div>
      </Link>

      {notes.length > 0 && (
        <section className="mt-7">
          <h2 className="px-4 text-[13px] uppercase tracking-wide text-label-2">Needs attention</h2>
          <ul className="mt-1.5 overflow-hidden rounded-[14px] bg-card">
            {notes.map((n, i) => (
              <li key={n.k + i} className={`flex items-start gap-3 px-4 py-3 text-[15px] ${i ? "border-t border-line" : ""}`}>
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.dot}`} aria-hidden />
                {n.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-7">
        <div className="flex items-baseline justify-between px-4">
          <h2 className="text-[13px] uppercase tracking-wide text-label-2">Your assistant’s activity</h2>
          <Link href={`/seller/${shopId}/deals`} className="text-[15px] text-link">
            See all
          </Link>
        </div>
        {d.negotiations.length === 0 ? (
          <div className="mt-1.5 rounded-[14px] bg-card p-5 text-[15px] text-label-2">
            No buyers yet.{" "}
            <Link href={`/seller/${shopId}/items`} className="text-link">
              Print QR price tags
            </Link>{" "}
            or{" "}
            <Link href="/market" className="text-link">
              send a test buyer agent
            </Link>
            .
          </div>
        ) : (
          <ul className="mt-1.5 overflow-hidden rounded-[14px] bg-card">
            {d.negotiations.slice(0, 4).map((n, i) => (
              <li key={n.id} className={`px-4 py-3 ${i ? "border-t border-line" : ""}`}>
                <div className="flex items-baseline justify-between gap-2 text-[17px]">
                  <span>
                    {n.name} × {n.qty}
                    {n.unit === "each" ? "" : ` ${n.unit}`}
                  </span>
                  <span className={`text-[15px] font-semibold ${n.status === "AGREED" ? "text-green" : "text-label-2"}`}>
                    {n.status === "AGREED" ? `Sold · ${usd(n.agreed_price_cents)}` : n.status === "OPEN" ? "Talking…" : "No deal"}
                  </span>
                </div>
                {n.last_message && <p className="mt-0.5 line-clamp-2 text-[14px] text-label-2">{n.last_message}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
