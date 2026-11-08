# PayPal Integration

The adaptive price becomes a real payable offer: the server locks it into a quote, PayPal executes it, and the verified capture closes the feedback loop.

## Modes
| Mode | When | What happens | Label in UI |
|---|---|---|---|
| `PAYPAL_SANDBOX` | `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` set | Real PayPal Sandbox Orders v2 API, PayPal JS SDK buttons | `✓ PAYPAL SANDBOX · VERIFIED` once captured |
| `MOCK_CHECKOUT` | no credentials, or `PAYPAL_MODE=mock` | Offline buttons that call `/api/orders/:id/mock-pay` | `! MOCK · NOT PAYPAL` |

Mock payments use their own `payment_source` and inventory `source`. The mock endpoint returns 403 whenever Sandbox is configured, and PayPal routes refuse MOCK orders. Live (non-sandbox) API bases are rejected at startup.

## Flow
1. The shopper opens `/shop` (a QR code can point here). `GET /api/storefront?view=1` logs a VIEW exposure.
2. `POST /api/quotes` locks the current published price and version, reserves stock, and expires in 5 minutes (`QUOTE_TTL_SECONDS`).
3. `POST /api/orders` creates one internal order per quote.
4. The PayPal button's `createOrder` calls `POST /api/paypal/orders`. The server creates a PayPal order with `intent=CAPTURE`, amount = quote total, `custom_id` = `invoice_id` = internal order ID, and `PayPal-Request-Id: create-<orderId>`.
5. The shopper approves in the PayPal popup (Sandbox personal account).
6. `onApprove` calls `POST /api/paypal/orders/:paypalOrderId/capture`. The server:
   - refuses to capture if the quote lapsed (order → EXPIRED; nothing charged);
   - moves the order `AWAITING_APPROVAL → CAPTURING` with a conditional update;
   - captures with `PayPal-Request-Id: capture-<orderId>`, so retries are idempotent at PayPal;
   - verifies capture `status`, `amount.value`, `currency_code` and `custom_id` against the order;
   - in one transaction: order `PAID`, quote `CONSUMED`, one `SALE` movement (`UNIQUE(order_id)`), PURCHASE exposure, audit.
7. SSE pushes the update to the merchant dashboard; the next recommendation sees the lower stock.

## Failure handling
| Case | Behavior |
|---|---|
| Buyer cancels | `onCancel` → order CANCELLED, reservation released, ABANDON exposure |
| `INSTRUMENT_DECLINED` | order back to AWAITING_APPROVAL; buttons call `actions.restart()` |
| Other capture 4xx | order FAILED, reservation released |
| Network timeout during capture | stays CAPTURING (stock remains reserved); server immediately re-fetches the PayPal order; `/api/orders/:id/reconcile` and webhooks finish it later |
| `ORDER_ALREADY_CAPTURED` | fetch order, verify, apply idempotently |
| Capture `PENDING` | order PAYMENT_PENDING, reservation kept past quote TTL; completes on webhook or reconcile |
| Amount / currency / reference mismatch | order FAILED, no inventory change, audit `payment.mismatch` flagged for manual refund |
| Duplicate capture call or webhook replay | no-op (`alreadyProcessed: true`) |
| Store closes during in-flight capture | units held by CAPTURING/PAYMENT_PENDING orders are excluded from waste |

All of these are covered in `tests/commerce.test.ts` against an in-memory fake of the Orders v2 API.

## Webhooks (optional)
Set `PAYPAL_WEBHOOK_ID` and subscribe `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED` and `PAYMENT.CAPTURE.REVERSED` to `https://<host>/api/paypal/webhook`. Each event is:
1. verified via `POST /v1/notifications/verify-webhook-signature` (unverified events are rejected with 401 and recorded);
2. deduplicated by event ID;
3. not trusted alone: the server re-fetches the PayPal order and applies the same verification as capture.

Refunds and reversals are only recorded for manual handling (out of MVP scope).

## Setting up Sandbox (manual steps)
1. Go to https://developer.paypal.com → Apps & Credentials → Sandbox → Create App (Merchant). Copy the Client ID and Secret.
2. Add them to `.env.local` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Leave `PAYPAL_MODE` empty or set it to `sandbox`.
3. Use a Sandbox **personal** account (Testing Tools → Sandbox Accounts) to pay.
4. Optional: create a webhook for your public URL, then set `PAYPAL_WEBHOOK_ID`.
5. Restart the server. The header badge should show `PAYPAL SANDBOX`.

## Scope limits (verify before promising)
USD only. No production money movement, refunds, payouts or autonomous buyer-agent funding. PayPal in-store, POS, Store Sync and agentic-commerce programs have country, eligibility and access restrictions; check current PayPal documentation before claiming support.
