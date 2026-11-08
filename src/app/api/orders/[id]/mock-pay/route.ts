import { handle, db, readJson } from "@/lib/server/http";
import { payMockOrder } from "@/lib/server/commerce";
import { paymentMode } from "@/lib/paypal/client";
import { DomainError } from "@/lib/server/util";
// OFFLINE MOCK ONLY. Disabled whenever PayPal Sandbox credentials are configured.
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  if (paymentMode() !== "MOCK_CHECKOUT") throw new DomainError("MOCK_DISABLED", "Mock checkout is disabled when PayPal Sandbox is configured.", 403);
  const b = await readJson<{ outcome?: "success" | "fail" }>(req);
  return payMockOrder(db(), (await params).id, b.outcome === "fail" ? "fail" : "success");
});
