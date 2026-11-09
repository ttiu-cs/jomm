"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const BRAND = "Retail Pricing OS";

/** Public pages (home, buyer agent, shop pages): two clear audiences. */
export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-bold tracking-tight">
          {BRAND}
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/market" className={`hidden rounded-md px-3 py-1.5 sm:inline ${path.startsWith("/market") ? "bg-surface-2 font-semibold" : "text-ink-2 hover:text-ink"}`}>
            Try a buyer agent
          </Link>
          <Link href="/seller" className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-white">
            For sellers
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted">
        <span>Payments: PayPal Sandbox (test money) when configured, otherwise a labeled offline mock.</span>
        <span className="flex flex-wrap gap-3">
          <span>Under the hood:</span>
          <Link className="underline" href="/demo/salad">
            Pricing engine demo
          </Link>
          <Link className="underline" href="/merchant">
            Command center
          </Link>
          <Link className="underline" href="/lab">
            Lab
          </Link>
          <Link className="underline" href="/agent">
            Agent API
          </Link>
        </span>
      </div>
    </footer>
  );
}

const TABS = [
  { key: "", label: "Home", icon: "🏠" },
  { key: "/teach", label: "Teach", icon: "📷" },
  { key: "/items", label: "Items", icon: "🏷️" },
  { key: "/deals", label: "Deals", icon: "💬" },
] as const;

/** Seller app frame: shop name on top, four tabs (bottom bar on phones, top tabs on desktop). */
export function SellerShell({ shopId, shopName, children }: { shopId: string; shopName: string; children: ReactNode }) {
  const path = usePathname();
  const base = `/seller/${shopId}`;
  const active = TABS.find((t) => t.key && path.startsWith(base + t.key))?.key ?? "";
  const teaching = active === "/teach";
  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-[11px] text-muted">My shop</div>
            <div className="truncate font-bold">{shopName}</div>
          </div>
          <nav className="hidden gap-1 lg:flex">
            {TABS.map((t) => (
              <Link key={t.key} href={base + t.key} className={`rounded-md px-3 py-1.5 text-sm ${active === t.key ? "bg-surface-2 font-semibold" : "text-ink-2 hover:text-ink"}`}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-xs">
            <Link href={`/shop/${shopId}`} className="rounded-md border border-line px-2 py-1 text-ink-2 hover:text-ink">
              View my shop page
            </Link>
            <Link href="/seller?switch=1" className="text-muted underline">
              Switch
            </Link>
          </div>
        </div>
      </header>
      {children}
      {!teaching && (
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface lg:hidden print:hidden">
          {TABS.map((t) => (
            <Link key={t.key} href={base + t.key} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active === t.key ? "font-semibold text-accent" : "text-ink-2"}`}>
              <span className="text-lg" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export function rememberShop(id: string) {
  try {
    localStorage.setItem("rpos.shopId", id);
  } catch {
    /* storage unavailable: fine */
  }
}
export function rememberedShop(): string | null {
  try {
    return localStorage.getItem("rpos.shopId");
  } catch {
    return null;
  }
}
