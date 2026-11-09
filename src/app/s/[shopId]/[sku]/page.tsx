import ItemPage from "./ItemPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ shopId: string; sku: string }> }) {
  const { shopId, sku } = await params;
  return <ItemPage shopId={shopId} sku={decodeURIComponent(sku)} />;
}
