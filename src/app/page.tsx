import Link from "next/link";
import { TopNav } from "@/components/ui";

const SCREENS = [
  { href: "/merchant", title: "Merchant Command Center", body: "Stock, costs, the published price and the AI recommendation with its reasons. Policy guardrails, approval or autopilot, and the demo time machine." },
  { href: "/shop", title: "Mobile Storefront", body: "The shopper sees the published price, locks it into a 5-minute server quote and pays with PayPal Sandbox. Inventory drops once, after a verified capture." },
  { href: "/lab", title: "Pricing Lab", body: "Fixed vs adaptive pricing on identical seeded synthetic days, with sensitivity to a wrong demand model. Labeled synthetic throughout." },
  { href: "/agent", title: "Seller-Agent API", body: "Scoped tokens let any seller agent read context, request a recommendation and publish only within merchant policy." },
];

export default function Home() {
  return (
    <div>
      <TopNav active="home" />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-sm font-semibold text-s1">Pricing Intelligence for Every Seller Agent</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-bold tracking-tight">Every buyer agent knows how to find the best price. Every seller agent should know how to set one.</h1>
        <p className="mt-4 max-w-2xl text-ink-2">
          Retail Pricing OS decides, publishes and transacts prices grounded in cost, demand, inventory and time. This demo runs one SKU end to end: a freshly made salad
          with 100 units, a sell-by deadline and a lunch rush.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {SCREENS.map((s) => (
            <Link key={s.href} href={s.href} className="rounded-xl border border-line bg-surface p-5 transition hover:border-s1/60">
              <h2 className="font-semibold">{s.title} →</h2>
              <p className="mt-1 text-sm text-ink-2">{s.body}</p>
            </Link>
          ))}
        </div>
        <p className="mt-8 text-xs text-muted">
          Walk-in demand, history and lab results are synthetic and labeled as such. Storefront payments are real PayPal Sandbox transactions when credentials are set, and a
          clearly labeled MOCK otherwise. Not a markdown tool: prices move up and down only when economics, policy and confidence support it.
        </p>
      </main>
    </div>
  );
}
