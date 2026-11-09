import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { db } from "@/lib/server/http";
import { SellerShell } from "@/components/shells";

export const dynamic = "force-dynamic";

export default async function SellerLayout({ children, params }: { children: ReactNode; params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const shop = db().prepare("SELECT id, name FROM stores WHERE id=?").get(shopId) as { id: string; name: string } | undefined;
  if (!shop) notFound();
  return (
    <SellerShell shopId={shop.id} shopName={shop.name}>
      {children}
    </SellerShell>
  );
}
