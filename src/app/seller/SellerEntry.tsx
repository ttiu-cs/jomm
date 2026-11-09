"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/format";
import { SiteHeader, rememberShop, rememberedShop } from "@/components/shells";

interface SessionLite {
  shopId: string;
}

/** Seller entry: go straight to your shop if we know it; otherwise name your shop in one step. */
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
      <main className="mx-auto max-w-lg space-y-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Get your AI seller agent</h1>
          <p className="mt-2 text-ink-2">Name your shop, then show it to the camera and talk. No forms, no catalog needed.</p>
        </div>
        {err && <div className="rounded-lg border border-bad/40 px-3 py-2 text-sm text-bad">{err}</div>}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) open(() => api<SessionLite>("/api/teach/sessions", { shopName: name }), true);
          }}
        >
          <label className="block space-y-1">
            <span className="text-sm font-medium">Shop name</span>
            <input
              autoFocus
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-lg"
              placeholder="e.g. Sunny Fruit Stand, Mina's Closet"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </label>
          <button type="submit" disabled={busy || name.trim().length < 2} className="w-full rounded-xl bg-accent py-3 text-lg font-semibold text-white disabled:opacity-40">
            {busy ? "Opening…" : "Start with the camera →"}
          </button>
        </form>

        {shops.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Already have a shop?</h2>
            {shops.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  rememberShop(s.id);
                  router.push(`/seller/${s.id}`);
                }}
                className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-left hover:border-s1/50"
              >
                <span className="font-semibold">{s.name}</span>
                <span className="text-sm text-ink-2">{s.items} items →</span>
              </button>
            ))}
          </section>
        )}

        <section className="space-y-2 rounded-xl border border-dashed border-line p-4">
          <h2 className="text-sm font-semibold">Just looking? Try an example</h2>
          <p className="text-sm text-ink-2">Replays a short walk-through so you can see what the agent learns. No camera needed.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => open(() => api<SessionLite>("/api/teach/example", { script: "fruit" }), true)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              🍎 Fruit stand
            </button>
            <button type="button" disabled={busy} onClick={() => open(() => api<SessionLite>("/api/teach/example", { script: "closet" }), true)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              🧥 Closet
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
