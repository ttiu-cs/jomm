import { handle, db } from "@/lib/server/http";
import { acceptCounter, buyerView } from "@/lib/server/negotiation";
import { voiceLastSellerLine } from "@/lib/server/voice";
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = (await params).id;
  acceptCounter(db(), id);
  await voiceLastSellerLine(db(), id);
  return buyerView(db(), id);
});
