import { Suspense } from "react";
import SellerHome from "./SellerHome";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return (
    <Suspense>
      <SellerHome shopId={shopId} />
    </Suspense>
  );
}
