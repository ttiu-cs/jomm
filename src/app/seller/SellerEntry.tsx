"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/format";
import { SiteHeader, rememberShop, rememberedShop } from "@/components/shells";
import { IconStore } from "@/components/icons";

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
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 pb-16 pt-10">
        <h1 className="font-sign text-5xl font-extrabold leading-[0.95] text-leaf">What’s your stall called?</h1>
        <p className="mt-3 text-lg text-ink-2">That’s the only thing you type. Everything else, you tell your assistant out loud.</p>
        {err && <p className="mt-4 rounded-xl border border-tomato/40 bg-tomato/5 px-3 py-2 text-tomato">{err}</p>}
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) open(() => api<SessionLite>("/api/teach/sessions", { shopName: name }), true);
          }}
        >
          <input
            autoFocus
            aria-label="Shop name"
            className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-4 text-xl focus:border-leaf focus:outline-none"
            placeholder="Sunny Fruit Stand"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          <button type="submit" disabled={busy || name.trim().length < 2} className="w-full rounded-full bg-leaf py-4 text-lg font-bold text-white disabled:opacity-40">
            {busy ? "Opening the camera…" : "Start teaching"}
          </button>
        </form>

        {shops.length > 0 && (
          <section className="mt-10">
            <h2 className="font-sign text-2xl font-bold">Your shops</h2>
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {shops.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      rememberShop(s.id);
                      router.push(`/seller/${s.id}`);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-leaf-soft"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-leaf-soft text-leaf">
                      <IconStore size={20} />
                    </span>
                    <span className="flex-1 font-bold">{s.name}</span>
                    <span className="text-sm text-ink-2">{s.items} items</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10 rounded-2xl bg-leaf-soft p-5">
          <h2 className="font-sign text-2xl font-bold text-leaf">Just looking around?</h2>
          <p className="mt-1 text-ink-2">Open a sample shop that’s already been taught, and see what the assistant learned.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => open(() => api<SessionLite>("/api/teach/example", { script: "fruit" }), true)} className="rounded-full bg-surface px-4 py-2 font-bold text-leaf shadow-sm">
              Sample fruit stand
            </button>
            <button type="button" disabled={busy} onClick={() => open(() => api<SessionLite>("/api/teach/example", { script: "closet" }), true)} className="rounded-full bg-surface px-4 py-2 font-bold text-leaf shadow-sm">
              Sample closet
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
