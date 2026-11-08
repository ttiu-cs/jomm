# Architecture

One Next.js 16 app (TypeScript): the UI, the API routes and the pricing engine run in a single Node process with SQLite (better-sqlite3). No microservices. Demo reliability comes first.

```
Browser (merchant /merchant, shopper /shop, lab /lab, agent /agent)
   │  fetch + Server-Sent Events (/api/events)
   ▼
Next.js route handlers (src/app/api/**)  ── proxy.ts: optional Basic auth on merchant surfaces
   │
   ├─ pricing-service.ts   recommend / publish / reject / policy (versioned, audited)
   ├─ sim-service.ts       store clock, SIMULATED walk-in demand, close of day (waste), seed
   ├─ commerce.ts          quotes (lock + reserve), orders, PayPal create/capture/verify, webhooks, MOCK
   ├─ context.ts / state.ts read models
   │
   ├─ src/lib/pricing/     PURE, deterministic, unit-tested engine
   │    demand.ts      visits × conversion(price, hour), weather/event multipliers, Poisson helpers
   │    economics.ts   sunk vs incremental cost, fees, break-even, profit report
   │    optimizer.ts   finite-horizon DP over (hour, stock) + guardrails + reason codes
   │    simulator.ts   seeded fixed-vs-adaptive comparison + sensitivity grid
   │
   ├─ src/lib/paypal/client.ts   Orders v2 + webhook verification (server-only secret)
   ├─ src/lib/agent/             agent token auth, policy-intent drafting, optional LLM adapter
   └─ SQLite (data/pricing-os.db)
```

## Pricing engine
**Demand.** For store hour *h*, expected shoppers are `visits_h × weather × event_h × calibration`. Each buys with probability `conv(p,h) = min(0.95, base × exp(−b_h (p − ref)))`, where `b_h` is lower during the lunch peak (time-pressed shoppers). Hourly demand is Poisson.

**Objective.** Maximize expected rest-of-day contribution:

```
V_close(s) = −disposal · s
V_t(s)     = max_p E_D[ net(p)·min(D,s) + V_{t+1}(s − min(D,s)) ]
net(p)     = p − fulfillment − payment_fee(p)
```

Production cost is sunk once made, so it is excluded from the objective and reported separately as accounting COGS. Scarcity value (the opportunity cost of a unit) emerges from the DP. Prices rise when demand exceeds stock and fall when waste looms, and this is not a rule written into the code.

**Current-hour decision.** Candidates on a $0.25 grid within effective bounds. The floor is raised to full-cost break-even if the merchant disallows below-cost selling. Then come the max step from the current price (halved under low confidence), cooldown, allowed hours, and a minimum expected gain before changing. Future hours in the DP respect floor and ceiling but not the step limit (documented approximation). Exact forward propagation of the stock distribution gives expected sold, unsold, revenue and contribution for both "follow" and "hold".

**Reason codes.** LUNCH_PEAK, POST_PEAK_LULL, LOW_STOCK, EXPIRY_RISK, SLOW_SELL_THROUGH, FAST_SELL_THROUGH, WEATHER_BOOST/DRAG, EVENT_DEMAND, LATE_DAY_CLEARANCE, PRICE_RECOVERY, HOLD_LOW_GAIN, GUARDRAIL_{HOLD,COOLDOWN,STEP_LIMIT,FLOOR,CEILING,HOURS}, BELOW_COST_BLOCKED, POLICY_BOUND_ADJUST, LOW_CONFIDENCE, SOLD_OUT, STORE_CLOSED. Each comes with a numeric explanation.

**Negotiation (walk-away price).** For a one-unit negotiated sale now: if refused, the buyer still buys at the published price with probability q (assumption 0.5); otherwise the unit stays. Accept p iff `net(p) ≥ q·net(published) + (1−q)·Δ`, with `Δ = V(s) − V(s−1)` the unit's opportunity cost (both branches continue at the published price). The result is clamped to [max(floor, published × (1 − max negotiated discount)), published]. The seller concedes 35% → 70% → 100% of the gap between listed and walk-away over three buyer offers. Agreements become ordinary server-side quotes (`origin = NEGOTIATION`) and go through the same checkout. Code: `walkAwayPrice` in `optimizer.ts`, `src/lib/server/negotiation.ts`.

**Feedback loop.** Each decision snapshots inputs. Each hour's forecast is stored and later compared with the outcome (`hour_outcomes`). Observed vs forecast sell-through gives a shrunk calibration factor in [0.6, 1.4] that scales remaining forecast demand. That is a state update, not model training. Confidence is derived from logged exposure volume (views, quotes, abandons) and price variety, so paid orders are never the only denominator.

## Data model (SQLite)
`merchants, stores, products (demand model JSON), inventory_batches, cost_snapshots, pricing_policies (versioned), sim_state, exposure_events, hour_outcomes, price_decisions, published_prices (versioned), price_quotes, orders, payment_attempts, inventory_movements, webhook_events, audit_events`. Money is integer cents. Stock = Σ inventory_movements. Available = on hand − active reservations.

Every inventory movement carries a `source`: `SIMULATED`, `PAYPAL_SANDBOX`, `MOCK_CHECKOUT`, `MERCHANT` or `SYSTEM`. `UNIQUE(order_id)` on movements makes double decrements impossible.

Upgrade path to PostgreSQL: the schema is plain SQL, and all writes go through a handful of service functions that use transactions. Swap `better-sqlite3` for `pg` and use `SELECT … FOR UPDATE` in `createQuote` and `finalizePaid`.

## API
| Method | Path | Notes |
|---|---|---|
| GET | `/api/stores/:storeId/products/:sku` | shopper-safe product + price |
| GET | `/api/prices/current?storeId=&sku=` | published price + version |
| GET | `/api/storefront[?view=1]` | shopper state; `view=1` logs an exposure |
| GET | `/api/state` | merchant dashboard read model |
| POST | `/api/pricing/recommend` | compute + store a decision |
| POST | `/api/pricing/publish` `{decisionId}` | re-validates version, clock, policy, actor |
| POST | `/api/pricing/reject` `{decisionId}` | |
| GET | `/api/pricing/decisions?sku=` | ledger |
| POST | `/api/pricing/policy` `{patch}` | merchant only, new version, audited |
| POST | `/api/pricing/policy/draft` `{text}` | draft only (LLM or deterministic) |
| POST | `/api/pricing/explain` `{decisionId}` | optional LLM narration of stored numbers |
| POST | `/api/quotes` `{sku, qty}` | lock price, reserve stock, 5-min TTL |
| POST | `/api/orders` `{quoteId}` | one order per quote |
| GET | `/api/orders/:id` | |
| POST | `/api/orders/:id/cancel` | releases reservation |
| POST | `/api/orders/:id/mock-pay` | MOCK only; disabled when PayPal is configured |
| POST | `/api/orders/:id/reconcile` | re-fetch PayPal order state |
| GET | `/api/paypal/config` | mode + public client id |
| POST | `/api/paypal/orders` `{orderId}` | server creates PayPal order from the quote amount |
| POST | `/api/paypal/orders/:id/capture` | server captures + verifies |
| POST | `/api/paypal/webhook` | signature-verified, deduplicated (needs `PAYPAL_WEBHOOK_ID`) |
| POST | `/api/simulations/reset` / `step` / `scenario` | demo controls |
| GET | `/api/simulations/comparison` | Pricing Lab |
| GET | `/api/agent/pricing-context` | bearer, `pricing:read` |
| POST | `/api/agent/recommend` | bearer, `pricing:recommend` |
| POST | `/api/agent/publish` `{decisionId}` | bearer, `pricing:publish` + policy allows + no approval needed |
| POST | `/api/negotiations` `{offerCents, sku?, buyer?}` | buyer agent opens a one-unit negotiation |
| GET | `/api/negotiations/:id` | buyer-safe view (no walk-away price) |
| POST | `/api/negotiations/:id/offer` `{offerCents}` | max 3 offers |
| POST | `/api/negotiations/:id/accept` / `decline` | accept the seller's counter / walk away |
| GET | `/api/seller/negotiation-view` | seller-private walk-away price + reason (merchant auth) |
| POST | `/api/simulations/jump` `{scenario: lunch\|closing}` | demo shortcut |
| GET | `/api/events` | SSE |

## Security notes
- PayPal secret, access tokens and the LLM key are server-only. The browser only ever sees the public PayPal client ID.
- Clients never send prices, amounts, SKUs' costs or payment status. Amounts come from quotes, and status comes from PayPal API responses.
- Agents can only publish server-computed decisions, never arbitrary prices, and cannot change policy.
- Merchant endpoints are open in local demo mode. Set `MERCHANT_BASIC_AUTH=user:pass` for any public deployment (`src/proxy.ts`). Real merchant auth (sessions, roles) is out of MVP scope.
- Same public price for all shoppers at a given time; no personalization.
