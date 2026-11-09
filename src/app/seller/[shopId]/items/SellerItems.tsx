"use client";
import Link from "next/link";
import { useState } from "react";
import { useSeller } from "@/lib/client/seller";
import { usd } from "@/lib/client/format";
import { ItemCard } from "@/components/ItemCard";

export default function SellerItems({ shopId }: { shopId: string }) {
  const { data: d, error } = useSeller(shopId);
  const [view, setView] = useState<"items" | "labels">("items");
  if (!d) return <main className="p-6 text-label-2">{error ?? "Loading…"}</main>;
  const per = (u: string) => (u === "each" ? "" : ` / ${u}`);
  return (
    <main className="mx-auto max-w-[900px] px-5 pb-10 pt-6 print:max-w-none print:p-0">
      <div className="flex items-end justify-between gap-3 print:hidden">
        <h1 className="text-[34px] font-bold tracking-tight">Items</h1>
        {view === "labels" ? (
          <button type="button" onClick={() => window.print()} className="text-[17px] text-link">
            Print
          </button>
        ) : (
          <Link href={`/seller/${shopId}/teach`} className="text-[17px] text-link">
            Add
          </Link>
        )}
      </div>
      <div role="tablist" className="mt-3 grid grid-cols-2 rounded-[9px] bg-fill p-0.5 text-[13px] font-medium print:hidden">
        {(["items", "labels"] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} type="button" onClick={() => setView(v)} className={`rounded-[7px] py-1.5 ${view === v ? "bg-card shadow-sm" : "text-label"}`}>
            {v === "items" ? `For sale (${d.items.length})` : "QR price tags"}
          </button>
        ))}
      </div>

      {d.items.length === 0 && (
        <div className="mt-8 rounded-[22px] bg-card p-8 text-center">
          <p className="text-[17px] text-label-2">Nothing for sale yet.</p>
          <Link href={`/seller/${shopId}/teach`} className="mt-4 inline-block rounded-full bg-brand px-5 py-2.5 text-[15px] font-medium text-white">
            Show your first item
          </Link>
        </div>
      )}

      {view === "items" ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {d.items.map((i) => (
            <div key={i.productId}>
              <ItemCard t={{ name: i.name, unit: i.unit, quantity: i.available, listPriceCents: i.listPriceCents, floorPriceCents: i.floorCents, sellBy: i.sellBy, facts: i.facts, condition: i.condition, photo: i.photo ?? null }} />
              <div className="mt-2 flex items-center justify-between px-2 text-[13px] text-label-2">
                <span>
                  {i.sold} sold{i.available === 0 ? " · sold out" : ""}
                </span>
                <Link href={`/s/${shopId}/${encodeURIComponent(i.sku)}`} className="text-link">
                  View as shopper
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 print:mt-0 print:grid-cols-3">
          {d.items.map((i) => (
            <div key={i.sku} className="break-inside-avoid rounded-[18px] border border-line bg-white p-4 text-center">
              <div className="text-[17px] font-semibold">{i.name}</div>
              <div className="tnum text-[28px] font-semibold">
                {usd(i.listPriceCents)}
                <span className="text-[15px] font-normal text-label-2">{per(i.unit)}</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/shops/${shopId}/qr/${encodeURIComponent(i.sku)}`} alt={`QR code for ${i.name}`} className="mx-auto mt-2 h-28 w-28" />
              <div className="mt-2 text-[12px] text-label-2">Scan to ask, make an offer and pay with PayPal</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
