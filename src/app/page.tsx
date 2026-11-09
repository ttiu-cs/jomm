import Link from "next/link";
import { TopNav } from "@/components/ui";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: 1,
    href: "/teach",
    title: "Teach by talking",
    body: "Turn on the camera and walk through your shop. Your seller agent asks how many, what price, the lowest you’d take and what buyers should know. Product cards, SKUs and stock appear as you talk.",
    cta: "Open the camera",
  },
  {
    n: 2,
    href: "/market",
    title: "Your agent sells to buyer agents",
    body: "A buyer agent asks for “2 lb of sweet apples under $5”. Your agent answers with what you said, negotiates inside your limits, and never goes below your floor.",
    cta: "Watch a buyer agent shop",
  },
  {
    n: 3,
    href: "/teach",
    title: "Paid through PayPal",
    body: "The agreed price is locked, the buyer approves in PayPal, stock goes down, and the sale shows up on your dashboard, along with QR shelf labels for walk-in shoppers.",
    cta: "Start with step 1",
  },
];

export default function Home() {
  return (
    <div>
      <TopNav active="home" />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-sm font-semibold text-s1">Seller agents for the smallest sellers</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">Show your shop to the camera. Your AI seller agent takes it from there.</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-2">
          Buyer agents are starting to shop for people. A fruit stand or a closet seller has no catalog and no developer. Here they teach an agent by talking, and it sells,
          negotiates and gets paid through PayPal.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <Link key={s.n} href={s.href} className="flex flex-col rounded-2xl border border-line bg-surface p-5 transition hover:border-s1/60">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{s.n}</span>
              <h2 className="mt-3 text-lg font-semibold">{s.title}</h2>
              <p className="mt-1 flex-1 text-sm text-ink-2">{s.body}</p>
              <span className="mt-3 text-sm font-semibold text-s1">{s.cta} →</span>
            </Link>
          ))}
        </div>
        <div className="mt-10 rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2">
          <div className="font-semibold text-ink">Under the hood</div>
          <p className="mt-1">
            Seller agents negotiate from the owner’s floor and deadline. For time-sensitive stock there is a full pricing engine (forecast demand, stock, waste cost):{" "}
            <Link className="underline" href="/demo/salad">
              salad negotiation demo
            </Link>
            ,{" "}
            <Link className="underline" href="/merchant">
              hourly pricing command center
            </Link>
            ,{" "}
            <Link className="underline" href="/lab">
              pricing lab
            </Link>
            ,{" "}
            <Link className="underline" href="/agent">
              agent API
            </Link>
            .
          </p>
          <p className="mt-2 text-xs text-muted">Payments run on PayPal Sandbox (test money) when keys are set; otherwise a clearly labeled offline mock. Demand figures in the pricing engine are synthetic.</p>
        </div>
      </main>
    </div>
  );
}
