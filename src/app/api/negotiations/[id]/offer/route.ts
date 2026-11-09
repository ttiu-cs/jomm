import { handle, db, readJson } from "@/lib/server/http";
import { buyerView, makeOffer } from "@/lib/server/negotiation";
import { voiceLastSellerLine } from "@/lib/server/voice";
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const b = await readJson<{ offerCents?: number }>(req);
  const id = (await params).id;
  makeOffer(db(), id, Number(b.offerCents));
  await voiceLastSellerLine(db(), id);
  return buyerView(db(), id);
});
