import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/http";
import { shopPage } from "@/lib/teach/catalog";
import { SiteHeader } from "@/components/shells";

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
      <div className="bg-leaf text-white">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <h1 className="font-sign text-5xl font-extrabold leading-none">{data.shop.name}</h1>
          <p className="mt-2 text-white/85">Tap anything to ask the stall’s assistant, make an offer or pay with PayPal.</p>
        </div>
      </div>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {data.items.length === 0 && <p className="text-ink-2">Nothing for sale right now. Check back after the morning delivery.</p>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3">
          {data.items.map((i) => {
            const photo = photos.get(i.productId);
            return (
              <Link key={i.sku} href={`/s/${shopId}/${encodeURIComponent(i.sku)}`} className="group block">
                <div className="overflow-hidden rounded-2xl bg-surface-2">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="aspect-square w-full object-cover transition group-hover:scale-[1.03]" />
                  ) : (
                    <div className="grid aspect-square place-items-center text-ink-2">No photo</div>
                  )}
                </div>
                <div className="tag relative -mt-6 ml-2 mr-1 pb-2 pl-8 pr-3 pt-2">
                  <div className="font-sign truncate text-lg font-bold leading-tight">{i.name}</div>
                  <div className="font-sign tnum text-2xl font-extrabold leading-none">
                    {usd(i.listPriceCents)}
                    <span className="text-sm font-semibold">{i.unit === "each" ? "" : `/${i.unit}`}</span>
                  </div>
                  <div className="text-xs">{i.available > 0 ? (i.negotiable ? "Offers welcome" : `${i.available} left`) : "Sold out"}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
