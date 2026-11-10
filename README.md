# Jomm.

**Teach your stall. It haggles with AI. PayPal pays.**

- **Live demo:** https://jomm.onrender.com/demo
- **Video (under 3 min):** https://youtu.be/zrWFIY9mRTI
- **Code:** https://github.com/ttiu-cs/jomm (MIT)

The smallest sellers (a three-crate fruit stall, a closet resale) have no website and no tech team, and they shouldn't fall behind when shopping moves to AI agents. With Jomm., the owner points a phone camera at their goods and *talks* with their own selling agent. The agent keeps asking until it knows enough to haggle the way the owner would. When a shopper's AI agent comes looking, the stall's agent answers, negotiates, and gets the owner paid with PayPal, while the owner's lowest prices never leave the server.

## Try it (judges: about 3 minutes)
1. Open **https://jomm.onrender.com/demo**.
2. **Act 1, Rosa teaches her agent:** press **▶ Play Rosa’s video** (then **Skip ›** to jump to the end). This is a replay of Rosa's camera conversation, run through the real teaching pipeline.
3. **Act 2, the shopper's agent:** tap an example, or type any request in plain words, the way you'd say it to a friend (what, how much, what for, and your budget; e.g. "4 lb peaches for jam, under $10"), and press **Send the shopper's agent**. An OpenAI buyer agent reads the stall's feed, chats with Rosa's agent, and haggles inside the shopper's budget. The middle panel shows every PayPal-style agent call with its data.
4. **Act 3, PayPal:** press the PayPal button and approve with a **PayPal Sandbox personal (buyer) account** (test money). Judges: a Sandbox buyer login is in the Devpost testing notes. The server captures and verifies the order with PayPal, the PayPal Agent Toolkit confirms it, and Rosa's phone shows the sale.
5. **Teach by camera:** open **https://jomm.onrender.com/seller**, name a shop, and on the Teach screen pick **Closet, 5 items**. Mina shows her closet; for each item the agent looks up new prices on **Channel3** and suggests a fair resale range. You can also use your own camera (the site is https).

| Example shopper | Intent | What happens |
|---|---|---|
| Maya | Fruit for smoothies, 3 lb, cheapest, $9 max | Picks the soft white peaches (Rosa said "perfect for smoothies"); Rosa's agent comes down fast because they must go today |
| Leo | Sweetest apples for a lunchbox, quality first | Asks "Are they sweet?", pays the listed price |
| Jun | Party strawberries, 3 boxes, under $17 | Several rounds; Rosa's agent cites the supermarket price (and may mention that leftovers become jam), and they settle inside budget |
| Rex | 2 boxes for $5, not a cent more | Rosa's agent holds the line above her private floor: no deal, nothing charged |

## How it uses PayPal
| Step | Endpoint | Modeled on |
|---|---|---|
| Discover | `GET /api/agentic/feed?shop=` | PayPal Store Sync (catalog + inventory for AI agents) |
| Ask | `POST /api/shops/{shop}/items/{sku}/ask` (+ a `chat_with_seller` agent tool) | Answers only from the owner's own words, never prices |
| Check out | `POST /api/agentic/checkout_sessions` (+ `/{id}`, `/{id}/complete`, `/{id}/cancel`) | Agentic Commerce Protocol checkout sessions (PayPal Agent Ready), `payment_provider: paypal` |
| Negotiate | `negotiation` extension on create/update | Our addition: per-unit offer, counter with a reason, final offer, quantity change |
| Pay | PayPal **Orders v2** create → shopper approval → capture → verify | PayPal Orders v2 (Sandbox) |
| Confirm | `get_order` via **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) | The buyer agent checks the order with PayPal itself |

Safety rules the code enforces: PayPal secrets stay server-side; amounts, SKUs and status come from the server, never from an agent; the shopper's budget mandate is enforced in tool code; agents can't pay on their own; a sale counts only after a verified capture. More: [`docs/PAYPAL_AGENT_INTERFACE.md`](docs/PAYPAL_AGENT_INTERFACE.md).

## Built with
PayPal (Orders v2, ACP-shaped checkout sessions, Agent Toolkit, Sandbox) · OpenAI (gpt-5.4-mini tool calling for the buyer agent and wording; gpt-4o-mini-tts voices) · Channel3 (new-price lookup for items sold by the piece) · Render (hosting, auto-deploy from GitHub) · Next.js 16, React 19, TypeScript, Tailwind, SQLite.

## How it works
- **Teaching by talking:** a deterministic parser turns the owner's words into items, prices, private floors and urgency. After price, lowest price and deadline, the agent keeps asking until its checklist is complete: what shoppers pay elsewhere, closing time, bulk deals, what happens to leftovers, how fast it sells. "I don't know" skips a question; the owner can tap any card to correct it.
- **Sample videos and voices:** the Teach screen plays Rosa's stall or Mina's closet (POV clips in `public/videos`) while every line goes through the real teaching pipeline. With `OPENAI_API_KEY`, Rosa, Mina and the agent speak with OpenAI `gpt-4o-mini-tts` voices.
- **Channel3 (items sold by the piece: clothes, shoes, bags, electronics and the like):** when the owner names one ("a Levi's trucker jacket, small stain"), the agent looks up what it sells for new online on Channel3, suggests a fair resale price for its condition, and later haggles with "new ones sell for about $85 online". Goods sold by the pound or box, like Rosa's fruit, aren't looked up: Channel3 covers general merchandise, not groceries.
- **Selling:** Rosa's agent answers only from her facts and never goes below her private floor. How far it may go comes from urgency, time left before closing (in the stall's time zone), demand, waste risk and price versus elsewhere; an owner who must sell today comes down faster and accepts any offer at or above today's lowest. Every counter carries a reason, and the owner sees the private reasoning ("Why my agent priced it this way").
- **Buying:** the OpenAI buyer agent works through tools only (`read_product_feed`, `chat_with_seller`, `ask_seller`, `open_checkout_session`, `propose_price`, `accept_seller_counter`, `walk_away`, `complete_checkout`, plus the PayPal Agent Toolkit). If it stops early, the server nudges it and can finish a deal that fits the mandate; it can't walk away while the stall is still moving. Without an OpenAI key, a labeled rule-based buyer agent runs instead.
- **Paying:** the agreed price becomes a server-side, 5-minute price-locked quote, paid with PayPal Sandbox (or a clearly labeled practice payment without keys). Stock is decremented exactly once after a verified capture.

## Other pages
| Who | Where | What |
|---|---|---|
| **Seller** (phone-first app) | `/seller` | Name your shop once; the app remembers it |
| | `/seller/{shopId}` | Home: today's money, items that need attention, latest deals |
| | `/seller/{shopId}/teach` | Teach by talking (camera, or the fruit-stall and closet sample videos) |
| | `/seller/{shopId}/items`, `/deals` | Items and QR labels; payments and conversations |
| **Shopper** | `/shop/{shopId}`, `/s/{shopId}/{sku}` | Shop page; item page from a QR label |
| | `/market` | Free-form buyer agent |
| Developers | footer links | Pricing engine, hourly pricing, lab, agent API |

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
See `.env.example`. Secrets (`PAYPAL_CLIENT_SECRET`, `OPENAI_API_KEY`, `CHANNEL3_API_KEY`) are read only on the server. For any public deployment also set `MERCHANT_BASIC_AUTH=user:password` to protect merchant pages and APIs, and set your own `AGENT_API_KEYS`. (The live demo leaves the seller pages open so judges can try them.)

## Deploying (Render)
The live demo runs on Render: `render.yaml` is a Blueprint (Node web service, auto-deploys from `main`; keys are entered in the Render dashboard). SQLite lives at `DATABASE_PATH`. The database defaults to `~/.retail-pricing-os/pricing-os.db`, outside the project folder so the dev server doesn't reload on every write. On an instance without a persistent disk, the database resets on restart and auto-seeds on first request. That is fine for a demo; use a persistent disk or PostgreSQL otherwise. Check current Render plan and credit terms yourself before relying on them.

## Project layout
```
src/lib/agentic/    agent commerce: product feed, ACP-shaped checkout sessions, OpenAI buyer agent + PayPal Agent Toolkit
src/lib/teach/      teaching by talking: parser, follow-up checklist, catalog
src/lib/server/     services: negotiation, pricing, sim (store clock), commerce (quotes/orders/PayPal), read models
src/lib/paypal/     server-side PayPal REST client (Orders v2)
src/lib/pricing/    pure engine: demand, economics, optimizer, simulator, rng
src/lib/agent/      agent auth, policy-intent drafting, optional LLM adapter
src/lib/demo/       sample stories: Rosa's stall, Mina's closet, example shoppers
src/lib/market/     Channel3 new-price lookup
src/lib/buyer/, db/, client/   shopper request parsing, SQLite, browser helpers
src/proxy.ts        optional Basic auth for seller/merchant pages
src/app/            pages (merchant, shop, lab, agent) and API routes
tests/              vitest: optimizer, simulator, commerce/PayPal (fake API), services, agent
```
