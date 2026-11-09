# Stallkeeper (working name; repo: retail-pricing-os)

**Shoppers’ AI agents come to a small stall. The stall’s own agent sells to each one the owner’s way. PayPal pays the owner.**

The smallest sellers (a fruit stand, a closet resale) shouldn’t fall behind when shopping moves to AI agents. Stallkeeper gives a stall owner a seller agent that speaks the agent-commerce interfaces PayPal supports, so any buyer agent can find the stall, ask questions, propose a price, and check out with PayPal, while the owner’s lowest prices stay private.

## The demo: `/demo`
One page, three acts, about two minutes:

1. **Rosa teaches her agent** (scripted replay). Rosa points her phone at three crates and talks: what it is, how much, the price, the lowest she’d take, and whether it has to go today. The replay runs her words through the real teaching pipeline and opens her stall. No live camera is needed for the demo.
2. **Tell your agent what to buy.** Type an intent (“4 lb peaches for jam, under $10”) or tap an example. A real buyer agent (OpenAI tool calling with the PayPal Agent Toolkit, or a labeled rule-based agent without `OPENAI_API_KEY`) turns it into a budget mandate the server enforces, then shops. The examples:
   | Shopper | Intent | What happens |
   |---|---|---|
   | Maya | Smoothies, cheapest, $8 max | Picks the soft peaches (Rosa said “perfect for smoothies”), haggles; Rosa’s agent gives more because they must go today |
   | Leo | Sweetest apples, quality first | Asks “Are they sweet?”, pays the listed price, no haggling |
   | Jun | Party strawberries, under $15 | Haggles a little, settles inside budget |
   | Rex | $5 for 2 boxes, not a cent more | Rosa’s agent holds the line above her private floor; no sale, nothing charged |
3. **PayPal pays Rosa.** The shopper approves in PayPal (agents can’t pay on their own). Rosa’s phone shows the PayPal notification, her day’s total, the stock left, and her reaction.

Next to the conversation, the **PayPal agent interface** panel shows every call the buyer agent makes, with the request and response data. See [`docs/PAYPAL_AGENT_INTERFACE.md`](docs/PAYPAL_AGENT_INTERFACE.md).

## The agent interface (summary)
| Step | Endpoint | Modeled on |
|---|---|---|
| Discover | `GET /api/agentic/feed?shop=` | PayPal Store Sync (catalog + inventory for AI agents) |
| Ask | `POST /api/shops/{shop}/items/{sku}/ask` | Answers only from the owner’s own words |
| Check out | `POST /api/agentic/checkout_sessions` (+ `/{id}`, `/{id}/complete`, `/{id}/cancel`) | Agentic Commerce Protocol checkout sessions, which PayPal Agent Ready accepts, with `payment_provider: paypal` |
| Negotiate | `negotiation` extension on create/update | Our addition: per-unit proposal, counter, final offer |
| Pay | PayPal Orders v2 create → buyer approval → capture | PayPal Orders v2 (Sandbox) |

## Other pages
| Who | Where | What |
|---|---|---|
| **Seller** (phone-first app) | `/seller` | Name your shop once; the app remembers it |
| | `/seller/{shopId}` | Home: today’s money, items that need attention, latest deals |
| | `/seller/{shopId}/teach` | Teach by talking (camera optional; sample stand with “Tap to say”) |
| | `/seller/{shopId}/items`, `/deals` | Items and QR labels; payments and conversations |
| **Shopper** | `/shop/{shopId}`, `/s/{shopId}/{sku}` | Shop page; item page from a QR label |
| | `/market` | Free-form buyer agent |
| Developers | footer links | Pricing engine, hourly pricing, lab, agent API |

How it works:
- **Teaching:** a deterministic parser turns the owner’s words into items, prices, private floors and urgency (an optional LLM can help with free-form speech; the demo doesn’t use it). The owner can tap any card to correct it.
- **Teaching what it takes to haggle:** after price, lowest price and deadline, the agent keeps asking until its checklist is complete: what shoppers pay elsewhere, the closing time (for must-go-today items), any bulk deal, what happens to leftovers, and how fast the item sells. “I don’t know” skips a question.
- **Sample video and voices:** “Start selling → Teach” plays Rosa’s phone video (four Ludyte-generated POV clips in `public/videos`) while her lines go through the real teaching pipeline; with `OPENAI_API_KEY`, Rosa and her agent speak with OpenAI `gpt-4o-mini-tts` voices (cached under `~/.retail-pricing-os/voice`), otherwise captions only.
- **Channel3 price lookup (second-hand items):** with `CHANNEL3_API_KEY`, when an item sold one by one is named (e.g. “a Madewell wool coat, worn twice”), the agent searches Channel3 for new prices online, suggests a resale range by condition, and later haggles with “new ones sell for about $350 online”. Produce is never looked up (Channel3 has no groceries). Try it with **Sample closet** on the Teach screen.
- **Selling:** the seller agent answers only from the owner’s facts and never goes below the owner’s private floor. With taught selling rules it haggles over up to 4 offers: how far it may go comes from urgency, time left before closing (in the stall’s time zone), demand, waste risk and price versus elsewhere; bulk deals lower the starting price. Every counter carries a reason (“The supermarket charges $3.49 a pound…”, “We close at 6 pm…”), and the owner sees the private reasoning (“Why my agent priced it this way”). Items taught without those rules use the simpler urgency schedule (today / this week / no rush).
- **Paying:** the agreed price becomes a server-side, 5-minute price-locked quote, paid with PayPal Sandbox (or a clearly labeled practice payment without keys). Stock is decremented exactly once after a verified capture.

## Design
Apple-style structure warmed up for small shops: system font, warm paper whites, a persimmon accent, the owner’s words in handwriting, candid photos from Pexels (see `public/photos/CREDITS.md`).

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

Open http://localhost:3000/demo. With no PayPal credentials, checkout runs in a clearly labeled **MOCK** mode. To use real PayPal Sandbox, fill `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env.local` (see `docs/PAYPAL_INTEGRATION.md`) and restart.

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
