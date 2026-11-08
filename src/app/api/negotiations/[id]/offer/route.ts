import { handle, db, readJson } from "@/lib/server/http";
import { makeOffer } from "@/lib/server/negotiation";
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const b = await readJson<{ offerCents?: number }>(req);
  return makeOffer(db(), (await params).id, Number(b.offerCents));
});
