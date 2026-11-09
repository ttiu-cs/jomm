"use client";
import Link from "next/link";
import { useState } from "react";
import { SELL_BY_LABEL, useSeller } from "@/lib/client/seller";
import { usd } from "@/lib/client/format";

export default function SellerItems({ shopId }: { shopId: string }) {
  const { data: d, error } = useSeller(shopId);
  const [view, setView] = useState<"list" | "labels">("list");
  if (!d) return <main className="p-6 text-ink-2">{error ?? "Loading…"}</main>;
  const per = (u: string) => (u === "each" ? "" : `/${u}`);
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 print:max-w-none print:p-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
          {(["list", "labels"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 ${view === v ? "bg-surface-2 font-semibold" : "text-ink-2"}`}>
              {v === "list" ? `Items (${d.items.length})` : "QR labels"}
            </button>
          ))}
        </div>
        {view === "labels" ? (
          <button type="button" onClick={() => window.print()} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white">
            Print labels
          </button>
        ) : (
          <Link href={`/seller/${shopId}/teach`} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm">
            + Teach items
          </Link>
        )}
      </div>

      {d.items.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
          No items yet. <Link className="underline" href={`/seller/${shopId}/teach`}>Show them to the camera</Link>.
        </p>
      )}

      {view === "list" ? (
        <ul className="space-y-2">
          {d.items.map((i) => (
            <li key={i.productId} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/s/${shopId}/${encodeURIComponent(i.sku)}`} className="font-semibold hover:underline">
                    {i.name}
                  </Link>
                  <div className="font-mono text-[11px] text-muted">{i.sku}</div>
                </div>
                <div className="text-right">
                  <div className="tnum font-bold">
                    {usd(i.listPriceCents)}
                    <span className="text-xs font-normal text-ink-2">{per(i.unit)}</span>
                  </div>
                  <div className="tnum text-[11px] text-ink-2">🔒 lowest {usd(i.floorCents)}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
                <span className={i.available === 0 ? "font-semibold text-bad" : ""}>
                  {i.available === 0 ? "Sold out" : `${i.available} ${i.unit} left`}
                </span>
                <span>{i.sold} sold</span>
                <span className={i.sellBy === "today" ? "font-semibold text-warn" : ""}>{SELL_BY_LABEL[i.sellBy]}</span>
                {i.condition && <span>{i.condition}</span>}
              </div>
              {i.facts.length > 0 && <div className="mt-1 text-xs text-muted">“{i.facts.join("” · “")}”</div>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
          {d.items.map((i) => (
            <div key={i.sku} className="break-inside-avoid rounded-xl border border-line bg-white p-3 text-center text-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/shops/${shopId}/qr/${encodeURIComponent(i.sku)}`} alt={`QR code for ${i.name}`} className="mx-auto h-28 w-28" />
              <div className="mt-1 font-semibold">{i.name}</div>
              <div className="text-lg font-bold">
                {usd(i.listPriceCents)}
                {per(i.unit)}
              </div>
              <div className="font-mono text-[10px]">{i.sku}</div>
              <div className="text-[10px]">Scan · ask · offer · pay with PayPal</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
