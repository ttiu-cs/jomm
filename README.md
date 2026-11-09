# Stallkeeper (working name; repo: retail-pricing-os)

**Pricing Intelligence for Every Seller Agent.** Every buyer agent knows how to find the best price. Every seller agent should know how to set one.

**AI shop assistants for the smallest sellers.** Turn on the camera, walk through your shop and talk. Your AI seller agent asks questions like a new employee (how many, what price, the lowest you'd take, what buyers should know), builds SKUs, stock and prices from your answers, then sells to buyer agents within your limits and gets paid through PayPal.

| Who | Where | What |
|---|---|---|
| Everyone | `/` | Two choices: "I sell things" or "Watch a buyer agent shop" |
| **Seller** (phone-first app) | `/seller` | Name your shop once; the app remembers it |
| | `/seller/{shopId}` | Home: today's money, items that need attention, latest deals |
| | `/seller/{shopId}/teach` | Camera conversation: show items and talk; cards fill in; "Open my shop" |
| | `/seller/{shopId}/items` | Items (stock, price, private lowest price) and printable QR labels |
| | `/seller/{shopId}/deals` | Payments received and conversations the agent handled |
| **Shopper** | `/shop/{shopId}` | Public shop page (shareable link) |
| | `/s/{shopId}/{sku}` | Item page from a QR label: ask, make an offer, pay with PayPal |
| | `/market` | Try a buyer agent |
| Developers | footer links | Pricing engine demo, hourly pricing, lab, agent API |

How it works:
- **Teaching:** each turn sends the owner's words plus the current camera frame. With `ANTHROPIC_API_KEY`, Claude reads both; without it, a deterministic parser handles it (English, some Korean). Prices, quantities and floors only ever come from what the owner said, and the owner can tap any card to correct it.
- **Selling:** the seller agent answers questions only from the owner's facts. It negotiates per unit (max 3 buyer offers) and never goes below the owner's private floor. How far it goes depends on urgency: "today" means it may concede down to the floor, "this week" 70% of the gap, "no rush" 40%.
- **Paying:** the agreed price becomes a server-side, 5-minute price-locked quote, paid with PayPal Sandbox (or a labeled MOCK without keys). Stock is decremented exactly once after a verified capture.

## Design
Apple-style (after apple.com and the iOS Human Interface Guidelines): system font (SF Pro on Apple devices, Inter elsewhere), #1d1d1f on white / #f5f5f7, one blue (#0071e3) for actions, iOS system colors only for status, large tight headlines, frosted nav and tab bars, grouped inset lists. Real photography from Pexels (free license, see `public/photos/CREDITS.md`). Without a camera, **Use the sample fruit stand** (or closet) shows real photos that switch to the item being discussed, and offers the next line as a "Tap to say" button; the product photo is cropped from that photo.

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
- **Real:** camera-conversation teaching → live products (SKU, stock, price, private floor), agent-readable catalog (`GET /api/catalog`), seller Q&A, buyer↔seller negotiation (seller walk-away price from the engine, never shown to buyers), pricing engine (finite-horizon DP + guardrails + reason codes), versioned prices and policies, price-locked quotes with stock reservation, PayPal Sandbox Orders v2 create/capture/verify, signature-verified webhooks, exactly-once inventory, audit log, agent auth.
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
