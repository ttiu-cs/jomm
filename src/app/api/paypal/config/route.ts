import { handle } from "@/lib/server/http";
import { paymentMode } from "@/lib/paypal/client";
export const dynamic = "force-dynamic";
// Public config only: the client ID is public by design; the secret never leaves the server.
export const GET = handle(() => ({ mode: paymentMode(), clientId: paymentMode() === "PAYPAL_SANDBOX" ? process.env.PAYPAL_CLIENT_ID : null, currency: "USD" }));
