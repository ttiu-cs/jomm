import { handle, db } from "@/lib/server/http";
import { getItemBySku } from "@/lib/teach/catalog";
export const dynamic = "force-dynamic";
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ shopId: string; sku: string }> }) => {
  const { shopId, sku } = await params;
  return getItemBySku(db(), shopId, decodeURIComponent(sku));
});
