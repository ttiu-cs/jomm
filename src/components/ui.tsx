import type { ReactNode } from "react";
import Link from "next/link";

export function Card({ title, children, right, className = "" }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-surface p-4 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className="tnum text-xl font-semibold text-ink">{value}</div>
      {sub && <div className="text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

const SOURCE_STYLE: Record<string, { label: string; cls: string; icon: string }> = {
  SIMULATED: { label: "SIMULATED", cls: "border-line bg-surface-2 text-ink-2", icon: "◌" },
  SYNTHETIC_HISTORY: { label: "SYNTHETIC", cls: "border-line bg-surface-2 text-ink-2", icon: "◌" },
  PAYPAL_SANDBOX: { label: "Paid with PayPal (Sandbox)", cls: "border-paypal/30 bg-paypal/10 text-paypal", icon: "✓" },
  MOCK_CHECKOUT: { label: "Practice payment, not PayPal", cls: "border-warn/50 bg-warn/10 text-warn", icon: "!" },
  MERCHANT: { label: "MERCHANT", cls: "border-line text-ink-2", icon: "•" },
  SYSTEM: { label: "SYSTEM", cls: "border-line text-ink-2", icon: "•" },
};

export function SourceBadge({ source }: { source: string }) {
  const s = SOURCE_STYLE[source] ?? { label: source, cls: "border-line text-ink-2", icon: "•" };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  kind = "default",
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "default" | "danger";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const cls =
    kind === "primary"
      ? "bg-leaf text-white hover:bg-leaf-2"
      : kind === "danger"
        ? "border border-tomato/50 text-tomato hover:bg-tomato/10"
        : "border border-line bg-surface text-ink hover:border-leaf/40";
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-[15px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

export function ActionPill({ action }: { action: string }) {
  const m: Record<string, string> = { INCREASE: "▲ Raise", DECREASE: "▼ Lower", HOLD: "■ Hold" };
  const c: Record<string, string> = { INCREASE: "text-s1", DECREASE: "text-s2", HOLD: "text-ink-2" };
  return <span className={`whitespace-nowrap text-xs font-semibold ${c[action] ?? ""}`}>{m[action] ?? action}</span>;
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-ink-2">{children}</code>;
}

export function TopNav({ active }: { active: "merchant" | "shop" | "lab" | "agent" | "home" | "teach" | "market" | "salad" }) {
  // Developer / pricing-engine area. Sellers and shoppers use the seller app and public pages instead.
  const items = [
    ["home", "/", "← Back to app"],
    ["salad", "/demo/salad", "Negotiation engine"],
    ["merchant", "/merchant", "Hourly pricing"],
    ["shop", "/shop", "Salad storefront"],
    ["lab", "/lab", "Lab"],
    ["agent", "/agent", "Agent API"],
  ] as const;
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Link href="/" className="text-sm font-bold tracking-tight text-ink">
          Retail Pricing OS
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {items.map(([k, href, label]) => (
            <Link key={k} href={href} className={`rounded-md px-2.5 py-1 ${active === k ? "bg-surface-2 font-semibold text-ink" : "text-ink-2 hover:text-ink"}`}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
