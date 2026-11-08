# Retail Pricing OS

**Pricing Intelligence for Every Seller Agent.** Every buyer agent knows how to find the best price. Every seller agent should know how to set one.

**Demo in one sentence:** a buyer AI asks for a discount, the seller AI answers with math, and PayPal takes the payment. Before lunch with 40 salads left, the seller holds at $7. Near closing with 30 left, the same $5 budget gets a deal.

Under the hood, a pricing engine decides, publishes, quotes and transacts retail prices from cost, demand, inventory and remaining sellable time. The showcase is one freshly made salad: 100 units, $3.20 sunk production cost, sold 09:00–20:00.

| Screen | Path |
|---|---|
| **Negotiation demo (start here)** | `/` |
| Merchant Command Center | `/merchant` |
| Mobile Storefront (PayPal) | `/shop` |
| Pricing Lab (fixed vs adaptive, synthetic) | `/lab` |
| Seller-agent API console | `/agent` |

## Quick start
Requires Node 20+ (tested on 22).

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run seed
```

```bash
npm run dev
```

Open http://localhost:3000. With no PayPal credentials, checkout runs in a clearly labeled **MOCK** mode. To use real PayPal Sandbox, fill `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env.local` (see `docs/PAYPAL_INTEGRATION.md`) and restart.

Other commands:

```bash
npm test
```

```bash
npm run lint && npm run typecheck && npm run build
```

```bash
npm run seed -- --cold-start
```

The cold-start seed skips synthetic history, so confidence starts at "low" and decisions require approval.

## What is real vs synthetic
- **Real:** buyer↔seller negotiation (seller walk-away price from the engine, never shown to buyers), pricing engine (finite-horizon DP + guardrails + reason codes), versioned prices and policies, price-locked quotes with stock reservation, PayPal Sandbox Orders v2 create/capture/verify, signature-verified webhooks, exactly-once inventory, audit log, agent auth.
- **Synthetic (labeled in the UI):** walk-in demand from the time machine, 7 days of seeded exposure history, every Pricing Lab number.
- **Mock (labeled):** checkout when PayPal credentials are absent.
- **Not built:** POS/ESL/ERP connectors, multi-store UI, real demand learning, refunds, live money.

Details: [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md).

## Docs
- [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md): scope, screens, Definition of Done status
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): engine math, data model, API, security
- [`docs/PAYPAL_INTEGRATION.md`](docs/PAYPAL_INTEGRATION.md): flow, failure handling, Sandbox setup
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md): 3-minute judged demo (negotiation story)
- [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md): every number and approximation

## Environment variables
See `.env.example`. Secrets (`PAYPAL_CLIENT_SECRET`, `ANTHROPIC_API_KEY`) are read only on the server. For any public deployment also set `MERCHANT_BASIC_AUTH=user:password` to protect merchant pages and APIs, and set your own `AGENT_API_KEYS`.

## Deploying (Render)
`render.yaml` defines a Node web service. SQLite lives at `DATABASE_PATH`. The database defaults to `~/.retail-pricing-os/pricing-os.db`, outside the project folder so the dev server doesn't reload on every write. On an instance without a persistent disk, the database resets on restart and auto-seeds on first request. That is fine for a demo; use a persistent disk or PostgreSQL otherwise. Check current Render plan and credit terms yourself before relying on them.

## Project layout
```
src/lib/pricing/    pure engine: demand, economics, optimizer, simulator, rng
src/lib/server/     services: pricing, sim (store clock), commerce (quotes/orders/PayPal), read models
src/lib/paypal/     server-side PayPal REST client
src/lib/agent/      agent auth, policy-intent drafting, optional LLM adapter
src/app/            pages (merchant, shop, lab, agent) and API routes
tests/              vitest: optimizer, simulator, commerce/PayPal (fake API), services, agent
```
