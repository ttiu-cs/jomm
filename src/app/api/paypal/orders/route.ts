import { handle, db, readJson } from "@/lib/server/http";
import { createPayPalOrder } from "@/lib/server/commerce";
import { getPayPalApi, PayPalHttpError } from "@/lib/paypal/client";
import { DomainError } from "@/lib/server/util";
export const POST = handle(async (req: Request) => {
  const api = getPayPalApi();
  if (!api) throw new DomainError("PAYPAL_NOT_CONFIGURED", "PayPal Sandbox credentials are not configured (MOCK mode).", 409);
  const b = await readJson<{ orderId?: string }>(req);
  if (!b.orderId) throw new DomainError("VALIDATION", "orderId required", 422);
  try {
    return await createPayPalOrder(db(), api, b.orderId);
  } catch (e) {
    if (e instanceof PayPalHttpError) throw new DomainError("PAYPAL_ERROR", `PayPal rejected order creation (${e.status} ${e.issue ?? ""})`, 502);
    throw e;
  }
});
