import { handle, db, readJson } from "@/lib/server/http";
import { confirmWithPayPal } from "@/lib/agentic/paypal-toolkit";
import { DomainError } from "@/lib/server/util";
export const runtime = "nodejs";
// After the shopper approves, the buyer agent checks the payment with the PayPal Agent Toolkit (get_order).
export const POST = handle(async (req: Request) => {
  const b = await readJson<{ orderId?: string }>(req);
  if (!b.orderId) throw new DomainError("VALIDATION", "orderId required", 422);
  return confirmWithPayPal(db(), b.orderId);
});
