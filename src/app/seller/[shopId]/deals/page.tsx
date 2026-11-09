import SellerDeals from "./SellerDeals";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <SellerDeals shopId={shopId} />;
}
