"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconCamera, IconChat, IconHome, IconTag } from "./icons";

export const BRAND = "Jomm.";

/**
 * The Jomm. wordmark. The "o" is one ring split on a 25° diagonal: the dark half is the shopper's
 * agent, the orange half the stall's agent, meeting in a deal. Its stroke matches the letters; the
 * full stop is a brand-colour dot.
 */
export function Wordmark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-bold leading-none tracking-[-0.04em] text-label ${className}`} style={{ fontSize: size }} aria-label="Jomm.">
      <span aria-hidden>J</span>
      <svg aria-hidden viewBox="0 0 100 100" className="mx-[0.03em] inline-block" style={{ width: "0.6em", height: "0.6em", transform: "translateY(0.02em)" }}>
        <path d="M65.85 16.01 A37.5 37.5 0 0 1 34.15 83.99" fill="none" stroke="var(--brand)" strokeWidth="25"/>
        <path d="M34.15 83.99 A37.5 37.5 0 0 1 65.85 16.01" fill="none" stroke="currentColor" strokeWidth="25"/>
      </svg>
      <span aria-hidden>mm</span>
      <span aria-hidden className="ml-[0.05em] inline-block rounded-full bg-brand" style={{ width: "0.24em", height: "0.24em" }} />
    </span>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center" aria-label="Jomm. home">
      <Wordmark size={21} />
    </Link>
  );
}

/** Public pages: frosted global nav, as on apple.com. */
export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="frosted sticky top-0 z-40 border-b border-black/5">
      <div className="mx-auto flex h-12 max-w-[1024px] items-center justify-between gap-3 px-5">
        <Logo />
        <nav className="flex items-center gap-5 text-[14px]">
          <Link href="/demo" className={path.startsWith("/demo") ? "font-medium text-label" : "text-label-2 hover:text-label"}>
            Demo
          </Link>
          <Link href="/seller" className="rounded-full bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">
            Start selling
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-canvas">
      <div className="mx-auto max-w-[1024px] px-5 py-6 text-[12px] leading-relaxed text-label-2">
        <p className="border-b border-separator/70 pb-4">
          Payments use PayPal Sandbox (test money) when it is configured, and a clearly marked practice checkout when it is not. Photos: Pexels.
        </p>
        <p className="pt-4">
          For developers:{" "}
          <Link className="text-link hover:underline" href="/demo/salad">
            Pricing engine
          </Link>{" "}
          ·{" "}
          <Link className="text-link hover:underline" href="/merchant">
            Hourly pricing
          </Link>{" "}
          ·{" "}
          <Link className="text-link hover:underline" href="/lab">
            Lab
          </Link>{" "}
          ·{" "}
          <Link className="text-link hover:underline" href="/agent">
            Agent API
          </Link>
        </p>
      </div>
    </footer>
  );
}

const TABS = [
  { key: "", label: "Today", Icon: IconHome },
  { key: "/teach", label: "Teach", Icon: IconCamera },
  { key: "/items", label: "Items", Icon: IconTag },
  { key: "/deals", label: "Sales", Icon: IconChat },
] as const;

/** Seller app shell: iOS-style frosted top bar and tab bar. */
export function SellerShell({ shopId, shopName, children }: { shopId: string; shopName: string; children: ReactNode }) {
  const path = usePathname();
  const base = `/seller/${shopId}`;
  const active = TABS.find((t) => t.key && path.startsWith(base + t.key))?.key ?? "";
  const teaching = active === "/teach";
  return (
    <div className="min-h-screen bg-canvas pb-24 lg:pb-0">
      <header className={`frosted sticky top-0 z-30 border-b border-black/5 print:hidden ${teaching ? "max-lg:hidden" : ""}`}>
        <div className="mx-auto flex h-12 max-w-[1024px] items-center justify-between gap-3 px-5">
          <span className="truncate text-[17px] font-semibold">{shopName}</span>
          <nav className="hidden gap-1 lg:flex">
            {TABS.map(({ key, label }) => (
              <Link
                key={key}
                href={base + key}
                aria-current={active === key ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-[14px] ${active === key ? "bg-label text-white" : "text-label-2 hover:text-label"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4 text-[14px]">
            <Link href={`/shop/${shopId}`} className="text-link hover:underline" title="See your shop the way shoppers and their agents see it">
              View my shop ›
            </Link>
          </div>
        </div>
      </header>
      {children}
      {!teaching && (
        <nav className="frosted fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-black/10 pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden" aria-label="Seller sections">
          {TABS.map(({ key, label, Icon }) => (
            <Link
              key={key}
              href={base + key}
              aria-current={active === key ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium ${active === key ? "text-brand" : "text-label-3"}`}
            >
              <Icon size={25} />
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
