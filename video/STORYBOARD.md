# Jomm. — demo video storyboard (draft v1)

Target: 2:45, 1920x1080, English narration (OpenAI TTS "agent" voice from /api/voice, or the user's own voice).
Footage: Playwright screen recordings of https://jomm.onrender.com (1920x1080, scale 2) + the stall's own POV clips in public/videos.
PayPal Sandbox approval: recorded by the user on their Mac (QuickTime), or replaced by the server-side capture/verify evidence.

| # | Time | Screen | Narration (EN) |
|---|---|---|---|
| 1 | 0:00–0:15 | Title card "Teach your stall. It haggles with AI. PayPal pays." → Rosa's POV clip of her crates | Shopping is moving to AI agents. Big stores will plug in. But what about Rosa, with three crates of fruit and no website? |
| 2 | 0:15–0:40 | /seller → Teach, "Fruit stall, 3 crates" sample video; cards fill in (price, lowest price 🔒, must-go-today) | With Jomm., Rosa just points her phone at her goods and talks. Her own selling agent keeps asking until it knows enough to haggle: price, the lowest she'd take, how many, when she closes, what the supermarket charges, and what happens to leftovers. |
| 3 | 0:40–0:55 | Teach, "Closet, 5 items"; Channel3 price card for the Madewell coat | Mina resells her closet. Her agent looks up new prices on Channel3 and suggests a fair resale range, so she doesn't have to guess. |
| 4 | 0:55–1:15 | /demo Act 2: type "Strawberries for a party tonight. 3 boxes, keep it under $17." | Now a shopper tells their own AI agent what they want. The OpenAI buyer agent turns it into a budget the server enforces, then reads Rosa's product feed. |
| 5 | 1:15–1:55 | Act 3 chat (buyer ↔ Rosa's agent) + PayPal agent interface panel highlighting calls | The two agents negotiate. Every step is an ACP-style checkout session with PayPal as the payment provider. Rosa's agent uses what she taught: the strawberries must go tonight, so it gives a little — but her lowest price never leaves her side. Every counter has a reason. Deal. |
| 6 | 1:55–2:20 | Complete → PayPal Orders v2 → Sandbox approval popup (user's recording) → capture | The agent can't pay on its own. The server creates a PayPal Orders v2 order with the agreed, locked amount. The shopper approves in PayPal Sandbox, and the server captures and verifies it. |
| 7 | 2:20–2:35 | Panel: Agent Toolkit get_order result → Rosa's phone "You received $…" | Then the buyer agent checks the order itself with the PayPal Agent Toolkit. And on Rosa's phone: sold, paid, stock updated. |
| 8 | 2:35–2:50 | End card: tagline, stack logos as text (PayPal ACP checkout · Orders v2 · Agent Toolkit · OpenAI · Channel3 · Render), jomm.onrender.com, GitHub link | Jomm. Teach your stall. It haggles with AI. PayPal pays. Live on Render. |

Word count ≈ 300 → about 2:10 of speech; the rest is on-screen breathing room.

## Honesty notes (keep on screen / in narration)
- Payments shown are PayPal **Sandbox** (test money). A small "PayPal Sandbox · test money" label stays on screen in scenes 6–7.
- Checkout sessions follow the ACP shape PayPal Agent Ready accepts; the negotiation extension is ours. We don't claim enrollment in Agent Ready.
- Rosa's teaching is a sample replay through the real teaching pipeline.
