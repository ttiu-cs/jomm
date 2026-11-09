"use client";
import Link from "next/link";
import { useState } from "react";
import { useSeller } from "@/lib/client/seller";
import { usd } from "@/lib/client/format";
import { HangTag } from "@/components/HangTag";
import { IconCamera, IconQr } from "@/components/icons";

export default function SellerItems({ shopId }: { shopId: string }) {
  const { data: d, error } = useSeller(shopId);
  const [view, setView] = useState<"stock" | "labels">("stock");
  if (!d) return <main className="p-6 text-ink-2">{error ?? "Loading…"}</main>;
  const per = (u: string) => (u === "each" ? "" : `/${u}`);
  return (
    <main className="mx-auto max-w-4xl px-4 pb-10 pt-5 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div role="tablist" className="inline-flex rounded-full bg-surface-2 p-1">
          {(["stock", "labels"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full px-4 py-2 font-bold ${view === v ? "bg-surface text-leaf shadow-sm" : "text-ink-2"}`}
            >
              {v === "stock" ? `What’s for sale (${d.items.length})` : "QR price tags"}
            </button>
          ))}
        </div>
        {view === "labels" ? (
          <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 rounded-full bg-leaf px-4 py-2 font-bold text-white">
            <IconQr size={18} /> Print tags
          </button>
        ) : (
          <Link href={`/seller/${shopId}/teach`} className="flex items-center gap-1.5 rounded-full bg-leaf px-4 py-2 font-bold text-white">
            <IconCamera size={18} /> Add items
          </Link>
        )}
      </div>

      {d.items.length === 0 && (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-line p-8 text-center">
          <p className="text-lg">Nothing for sale yet.</p>
          <Link href={`/seller/${shopId}/teach`} className="mt-3 inline-block rounded-full bg-leaf px-5 py-2.5 font-bold text-white">
            Show your first item to the camera
          </Link>
        </div>
      )}

      {view === "stock" ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {d.items.map((i) => (
            <div key={i.productId}>
              <HangTag t={{ name: i.name, unit: i.unit, quantity: i.available, listPriceCents: i.listPriceCents, floorPriceCents: i.floorCents, sellBy: i.sellBy, facts: i.facts, condition: i.condition }} />
              <div className="mt-2 flex items-center justify-between px-1 text-sm text-ink-2">
                <span>
                  {i.sold} sold{i.available === 0 ? " · sold out" : ""}
                </span>
                <Link href={`/s/${shopId}/${encodeURIComponent(i.sku)}`} className="font-bold text-leaf underline-offset-2 hover:underline">
                  Shopper view
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 print:mt-0 print:grid-cols-3">
          {d.items.map((i) => (
            <div key={i.sku} className="tag break-inside-avoid pb-3 pl-9 pr-3 pt-3 text-center">
              <div className="font-sign text-xl font-bold leading-tight">{i.name}</div>
              <div className="font-sign text-3xl font-extrabold">
                {usd(i.listPriceCents)}
                <span className="text-base">{per(i.unit)}</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/shops/${shopId}/qr/${encodeURIComponent(i.sku)}`} alt={`QR code for ${i.name}`} className="mx-auto mt-1 h-28 w-28 rounded bg-white p-1" />
              <div className="mt-1 text-xs">Scan to ask, offer and pay with PayPal</div>
              <div className="font-mono text-[10px] opacity-70">{i.sku}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
