import SellerDashboard from "./SellerDashboard";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <SellerDashboard shopId={shopId} />;
}
