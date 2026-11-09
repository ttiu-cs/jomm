import { handle, db, readJson } from "@/lib/server/http";
import { answerQuestion, getItemBySku } from "@/lib/teach/catalog";
export const POST = handle(async (req: Request, { params }: { params: Promise<{ shopId: string; sku: string }> }) => {
  const { shopId, sku } = await params;
  const d = db();
  const item = getItemBySku(d, shopId, decodeURIComponent(sku));
  const b = await readJson<{ question?: string }>(req);
  return answerQuestion(d, item.productId, b.question ?? "");
});
