import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/http";
import { shopPage } from "@/lib/teach/catalog";
import { SiteHeader } from "@/components/shells";

export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Public shop page: what a shopper sees from a shared link. No floors, no internals. */
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
      <main className="mx-auto max-w-4xl px-4 py-6">
        <p className="text-sm text-ink-2">Ask the seller agent anything, make an offer, pay with PayPal.</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{data.shop.name}</h1>
        {data.items.length === 0 && <p className="mt-6 text-ink-2">Nothing for sale right now.</p>}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.items.map((i) => {
            const photo = photos.get(i.productId);
            return (
              <Link key={i.sku} href={`/s/${shopId}/${encodeURIComponent(i.sku)}`} className="overflow-hidden rounded-xl border border-line bg-surface transition hover:border-s1/60">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-surface-2 text-4xl" aria-hidden>
                    🛍️
                  </div>
                )}
                <div className="p-3">
                  <div className="truncate font-semibold">{i.name}</div>
                  <div className="tnum font-bold">
                    {usd(i.listPriceCents)}
                    <span className="text-xs font-normal text-ink-2">{i.unit === "each" ? "" : `/${i.unit}`}</span>
                  </div>
                  <div className="text-xs text-ink-2">
                    {i.available > 0 ? `${i.available} ${i.unit} left` : "Sold out"}
                    {i.negotiable ? " · offers welcome" : ""}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
