# Jomm. submission texts (drafts)

## YouTube

**Title**
Jomm. — Teach your stall. It haggles with AI. PayPal pays. (PayPal AI Hackathon 2026 demo)

**Description**
Shoppers are starting to send AI agents to buy for them. Big retailers will plug in fast. A three-crate fruit stall or a closet reseller has no catalog API, no checkout integration and no tech team.

Jomm. gives the smallest sellers their own AI selling agent, set up in minutes just by talking. Rosa points her phone at her crates and talks; her agent learns her prices, her private lowest price and her reasons (closing time, supermarket prices, leftovers). Mina does the same with her closet, and for branded goods Jomm. looks up new prices on Channel3 to suggest a fair resale price.

When a shopper's AI agent arrives, it reads the stall's product feed, opens a checkout session in the Agentic Commerce Protocol shape with PayPal as the payment provider, and haggles with the seller's agent. The seller's lowest price never leaves the server, and amounts are always set by the server, never by an agent. The shopper approves in PayPal, the server creates and captures a PayPal Orders v2 order and verifies it, and the buyer agent confirms it with the PayPal Agent Toolkit (get_order).

Payments in this demo run in the PayPal Sandbox (test money).

Built with: PayPal Orders v2 · PayPal Agent Toolkit · ACP-style checkout sessions · OpenAI (buyer agent, tool calling) · Channel3 · deployed on Render
Live demo: https://jomm.onrender.com/demo
Code: https://github.com/ttiu-cs/jomm

Chapters
0:00 6 a.m. at Rosa's stall
0:19 Our mission
0:32 Teaching the stall by talking
0:55 A shopper's AI agent arrives
1:05 Product feed
1:14 Checkout session + negotiation
1:31 Guardrails
1:42 PayPal Orders v2 + Sandbox approval
1:53 Verified with the PayPal Agent Toolkit
2:06 A lowball, held
2:16 Mina's closet + Channel3
2:25 Built with

Music: "Carefree" and "Bossa Antigua" by Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
Some background images are AI-generated (Ludyte); others are from Pexels.

## Devpost

**Tagline:** Teach your stall. It haggles with AI. PayPal pays.

**Links**
- Live demo: https://jomm.onrender.com/demo
- Video (under 3 min): https://youtu.be/zrWFIY9mRTI
- Code (MIT): https://github.com/ttiu-cs/jomm

### Inspiration
PayPal has always worked to give everyone a place in the digital economy. Now shopping is moving to AI agents, and PayPal is building the rails for it: Agent Ready, Store Sync, the Agent Toolkit. Big merchants will plug in quickly. A three-crate fruit stall, or someone reselling their closet, has no website, no catalog and no tech team. We wanted the smallest seller to be just as ready for the AI era as the biggest one, without writing a line of code.

And small sellers have something big retailers don't: they haggle. Big stores sell at one fixed price to everyone; a stall owner reads the shopper, the hour and the crate, and makes a deal — a little off for three boxes, more off before closing. That flexibility is how they sell out and waste less, and today's agent checkout leaves it out: an ACP checkout session carries a price, not a conversation. We wanted the owner's own way of dealing to travel with their agent.

### What it does
Jomm. turns a short camera conversation into the seller's own AI selling agent.
- **Teach by talking.** The owner points a phone or laptop camera at the goods and talks. The agent keeps asking until it knows enough to haggle the way the owner would: price, the lowest price they'd take (kept private), quantity, how soon it must sell, closing time, what shoppers pay elsewhere, bulk deals, what happens to leftovers. For branded, manufactured goods (clothes, shoes, bags, electronics) it looks up new prices on **Channel3** and suggests a fair resale price for the item's condition. Fresh produce isn't looked up.
- **Haggle the owner's way.** Jomm. adds a `negotiation` extension to the ACP-shaped checkout session: the shopper's agent makes an offer, and the stall's agent answers with a counter and a reason, inside a floor only the owner knows. How far it gives depends on what the owner taught: must it sell today, how close is closing, what does the supermarket charge, what happens to leftovers.
- **Sell to any shopper's agent.** A shopper types any request in plain words ("Strawberries for a party tonight. 3 boxes, keep it under $17."). An OpenAI buyer agent turns it into a budget mandate, reads the stall's product feed, asks the seller's agent questions, and negotiates through a checkout session. Every counter-offer carries a reason grounded in what the owner taught ("The supermarket charges $4.99 a box…"), and the owner's lowest price never leaves the server.
- **PayPal pays.** The agreed price becomes a server-side, 5-minute price-locked quote and a PayPal Orders v2 order. The shopper approves it in PayPal (agents can't pay on their own); the server captures and verifies it; the buyer agent confirms it with the PayPal Agent Toolkit; the owner's phone shows the sale.

### How we use PayPal
| Step | Endpoint | Modeled on |
|---|---|---|
| Discover | `GET /api/agentic/feed?shop=` | PayPal Store Sync (catalog + inventory for AI agents) |
| Ask | `POST /api/shops/{shop}/items/{sku}/ask` (+ a `chat_with_seller` agent tool) | Answers only from the owner's own words, never prices |
| Check out | `POST /api/agentic/checkout_sessions` (+ `/{id}`, `/{id}/complete`, `/{id}/cancel`) | Agentic Commerce Protocol checkout sessions (PayPal Agent Ready), `payment_provider: paypal` |
| Negotiate | `negotiation` extension on create/update | Our addition: per-unit offer, counter with a reason, final offer, quantity change |
| Pay | PayPal **Orders v2** create → shopper approval → capture → verify | PayPal Orders v2 (Sandbox) |
| Confirm | `get_order` via **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) | The buyer agent checks the order with PayPal itself |

Rules the code enforces: PayPal secrets stay server-side; amounts, SKUs and status come from the server, never from an agent; the shopper's budget mandate is enforced in tool code; agents can't pay on their own; a sale counts only after a verified capture. The checkout sessions follow the ACP shape that PayPal Agent Ready accepts; this build isn't enrolled in Agent Ready or Store Sync, and the negotiation extension is ours.

### How we built it
- **Teaching:** a deterministic parser turns the owner's words into items, prices, private floors and urgency, and a checklist drives the follow-up questions. The Teach screen uses the camera, or plays one of two sample videos (Rosa's fruit stall, Mina's closet) through the same pipeline. Rosa, Mina and the agent speak with OpenAI `gpt-4o-mini-tts` voices.
- **Selling:** the seller's agent answers only from the owner's facts and never goes below the private floor. How far it may go comes from urgency, time left before closing, demand, waste risk and price versus elsewhere; the owner sees the private reasoning ("Why my agent priced it this way").
- **Buying:** an OpenAI buyer agent (`gpt-5.4-mini`, tool calling) works only through tools: `read_product_feed`, `chat_with_seller`, `ask_seller`, `open_checkout_session`, `propose_price`, `accept_seller_counter`, `walk_away`, `complete_checkout`, plus the PayPal Agent Toolkit. Every call streams to a "PayPal agent interface" panel with its request and response.
- **Paying:** PayPal Orders v2 (Sandbox) with idempotency keys, quote locks, capture verification (amount, currency, custom_id), signature-verified webhooks and exactly-once inventory.
- **Stack:** Next.js 16, React 19, TypeScript, Tailwind, SQLite; deployed on Render with auto-deploy from GitHub.

### Challenges we ran into
Keeping the owner's floor private while still letting the agent negotiate convincingly; making sure no agent can ever set an amount or pay on its own; and keeping teaching simple enough for someone who has never used a computer for business.

### Accomplishments that we're proud of
A full loop that really runs: a camera conversation becomes listings with private limits, a shopper's OpenAI agent finds the stall through its feed, the two agents haggle with reasons, and a real PayPal Sandbox order is approved, captured, verified and confirmed with the Agent Toolkit.

### What we learned
Agent commerce needs guardrails in the server, not in prompts: budgets, floors and amounts are enforced in code, and the model only chooses between safe tools.

### What's next
Live teaching in more languages, real Store Sync and Agent Ready enrollment, more sellers per market, and payouts and receipts on the owner's phone.

### Try it (judges, about 3 minutes)
1. Open https://jomm.onrender.com/demo.
2. **Act 1:** press ▶ Play Rosa's video (then Skip › to jump to the end).
3. **Act 2:** tap an example, or type any request in plain words (what, how much, what for, and your budget), and press **Send the shopper's agent**.
4. **Act 3:** press the PayPal button and approve with the PayPal Sandbox buyer login below (test money).
5. **Teach:** open https://jomm.onrender.com/seller, name a shop, and use your camera, or tap a sample: **Fruit stall, 3 crates** or **Closet, 5 items** (Channel3 price lookups).

**Testing instructions (judges only):** PayPal Sandbox buyer login: [email] / [password]

### Built with
paypal-orders-v2 · paypal-agent-toolkit · agentic-commerce-protocol · openai · channel3 · render · next.js · react · typescript · tailwind · sqlite
