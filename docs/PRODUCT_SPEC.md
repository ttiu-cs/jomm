# Retail Pricing OS — Product Spec

**Thesis.** Every buyer agent knows how to find the best price. Every seller agent should know how to set one.
**Positioning.** Pricing Intelligence for Every Seller Agent.
**Showcase SKU.** One freshly prepared salad (`SALAD-001`), 100 units made each morning, sold 09:00–20:00.

## Problem
Retail prices are mostly static, while the economic value of an item changes continuously with demand, stock, remaining sellable time, cost and customer response. Sellers, including future AI seller agents, need a trusted way to decide, publish, quote and transact at economically justified prices.

## What the product is
| Layer | What it does | Where in this repo |
|---|---|---|
| Pricing Intelligence | Hourly demand forecast, price response, horizon-aware optimization, guardrails, confidence, reason codes, explanations | `src/lib/pricing/*` |
| Price Execution | Versioned published prices; immutable, expiring, stock-reserving quotes | `src/lib/server/pricing-service.ts`, `commerce.ts` |
| Commerce Feedback | PayPal Sandbox Orders v2 create, capture and verify; webhook reconciliation; exactly-once inventory decrement; sales feed the next decision | `src/lib/server/commerce.ts`, `src/lib/paypal/client.ts` |
| Seller-Agent Interface | Scoped bearer tokens: read context, request a recommendation, publish only within policy | `src/app/api/agent/*`, `src/lib/agent/*` |

## What it is not
- Not an end-of-day markdown tool. Prices can rise after a decline; there is no time-based discount rule. Tested in `tests/optimizer.test.ts` and `tests/simulator.test.ts`.
- Not a food ERP or recipe-costing tool. Costs are a small snapshot used only for economics.
- Not a negotiation product (DealPilot could consume this API later), and not a buyer-agent platform.
- Not a promise that every SKU should change price hourly. Changes happen only when expected gain clears the threshold and policy, cooldown and confidence allow it.

## Screens
1. **Merchant Command Center** (`/merchant`): store, SKU, stock (on hand, reserved, available), units sold by source, hours left, confidence, sell-through vs forecast; price chart with projected path and bounds; recommendation with reasons, quantitative evidence and recommend-vs-hold projections; Approve & publish, Reject, Recompute, Explain; time machine (advance hour, run to close, new day, reset) with weather, event and unforecasted-traffic controls; plain-language policy drafting with confirmation; policy editor (floor, ceiling, max step, cooldown, min gain, autopilot, below-cost, agent publish, low-confidence approval); unit economics with sunk vs incremental costs; payment activity separating SIMULATED, MOCK and PAYPAL SANDBOX.
2. **Mobile Storefront** (`/shop`): current published price and version; quantity 1–3; server quote locks the price for 5 minutes and reserves stock; PayPal Sandbox buttons (or a clearly labeled MOCK when no credentials are set); pending, paid, failed, expired and cancelled states. An accepted quote is never silently repriced.
3. **Pricing Lab** (`/lab`): deterministic seeded days, fixed vs adaptive under common random numbers, averages over N days, hour-by-hour table, and sensitivity to a misspecified demand model. Everything is labeled synthetic.
4. **Agent API console** (`/agent`): try the seller-agent endpoints with demo tokens.

## Definition of Done — status
| # | Criterion | Status |
|---|---|---|
| 1 | Seed, launch, see the salad SKU and a working dashboard | Done (`npm run seed`, `npm run dev`; empty DB auto-seeds) |
| 2 | Changing time, demand, weather or stock recomputes a justifiable price within constraints | Done |
| 3 | Prices rise or fall; no unconditional markdown | Done (tests) |
| 4 | Publishing updates the shopper price promptly | Done (SSE + polling) |
| 5 | Quote locks the price even if the published price changes | Done (test `locks the published price…`) |
| 6 | PayPal Sandbox purchase with server-verified amount and status | Implemented; verified against a fake PayPal API in tests. **Live Sandbox run still has to be done by you with credentials** (this build environment could not reach PayPal). |
| 7 | Inventory decreases exactly once on capture | Done (tests cover retries, timeouts, webhook replays) |
| 8 | Recorded sale affects the next recommendation; no false learning claim | Done (stock and sell-through calibration are state inputs; UI says "state adjustment, not training") |
| 9 | Synthetic metrics visibly labeled | Done |
| 10 | Tests pass; docs state what is real, synthetic, mocked or unavailable | Done (`docs/ASSUMPTIONS.md`) |
