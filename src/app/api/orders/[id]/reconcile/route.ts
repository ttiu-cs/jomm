import { handle, db } from "@/lib/server/http";
import { reconcileOrder } from "@/lib/server/commerce";
import { getPayPalApi } from "@/lib/paypal/client";
import { DomainError } from "@/lib/server/util";
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const api = getPayPalApi();
  if (!api) throw new DomainError("PAYPAL_NOT_CONFIGURED", "PayPal Sandbox is not configured.", 409);
  return reconcileOrder(db(), api, (await params).id);
});
