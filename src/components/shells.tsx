"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconCamera, IconChat, IconHome, IconTag } from "./icons";

export const BRAND = "Stallkeeper";

export function Logo({ light }: { light?: boolean }) {
  return (
    <Link href="/" className={`font-sign flex items-center gap-2 text-2xl font-extrabold leading-none ${light ? "text-white" : "text-leaf"}`}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <path d="M2 9 5 3h16l3 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M2 9h22v2.5a3.7 3.7 0 0 1-7.3 0 3.7 3.7 0 0 1-7.4 0 3.7 3.7 0 0 1-7.3 0Z" fill="currentColor" />
        <path d="M4 14v9h18v-9" fill="none" stroke="currentColor" strokeWidth="2.4" />
      </svg>
      {BRAND}
    </Link>
  );
}

/** Public pages: two audiences, two links. */
export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Logo />
        <nav className="flex items-center gap-2 text-[15px]">
          <Link href="/market" className={`hidden rounded-full px-3 py-2 sm:inline ${path.startsWith("/market") ? "font-bold text-leaf" : "text-ink-2 hover:text-ink"}`}>
            Try a buyer agent
          </Link>
          <Link href="/seller" className="rounded-full bg-leaf px-4 py-2 font-bold text-white hover:bg-leaf-2">
            Sell with Stallkeeper
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 text-sm text-ink-2 sm:grid-cols-2">
        <p>Payments run on PayPal Sandbox (test money) when it is configured, and on a clearly marked practice checkout when it is not.</p>
        <p className="sm:text-right">
          For developers:{" "}
          <Link className="underline" href="/demo/salad">
            pricing engine
          </Link>
          ,{" "}
          <Link className="underline" href="/merchant">
            hourly pricing
          </Link>
          ,{" "}
          <Link className="underline" href="/lab">
            lab
          </Link>
          ,{" "}
          <Link className="underline" href="/agent">
            agent API
          </Link>
        </p>
      </div>
    </footer>
  );
}

const TABS = [
  { key: "", label: "Today", Icon: IconHome },
  { key: "/teach", label: "Teach", Icon: IconCamera },
  { key: "/items", label: "Stock", Icon: IconTag },
  { key: "/deals", label: "Sales", Icon: IconChat },
] as const;

/** Seller app: the shop's sign on top, four tabs (bottom bar on phones, inline on desktop). */
export function SellerShell({ shopId, shopName, children }: { shopId: string; shopName: string; children: ReactNode }) {
  const path = usePathname();
  const base = `/seller/${shopId}`;
  const active = TABS.find((t) => t.key && path.startsWith(base + t.key))?.key ?? "";
  const teaching = active === "/teach";
  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      <header className={`sticky top-0 z-30 bg-leaf text-white print:hidden ${teaching ? "max-lg:hidden" : ""}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <div className="font-sign truncate text-2xl font-bold leading-tight">{shopName}</div>
            <Link href={`/shop/${shopId}`} className="text-xs text-white/75 underline underline-offset-2">
              See what shoppers see
            </Link>
          </div>
          <nav className="hidden gap-1 lg:flex">
            {TABS.map(({ key, label, Icon }) => (
              <Link
                key={key}
                href={base + key}
                aria-current={active === key ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[15px] ${active === key ? "bg-white font-bold text-leaf" : "text-white/85 hover:bg-white/10"}`}
              >
                <Icon size={18} />
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/seller?switch=1" className="shrink-0 text-sm text-white/80 underline underline-offset-2">
            Switch shop
          </Link>
        </div>
      </header>
      {children}
      {!teaching && (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden" aria-label="Seller sections">
          {TABS.map(({ key, label, Icon }) => (
            <Link
              key={key}
              href={base + key}
              aria-current={active === key ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-xs ${active === key ? "font-bold text-leaf" : "text-ink-2"}`}
            >
              <Icon size={24} />
              {label}
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
