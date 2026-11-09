import Link from "next/link";
import { db } from "@/lib/server/http";
import { listShops } from "@/lib/teach/catalog";
import { SiteFooter, SiteHeader } from "@/components/shells";
import { HeroPhone } from "@/components/HeroPhone";
import { IconCamera, IconLock } from "@/components/icons";

export const dynamic = "force-dynamic";

export default function Home() {
  const shops = listShops(db());
  return (
    <div>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="px-5 pt-14 text-center sm:pt-20">
          <p className="text-[21px] font-semibold">Stallkeeper</p>
          <h1 className="display mx-auto mt-1 max-w-3xl text-[48px] leading-[1.05] sm:text-[72px]">Your stall. Now with an assistant.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-[21px] leading-snug text-label-2 sm:text-[24px]">
            Show it your stock and talk. It sells to shoppers and their AI agents, haggles within your limits, and gets you paid with PayPal.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <Link href="/seller" className="rounded-full bg-blue px-6 py-3 text-[17px] text-white hover:bg-blue-hover">
              Start selling
            </Link>
            <Link href="/market" className="text-[17px] text-link hover:underline">
              Watch a buyer agent shop ›
            </Link>
          </div>
          <div className="mx-auto mt-12 max-w-[1024px] overflow-hidden rounded-[28px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/photos/hero-vendor-phone.jpg" alt="A fruit seller talking on her phone at her stall" className="aspect-[16/10] w-full object-cover sm:aspect-[16/8]" />
          </div>
        </section>

        {/* Teach by talking */}
        <section className="mt-20 bg-canvas px-5 py-20">
          <div className="mx-auto grid max-w-[1024px] items-center gap-14 lg:grid-cols-2">
            <div>
              <h2 className="display text-[40px] leading-tight sm:text-[56px]">Teach it the way you’d teach a new helper.</h2>
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
            <h2 className="display text-center text-[40px] leading-tight sm:text-[48px]">Small stall. Serious assistant.</h2>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              <div className="overflow-hidden rounded-[28px] bg-canvas">
                <div className="p-7">
                  <IconCamera size={30} className="text-blue" />
                  <h3 className="mt-3 text-[24px] font-semibold leading-tight">Talk, don’t type.</h3>
                  <p className="mt-2 text-[17px] text-label-2">No catalog, no forms. If you can describe it to a customer, it’s listed.</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/photos/strawberries-basket.jpg" alt="" className="aspect-[4/3] w-full object-cover" />
              </div>
              <div className="overflow-hidden rounded-[28px] bg-canvas">
                <div className="p-7">
                  <IconLock size={30} className="text-blue" />
                  <h3 className="mt-3 text-[24px] font-semibold leading-tight">Never below your price.</h3>
                  <p className="mt-2 text-[17px] text-label-2">Your lowest price stays private. The assistant haggles above it, and gives more ground on what must go today.</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/photos/white-peaches.jpg" alt="" className="aspect-[4/3] w-full object-cover" />
              </div>
              <div className="overflow-hidden rounded-[28px] bg-canvas">
                <div className="p-7">
                  <span className="text-[30px] font-semibold leading-none text-[#003087]">PayPal</span>
                  <h3 className="mt-3 text-[24px] font-semibold leading-tight">Paid the moment they agree.</h3>
                  <p className="mt-2 text-[17px] text-label-2">The buyer approves in PayPal. Stock and money update on your phone. Agents can’t pay without a person.</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/photos/seller-portrait.jpg" alt="" className="aspect-[4/3] w-full object-cover object-top" />
              </div>
            </div>
          </div>
        </section>

        {shops.length > 0 && (
          <section className="px-5 pb-20">
            <div className="mx-auto max-w-[1024px]">
              <h2 className="text-[28px] font-semibold">Open now</h2>
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
