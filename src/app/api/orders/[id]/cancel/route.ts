import { handle, db } from "@/lib/server/http";
import { cancelOrder, orderView } from "@/lib/server/commerce";
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const d = db();
  const { id } = await params;
  cancelOrder(d, id);
  return orderView(d, id);
});
