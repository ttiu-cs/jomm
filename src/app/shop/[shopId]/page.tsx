import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/http";
import { shopPage } from "@/lib/teach/catalog";
import { SiteFooter, SiteHeader } from "@/components/shells";

export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Public shop page: what a shopper sees from a shared link. No lowest prices, no internals. */
export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  let data: ReturnType<typeof shopPage>;
  try {
    data = shopPage(db(), shopId);
  } catch {
    notFound();
  }
  const photos = new Map(
    (db().prepare("SELECT product_id, photo FROM product_knowledge WHERE store_id=?").all(shopId) as { product_id: string; photo: string | null }[]).map((r) => [r.product_id, r.photo]),
  );
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-[1024px] px-5 pb-20 pt-12">
        <h1 className="display text-[44px] leading-tight sm:text-[56px]">{data.shop.name}</h1>
        <p className="mt-2 text-[19px] text-label-2">Tap anything to ask the stall’s assistant, make an offer, or pay with PayPal.</p>
        {data.items.length === 0 && <p className="mt-10 text-[17px] text-label-2">Nothing for sale right now. Check back after the morning delivery.</p>}
        <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3">
          {data.items.map((i) => {
            const photo = photos.get(i.productId);
            return (
              <Link key={i.sku} href={`/s/${shopId}/${encodeURIComponent(i.sku)}`} className="group block">
                <div className="overflow-hidden rounded-[22px] bg-canvas">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="aspect-square w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                  ) : (
                    <div className="grid aspect-square place-items-center text-label-3">No photo</div>
                  )}
                </div>
                <div className="mt-3 text-[17px] font-semibold">{i.name}</div>
                <div className="tnum text-[17px]">
                  {usd(i.listPriceCents)}
                  <span className="text-label-2">{i.unit === "each" ? "" : ` / ${i.unit}`}</span>
                </div>
                <div className="text-[14px] text-label-2">{i.available > 0 ? (i.negotiable ? "Offers welcome" : `${i.available} available`) : "Sold out"}</div>
              </Link>
            );
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
