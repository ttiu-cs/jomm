import { handle, db, resolveProductId } from "@/lib/server/http";
import { storefrontState } from "@/lib/server/state";
export const dynamic = "force-dynamic";
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ storeId: string; sku: string }> }) => {
  const { storeId, sku } = await params;
  const d = db();
  return storefrontState(d, resolveProductId(d, sku, storeId));
});
