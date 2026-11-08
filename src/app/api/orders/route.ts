import { handle, db, readJson } from "@/lib/server/http";
import { createOrderFromQuote, orderView } from "@/lib/server/commerce";
import { DomainError } from "@/lib/server/util";
export const POST = handle(async (req: Request) => {
  const b = await readJson<{ quoteId?: string }>(req);
  if (!b.quoteId) throw new DomainError("VALIDATION", "quoteId required", 422);
  const d = db();
  return orderView(d, createOrderFromQuote(d, b.quoteId).id);
});
