import Link from "next/link";
import { db } from "@/lib/server/http";
import { listShops } from "@/lib/teach/catalog";
import { SiteFooter, SiteHeader } from "@/components/shells";
import { HeroPhone } from "@/components/HeroPhone";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "Show it and say it",
    body: "Point your phone at each crate or hanger and talk. Your assistant asks what it still needs: how many, the price, the lowest you’d take, and whether it has to go today.",
  },
  {
    title: "Your assistant handles buyers",
    body: "Shoppers scan a price tag, and buyer agents ask on someone’s behalf. Your assistant answers with your words and haggles, never below your lowest price.",
  },
  {
    title: "PayPal pays you",
    body: "The buyer approves in PayPal. The sale, the stock left and the money show up on your phone.",
  },
];

export default function Home() {
  const shops = listShops(db());
  return (
    <div className="overflow-x-hidden">
      <SiteHeader />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div>
            <h1 className="font-sign text-[56px] font-extrabold leading-[0.92] text-leaf sm:text-[76px]">
              Show your stall to the camera. Your assistant does the selling.
            </h1>
            <p className="mt-5 max-w-xl text-xl leading-relaxed text-ink-2">
              Buyer agents are starting to shop for people. Stallkeeper gives fruit stands, market stalls and closet sellers an AI shop assistant you teach by talking. It
              knows your stock, haggles inside your limits and gets you paid through PayPal.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/seller" className="rounded-full bg-leaf px-7 py-4 text-center text-lg font-bold text-white hover:bg-leaf-2">
                Start selling
              </Link>
              <Link href="/market" className="rounded-full border-2 border-leaf/30 px-7 py-4 text-center text-lg font-bold text-leaf hover:border-leaf">
                Watch a buyer agent shop
              </Link>
            </div>
            <p className="mt-4 text-sm text-ink-2">No catalog, no forms. If you can describe it to a customer, you can sell it here.</p>
          </div>
          <HeroPhone />
        </section>

        <section className="bg-leaf py-16 text-white">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="font-sign text-4xl font-bold">How it works</h2>
            <ol className="mt-8 grid gap-10 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="font-sign block text-6xl font-extrabold leading-none text-sticker">{i + 1}</span>
                  <h3 className="mt-2 text-xl font-bold">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-white/85">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {shops.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 py-14">
            <h2 className="font-sign text-3xl font-bold">Open right now</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {shops.map((s) => (
                <Link key={s.id} href={`/shop/${s.id}`} className="rounded-full bg-surface px-5 py-3 font-bold shadow-[0_1px_0_var(--line)] hover:text-leaf">
                  {s.name} <span className="font-normal text-ink-2">({s.items} items)</span>
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
