# Jomm. submission texts (drafts)

## YouTube

**Title**
Jomm. — Teach your stall. It haggles with AI. PayPal pays. (PayPal AI Hackathon 2026 demo)

**Description**
Shoppers are starting to send AI agents to buy for them. Big retailers will plug in fast. A three-crate fruit stall or a closet reseller has no catalog API, no checkout integration and no tech team.

Jomm. gives the smallest sellers their own AI selling agent, set up in minutes just by talking. Rosa points her phone at her crates and talks; her agent learns her prices, her private lowest price and her reasons (closing time, supermarket prices, leftovers). Mina does the same with her closet, and Jomm. checks new-item prices on Channel3 to suggest a fair resale range.

When a shopper's AI agent arrives, it reads the stall's product feed, opens a checkout session in the Agentic Commerce Protocol shape with PayPal as the payment provider, and haggles with the seller's agent. The seller's lowest price never leaves the server, and amounts are always set by the server, never by an agent. The shopper approves in PayPal, the server creates and captures a PayPal Orders v2 order and verifies it, and the buyer agent confirms it with the PayPal Agent Toolkit (get_order).

Payments in this demo run in the PayPal Sandbox (test money).

Built with: PayPal Orders v2 · PayPal Agent Toolkit · ACP-style checkout sessions · OpenAI (buyer agent, tool calling) · Channel3 · deployed on Render
Live demo: https://jomm.onrender.com
Code: https://github.com/ttiu-cs/jomm

Chapters
0:00 6 a.m. at Rosa's stall
0:19 Our mission
0:32 Teaching the stall by talking
0:56 A shopper's AI agent arrives
1:06 Product feed
1:16 Checkout session + negotiation
1:33 Guardrails
1:45 PayPal Orders v2 + Sandbox approval
1:56 Verified with the PayPal Agent Toolkit
2:09 A lowball, held
2:20 Mina's closet + Channel3
2:29 Built with

Music: "Carefree" and "Bossa Antigua" by Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
Some background images are AI-generated (Ludyte); others are from Pexels.

## Devpost

### Inspiration
PayPal has always worked to give everyone a place in the digital economy. Now shopping is moving to AI agents, and PayPal is building the rails for it: Agent Ready, Store Sync, the Agent Toolkit. Big merchants will plug in quickly. A fruit stand with three crates, or someone reselling their closet, has no catalog, no developer and no time. We wanted the smallest seller to be just as ready for the AI era as the biggest one, without writing a line of code.

### What it does
Jomm. turns a short phone-camera conversation into a selling agent.
- **Teach by talking.** The seller points their phone at the goods and talks. The agent keeps asking until it knows enough to haggle: price, lowest acceptable price (kept private), quantity, how soon it must sell, closing time, prices elsewhere, bulk deals, what happens to leftovers. For second-hand items it looks up new prices on Channel3 and suggests a resale range.
- **Sell to any shopper's agent.** A shopper types an intent ("Strawberries for a party tonight. 3 boxes, keep it under $17."). An OpenAI buyer agent turns it into a budget mandate, reads the stall's product feed, asks questions, and negotiates with the seller's agent through a checkout session. Every counter-offer carries a reason grounded in what the seller taught.
- **PayPal pays.** The agreed price becomes a server-side, price-locked PayPal Orders v2 order. The shopper approves it in PayPal; the server captures and verifies it; the buyer agent confirms it with the PayPal Agent Toolkit. The seller's phone shows the sale.

### How we built it
- Next.js app deployed on Render (auto-deploys from main).
- Seller teaching: a parser turns the owner's words into items, prices, private floors and urgency; a checklist drives follow-up questions; Channel3 search for new-item prices; OpenAI TTS for the sample voices.
- Agent interface: `GET /api/agentic/feed` (modeled on Store Sync), `POST /api/agentic/checkout_sessions` (+ update / complete / cancel) in the Agentic Commerce Protocol shape with `payment_provider: paypal`, plus our own `negotiation` extension (offer, counter, final offer).
- Buyer agent: OpenAI tool calling with stall tools and the PayPal Agent Toolkit (`@paypal/agent-toolkit`, `get_order`), streamed to the UI with every call shown in a "PayPal agent interface" panel.
- Payments: PayPal Orders v2 (Sandbox) with idempotency keys, quote locks, capture verification (amount, currency, custom_id) and webhook/reconcile handling.

### How we use PayPal
- **Orders v2** creates and captures every payment. The amount comes from the server's locked agreement, never from an agent.
- **Human approval in PayPal**: agents can't pay on their own; the shopper approves each order in PayPal.
- **PayPal Agent Toolkit**: the buyer agent's tools include the toolkit's `get_order`, which it calls to confirm the captured payment.
- **Agent Ready / ACP shape**: checkout sessions follow the Agentic Commerce Protocol shape that PayPal Agent Ready accepts, with PayPal as the payment provider. (This build isn't enrolled in Agent Ready; the negotiation extension is ours.)
- **Store Sync idea**: the stall's product feed exposes items, prices and the owner's words to agents, but never the private floor.

### Challenges
Keeping the seller's floor private while still letting the agent negotiate convincingly; making sure no agent can ever set an amount; and making a teaching flow simple enough for someone who has never used a computer for business.

### What's next
Live camera teaching in more languages, real Store Sync and Agent Ready enrollment, and payouts and receipts on the seller's phone.
