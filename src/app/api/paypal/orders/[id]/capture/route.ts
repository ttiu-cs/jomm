import { handle, db } from "@/lib/server/http";
import { capturePayPalOrder, orderView } from "@/lib/server/commerce";
import { getPayPalApi } from "@/lib/paypal/client";
import { DomainError } from "@/lib/server/util";
// Server-side capture + verification. The client only passes the PayPal order id.
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const api = getPayPalApi();
  if (!api) throw new DomainError("PAYPAL_NOT_CONFIGURED", "PayPal Sandbox is not configured.", 409);
  const d = db();
  const outcome = await capturePayPalOrder(d, api, (await params).id);
  return { outcome, ...orderView(d, outcome.orderId) };
});
