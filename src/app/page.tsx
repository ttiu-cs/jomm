import Link from "next/link";
import { db } from "@/lib/server/http";
import { listShops } from "@/lib/teach/catalog";
import { SiteFooter, SiteHeader } from "@/components/shells";

export const dynamic = "force-dynamic";

const HOW = [
  { icon: "📷", title: "Show and talk", body: "Walk through your shop with the camera on. Your agent asks how many, what price, the lowest you’d take and what buyers should know." },
  { icon: "🤝", title: "Your agent sells", body: "Buyer agents and shoppers ask questions and make offers. Your agent answers with what you said and never goes below your private lowest price." },
  { icon: "💳", title: "Paid via PayPal", body: "The buyer approves in PayPal. Stock updates and the money shows up on your phone." },
];

export default function Home() {
  const shops = listShops(db());
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4">
        <section className="py-10 sm:py-14">
          <p className="text-sm font-semibold text-s1">AI seller agents for the smallest sellers</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">Show your shop to the camera. Your AI agent sells it.</h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-2">
            Buyer agents are starting to shop for people. A fruit stand or a closet seller has no catalog and no developer. Here they just talk, and their agent negotiates and gets paid
            through PayPal.
          </p>
          <div className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-2">
            <Link href="/seller" className="rounded-2xl bg-accent p-5 text-white shadow-sm">
              <div className="text-lg font-bold">I sell things →</div>
              <div className="mt-1 text-sm text-white/85">Get your seller agent in a minute. Fruit stand, market stall, closet.</div>
            </Link>
            <Link href="/market" className="rounded-2xl border border-line bg-surface p-5 hover:border-s1/60">
              <div className="text-lg font-bold">Watch a buyer agent shop →</div>
              <div className="mt-1 text-sm text-ink-2">Ask for “2 lb of sweet apples under $6” and see the deal happen.</div>
            </Link>
          </div>
        </section>

        <section className="grid gap-4 border-t border-line py-10 md:grid-cols-3">
          {HOW.map((h, i) => (
            <div key={h.title}>
              <div className="text-3xl" aria-hidden>
                {h.icon}
              </div>
              <h2 className="mt-2 font-semibold">
                {i + 1}. {h.title}
              </h2>
              <p className="mt-1 text-sm text-ink-2">{h.body}</p>
            </div>
          ))}
        </section>

        {shops.length > 0 && (
          <section className="border-t border-line py-10">
            <h2 className="font-semibold">Shops with a seller agent</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {shops.map((s) => (
                <Link key={s.id} href={`/shop/${s.id}`} className="rounded-full border border-line bg-surface px-4 py-2 text-sm hover:border-s1/60">
                  {s.name} · {s.items} items
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
