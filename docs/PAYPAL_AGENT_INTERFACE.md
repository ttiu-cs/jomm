# PayPal agent interface

How a buyer agent finds Rosa’s stall, talks to her seller agent, and pays with PayPal. Every call below appears live in the **PayPal agent interface** panel on `/demo`.

## What PayPal offers for agent commerce (public sources, Nov 2026)
- **Agent Ready**: lets existing PayPal merchants accept payments started by AI agents. PayPal’s docs list three paths: the Agentic Commerce Protocol (ACP, e.g. ChatGPT) via Braintree, the Universal Commerce Protocol (UCP) via Braintree, and UCP with PayPal using the Orders v2 API.
- **Store Sync**: publishes a merchant’s catalog, inventory and fulfillment data to AI shopping surfaces.
- **Agent Toolkit / MCP server**: lets agents call PayPal APIs (orders, invoices, shipment tracking and more) as tools.

Stallkeeper is built so a small stall can show up in that world: a product feed agents can read, checkout sessions in the ACP shape with PayPal as the payment provider, and payment through PayPal Orders v2.

## Flow
```
buyer agent                         Stallkeeper (Rosa's seller agent)              PayPal
    | GET  /api/agentic/feed?shop=  ->  items, prices, owner's words (no floors)
    | POST /api/shops/{s}/items/{sku}/ask -> answer from Rosa's facts
    | POST /api/agentic/checkout_sessions {items, negotiation.offer_per_unit}
    |                               <-  status not_ready_for_payment, counter
    | POST /api/agentic/checkout_sessions/{id} {negotiation: offer | accept_counter}
    |                               <-  ready_for_payment, agreed price locked 5 min
    | POST /api/agentic/checkout_sessions/{id}/complete -> order created
    |                                   server: POST /v2/checkout/orders ------------> create
    | shopper approves in PayPal  --------------------------------------------------> approve
    |                                   server: POST /v2/checkout/orders/{id}/capture -> capture
    |                               <-  status completed; Rosa's phone: "You received $7.95"
```

## Checkout session (response shape)
```json
{
  "id": "neg_…",
  "object": "checkout_session",
  "status": "not_ready_for_payment | ready_for_payment | in_progress | completed | canceled",
  "currency": "usd",
  "merchant": { "id": "st_…", "name": "Rosa’s Fruit Stand" },
  "line_items": [{ "id": "RFS-WHITE-PEACHES-002", "item": { "title": "White peaches", "unit": "lb", "quantity": 3 }, "base_amount": 1137, "discount": 342, "total": 795 }],
  "totals": [{ "type": "items_base_amount", "amount": 1137 }, { "type": "discount", "amount": 342 }, { "type": "total", "amount": 795 }],
  "payment_provider": { "provider": "paypal", "supported_payment_methods": ["paypal"], "mode": "test | practice" },
  "negotiation": { "status": "OPEN | AGREED | CLOSED", "offers_left": 1, "seller_counter_per_unit": 240, "seller_counter_is_final": false, "agreed_per_unit": null, "price_held_until": null },
  "messages": [{ "type": "info", "content_type": "plain", "content": "Let’s meet in the middle: $2.40 a pound…" }],
  "order": { "id": "ord_…", "status": "PAID", "payment_source": "PAYPAL_SANDBOX", "paypal_order_id": "…", "capture_id": "…" }
}
```
Amounts are integer cents.

## Rules the server enforces
- The owner’s lowest price (floor) and the agent’s walk-away price are never in any buyer-facing response.
- Prices and totals come from the server (published price or a server-side agreement), never from the agent’s request.
- An agent can’t pay. Completing a session creates an order; the shopper approves it in PayPal; the sale counts only after the server captures and verifies it with PayPal (or a webhook it trusts).
- Without PayPal Sandbox keys, payments run as a clearly labeled practice payment and are never shown as real PayPal payments.

## What is real and what is modeled
| Part | Status |
|---|---|
| PayPal Orders v2 create / capture / verify, webhooks | Real against PayPal Sandbox when `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` are set; tested with an in-memory fake |
| Checkout sessions | Our endpoints, shaped after ACP checkout sessions (create / update / get / complete / cancel). Not certified against the ACP spec, and not connected to PayPal Agent Ready or Braintree onboarding |
| `negotiation` extension | Our addition; not part of ACP, UCP or any PayPal API |
| Product feed | Our endpoint, in the spirit of Store Sync; not connected to PayPal Store Sync |
| Rosa’s teaching | Scripted replay through the real teaching parser and publish step |

## Next steps toward production
1. Enroll the merchant in PayPal Agent Ready and Store Sync (existing PayPal business account).
2. Make the checkout session endpoints conform to the ACP (or UCP) spec version PayPal supports, and declare PayPal as the payment handler.
3. Offer the negotiation step as an optional extension; plain agents can always buy at the listed price.

## Sources
- PayPal Agent Ready overview: https://developer.paypal.com/agent-ready/overview
- Agent Ready, ACP integration: https://docs.paypal.ai/growth/agentic-commerce/agent-ready/agentic-commerce-protocol-integration
- PayPal agentic commerce launch (Agent Ready, Store Sync): https://newsroom.paypal-corp.com/2025-10-28-PayPal-Launches-Agentic-Commerce-Services-to-Power-AI-Driven-Shopping
- PayPal agent tools / MCP server: https://developer.paypal.com/ai-tools/agent-tools
