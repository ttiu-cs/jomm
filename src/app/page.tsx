import Link from "next/link";
import { db } from "@/lib/server/http";
import { listShops } from "@/lib/teach/catalog";
import { SiteFooter, SiteHeader } from "@/components/shells";
import { HeroPhone } from "@/components/HeroPhone";
import { DealReplay } from "@/components/DealReplay";
import { IconCamera, IconLock } from "@/components/icons";

export const dynamic = "force-dynamic";

export default function Home() {
  const shops = listShops(db());
  return (
    <div>
      <SiteHeader />
      <main>
        {/* Hero: the deal happening, right away */}
        <section className="px-5 pt-10 sm:pt-14">
          <div className="mx-auto grid max-w-[1024px] items-center gap-10 lg:grid-cols-[1fr_420px]">
            <div className="text-center lg:text-left">
              <p className="hand text-[26px]">For the stall on the corner</p>
              <h1 className="display mt-1 text-[46px] leading-[1.04] sm:text-[64px]">Your stall. Now with a helping hand.</h1>
              <p className="mt-4 text-[20px] leading-snug text-label-2 sm:text-[22px]">
                Show it what came in this morning and talk, the way you’d brief a new helper. Then it haggles with shoppers’ AI agents like you would, and gets you paid with PayPal.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 lg:justify-start">
                <Link href="/seller" className="rounded-full bg-brand px-6 py-3 text-[17px] text-white hover:bg-brand-hover">
                  Start selling
                </Link>
                <Link href="/market?auto=1" className="text-[17px] text-link hover:underline">
                  Watch a buyer agent shop ›
                </Link>
              </div>
            </div>
            <div>
              <p className="mb-3 text-center text-[15px] font-medium text-label-2 lg:text-left">
                <span className="rec-dot mr-1.5 inline-block h-2 w-2 rounded-full bg-[#ff3b30] align-middle" />
                A shopper’s agent haggling with the stall’s agent
              </p>
              <DealReplay />
            </div>
          </div>
          <figure className="mx-auto mt-14 max-w-[1024px]">
            <div className="overflow-hidden rounded-[28px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/photos/hero-vendor.jpg" alt="A young vendor wiping fruit at his street stall" className="warm-photo aspect-[16/10] w-full object-cover sm:aspect-[16/7]" />
            </div>
            <figcaption className="hand mt-3 text-[24px]">He’s busy with the crates. His agent is busy with the customers.</figcaption>
          </figure>
        </section>

        {/* Teach by talking */}
        <section className="mt-20 bg-canvas px-5 py-20">
          <div className="mx-auto grid max-w-[1024px] items-center gap-14 lg:grid-cols-2">
            <div>
              <h2 className="display text-[40px] leading-tight sm:text-[56px]">Teach it like you’d teach a new helper.</h2>
              <p className="hand mt-2 text-[26px]">“These are sweet. Don’t go under $2.35.”</p>
              <p className="mt-4 text-[19px] leading-relaxed text-label-2">
                Point your phone at a crate and say what it is. Your assistant asks for what it still needs: how many, the price, the lowest you’d take, and whether it has to go
                today. Every answer becomes a product, ready to sell.
              </p>
              <Link href="/seller" className="mt-5 inline-block text-[19px] text-link hover:underline">
                Try it with a sample fruit stand ›
              </Link>
            </div>
            <HeroPhone />
          </div>
        </section>

        {/* Three promises */}
        <section className="px-5 py-20">
          <div className="mx-auto max-w-[1024px]">
            <h2 className="display text-center text-[40px] leading-tight sm:text-[48px]">Small stall. Big help.</h2>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              <div className="overflow-hidden rounded-[28px] bg-canvas">
                <div className="p-7">
                  <IconCamera size={30} className="text-brand" />
                  <h3 className="mt-3 text-[24px] font-semibold leading-tight">Talk, don’t type.</h3>
                  <p className="mt-2 text-[17px] text-label-2">No catalog, no forms. If you can describe it to a customer, it’s listed.</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/photos/strawberries-market.jpg" alt="" className="warm-photo aspect-[4/3] w-full object-cover" />
              </div>
              <div className="overflow-hidden rounded-[28px] bg-canvas">
                <div className="p-7">
                  <IconLock size={30} className="text-brand" />
                  <h3 className="mt-3 text-[24px] font-semibold leading-tight">Never below your price.</h3>
                  <p className="mt-2 text-[17px] text-label-2">Your lowest price stays private. The assistant haggles above it, and gives more ground on what must go today.</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/photos/peaches-hand.jpg" alt="" className="warm-photo aspect-[4/3] w-full object-cover" />
              </div>
              <div className="overflow-hidden rounded-[28px] bg-canvas">
                <div className="p-7">
                  <span className="text-[30px] font-semibold leading-none text-[#003087]">PayPal</span>
                  <h3 className="mt-3 text-[24px] font-semibold leading-tight">Paid the moment they agree.</h3>
                  <p className="mt-2 text-[17px] text-label-2">The buyer approves in PayPal. Stock and money update on your phone. Agents can’t pay without a person.</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/photos/seller-setup.jpg" alt="" className="warm-photo aspect-[4/3] w-full object-cover" />
              </div>
            </div>
          </div>
        </section>

        {shops.length > 0 && (
          <section className="px-5 pb-20">
            <div className="mx-auto max-w-[1024px]">
              <h2 className="text-[28px] font-semibold">Open now</h2>
              <p className="hand text-[22px]">Go say hi.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {shops.map((s) => (
                  <Link key={s.id} href={`/shop/${s.id}`} className="rounded-full bg-canvas px-5 py-3 text-[17px] hover:bg-fill">
                    {s.name} <span className="text-label-2">· {s.items} items</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
