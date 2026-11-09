# 3-minute demo script

**One line:** Show your shop to the camera and talk. Your AI seller agent learns, sells to buyer agents within your limits, and gets paid through PayPal.

**Positioning:** Buyer agents are starting to shop for people. Large sellers can plug into agentic commerce; a fruit stand or a closet seller has no catalog and no developer. This lets the smallest sellers take part by talking.

## Setup
- Start the app. Open `/seller` on a phone (camera needs https or localhost) or a laptop, and `/market` in a second window.
- With PayPal Sandbox keys, run one checkout beforehand so the Sandbox login is warm. Keep a backup recording of the PayPal step. Never present a MOCK payment as PayPal.
- Stage fallback: on the Teach screen choose **Try it with a demo fruit stand**. The illustrated stall pans to each crate, and **Tap to say** sends the next scripted line through the same conversation logic (no camera or microphone needed). Or open **Sample fruit stand** on `/seller`.

## Script
| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00–0:20 | Home | Show the 3 steps | "Buyer agents will shop for us. The smallest sellers have no way to sell to them. Until now." |
| 0:20–1:10 | `/seller` → Teach tab | Camera on. Point at apples: "These are Fuji apples, about 30 lb. Really sweet this year." Agent asks for price → "$3 a pound, no less than $2.40." → "No rush." Next item: peaches "have to go today, $4, lowest $2." | "It asks like a new employee would: how many, what price, the lowest I'd take, what buyers should know. Cards, SKUs and stock fill in as I talk. The lowest price stays private." |
| 1:10–1:25 | Open my shop → seller Home, Items tab | Show SKUs and QR shelf labels | "One tap, and the shop is live: SKUs, stock, prices, and QR labels for walk-in shoppers." |
| 1:25–2:20 | `/market` | "2 lb of sweet apples, max $6 total" → Send buyer agent | "The buyer agent finds the shop and asks 'Are they sweet?' My agent answers with what I said. They negotiate. Because I said no rush, my agent stops at $2.76, not my $2.40 floor. Peaches I said must go today, so it would go all the way down." |
| 2:20–2:45 | `/market` → PayPal | Approve in PayPal Sandbox | "A person approves; the buyer agent can't pay alone. The server verifies the capture with PayPal, then stock drops." |
| 2:45–3:00 | Seller dashboard | Show the deal and the payment | "The sale shows up on my dashboard with the PayPal capture. Fruit stand today, a closet tomorrow, same way." |

## Say correctly
- The agent doesn't train a model; it remembers what the owner taught and sells from it.
- Without an AI key, the conversation runs on a built-in rule-based parser. With `ANTHROPIC_API_KEY`, Claude also reads the camera frame. Prices and limits only ever come from what the owner said.
- Payments are PayPal Sandbox (test money). Seller onboarding to each owner's own PayPal account (Partner Referrals) and PayPal Agent Ready / Store Sync are integration design, not live in this build.
