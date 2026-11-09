/**
 * The official PayPal Agent Toolkit (@paypal/agent-toolkit, OpenAI flavor), Sandbox only.
 *
 * The buyer agent gets read-only PayPal tools (get_order). Creating and capturing the PayPal order
 * stay on the server's own Orders v2 path, which locks the amount from the agreed quote, uses
 * idempotency keys and verifies the capture before a sale counts.
 */
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import type { DB } from "../db/client";
import { orderView } from "../server/commerce";
import { readPayPalConfig } from "../paypal/client";
import type { Trace } from "./buyer-agent";

let cached: PayPalAgentToolkit | null | undefined;

export function getPayPalToolkit(): PayPalAgentToolkit | null {
  if (cached !== undefined) return cached;
  const cfg = readPayPalConfig();
  cached =
    cfg.mode === "sandbox" && cfg.config
      ? new PayPalAgentToolkit({
          clientId: cfg.config.clientId,
          clientSecret: cfg.config.clientSecret,
          configuration: { actions: { orders: { get: true } }, context: { sandbox: true } },
        })
      : null;
  return cached;
}

/** After the shopper approves, the buyer agent checks the PayPal order itself with the toolkit's get_order. */
export async function confirmWithPayPal(db: DB, orderId: string): Promise<{ checked: boolean; status?: string; amount?: string; trace: Trace; message: string }> {
  const o = orderView(db, orderId);
  const ppId = o.payment?.provider_order_id;
  const toolkit = getPayPalToolkit();
  if (o.order.payment_source !== "PAYPAL_SANDBOX" || !ppId || !toolkit) {
    return {
      checked: false,
      message: "Practice payment, so there is no PayPal order to check.",
      trace: { method: "—", path: "PayPal Agent Toolkit · get_order", concept: "Skipped: practice payment (PayPal Sandbox keys not set)", result: "PayPal not called", paypal: true },
    };
  }
  const out = await toolkit.handleToolCall({ id: `call_${orderId}`, type: "function", function: { name: "get_order", arguments: JSON.stringify({ id: ppId }) } } as never);
  let status: string | undefined;
  let amount: string | undefined;
  try {
    const body = JSON.parse(String((out as { content?: unknown }).content ?? "{}"));
    status = body.status;
    const pu = body.purchase_units?.[0];
    amount = pu?.amount?.value ? `${pu.amount.value} ${pu.amount.currency_code}` : undefined;
  } catch {
    /* toolkit returned an error string */
  }
  return {
    checked: true,
    status,
    amount,
    message: status === "COMPLETED" ? `PayPal confirms the order is COMPLETED${amount ? ` (${amount})` : ""}.` : `PayPal says the order is ${status ?? "unknown"}.`,
    trace: { method: "TOOL", path: "PayPal Agent Toolkit · get_order", concept: "Buyer agent checks the payment with PayPal itself", result: `${ppId} · ${status ?? "?"}${amount ? ` · ${amount}` : ""}`, paypal: true, json: { tool: "get_order", id: ppId, status, amount } },
  };
}
