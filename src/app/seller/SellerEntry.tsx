"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/format";
import { SiteHeader, rememberShop, rememberedShop } from "@/components/shells";

interface SessionLite {
  shopId: string;
}

/** Seller entry: straight to your shop if we know it; otherwise one field and go. */
export default function SellerEntry({ shops }: { shops: { id: string; name: string; items: number }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (params.get("switch")) return;
    const id = rememberedShop();
    if (id && shops.some((s) => s.id === id)) router.replace(`/seller/${id}`);
  }, [params, router, shops]);

  const open = async (fn: () => Promise<SessionLite>, toTeach: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const s = await fn();
      rememberShop(s.shopId);
      router.push(`/seller/${s.shopId}${toTeach ? "/teach" : ""}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="mx-auto grid max-w-[1024px] gap-10 px-5 pb-20 pt-10 lg:grid-cols-2 lg:items-center lg:pt-16">
        <div className="overflow-hidden rounded-[28px] max-lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/photos/seller-setup.jpg" alt="A vendor setting out produce at his market table" className="warm-photo aspect-[4/5] w-full object-cover" />
        </div>
        <div>
          <p className="hand text-[28px]">Nice to meet you.</p>
          <h1 className="display text-[40px] leading-tight sm:text-[48px]">What’s your shop called?</h1>
          <p className="mt-3 text-[19px] text-label-2">That’s the only thing you type. Everything else, you tell your assistant out loud.</p>
          {err && <p className="mt-4 rounded-2xl bg-red/10 px-4 py-3 text-red">{err}</p>}
          <form
            className="mt-7 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length >= 2) open(() => api<SessionLite>("/api/teach/sessions", { shopName: name }), true);
            }}
          >
            <input
              autoFocus
              aria-label="Shop name"
              className="w-full rounded-[14px] border border-separator bg-card px-4 py-4 text-[19px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
              placeholder="Sunny Fruit Stand"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
            <button type="submit" disabled={busy || name.trim().length < 2} className="w-full rounded-[14px] bg-brand py-4 text-[17px] font-semibold text-white hover:bg-brand-hover disabled:opacity-40">
              {busy ? "Opening camera…" : "Continue"}
            </button>
          </form>

          {shops.length > 0 && (
            <section className="mt-10">
              <h2 className="px-4 text-[13px] uppercase tracking-wide text-label-2">Your shops</h2>
              <ul className="mt-1.5 overflow-hidden rounded-[14px] bg-card">
                {shops.map((s, i) => (
                  <li key={s.id} className={i ? "border-t border-line" : ""}>
                    <button
                      type="button"
                      onClick={() => {
                        rememberShop(s.id);
                        router.push(`/seller/${s.id}`);
                      }}
                      className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[17px] hover:bg-fill/50"
                    >
                      {s.name}
                      <span className="text-label-3">
                        {s.items} items <span aria-hidden>›</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <h2 className="px-4 text-[13px] uppercase tracking-wide text-label-2">Just looking</h2>
            <div className="mt-1.5 overflow-hidden rounded-[14px] bg-card">
              <button type="button" disabled={busy} onClick={() => open(() => api<SessionLite>("/api/teach/example", { script: "fruit" }), true)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[17px] hover:bg-fill/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/photos/apples-box.jpg" alt="" className="h-10 w-10 rounded-[9px] object-cover" />
                <span className="flex-1">Sample fruit stand</span>
                <span className="text-label-3">›</span>
              </button>
              <button type="button" disabled={busy} onClick={() => open(() => api<SessionLite>("/api/teach/example", { script: "closet" }), true)} className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left text-[17px] hover:bg-fill/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/photos/denim-jacket.jpg" alt="" className="h-10 w-10 rounded-[9px] object-cover" />
                <span className="flex-1">Sample closet</span>
                <span className="text-label-3">›</span>
              </button>
            </div>
            <p className="px-4 pt-2 text-[13px] text-label-2">Opens a shop that’s already been taught, so you can see what the assistant learned.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
