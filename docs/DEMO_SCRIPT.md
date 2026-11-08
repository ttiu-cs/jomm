# 3-minute demo script

**One-line story:** A buyer AI asks for a discount. The seller AI answers with math, and PayPal takes the payment.

**Setup.** Start the app and open `/` (the Demo page) full screen. With PayPal Sandbox keys, do one checkout beforehand so the Sandbox login is warm. Keep a backup recording of the PayPal step. Never present a MOCK payment as PayPal.

| Time | Do | Say |
|---|---|---|
| 0:00–0:20 | Show the headline | "Buyer agents are learning to haggle. Seller agents need to know their lowest price, and why. That's Retail Pricing OS." |
| 0:20–0:50 | Click **Before lunch** (11:00, 40 left, $7.00). Budget $5, first offer $4 → **Start negotiation** | "The buyer agent offers $4. The seller expects about 85 lunch buyers for 40 salads, so every salad sells at full price. It holds at $7 and the buyer walks away." Point at the private view: lowest price = $7.00. |
| 0:50–1:30 | Click **Near closing** (18:00, 30 left). Same budget → **Start negotiation** | "Same salad, same listed price, same buyer. Now only about 12 sales are expected before closing, and leftovers go in the bin. The seller's lowest price drops to $4.55. It counters $6.25, then $5.50, and settles at $5.00." |
| 1:30–2:10 | **Pay** with PayPal Sandbox | "The agreed $5 is locked on the server for 5 minutes. A person approves in PayPal; the buyer agent can't pay alone. The server verifies the capture amount with PayPal." |
| 2:10–2:30 | Point at the private view: stock 30 → 29 | "The verified sale updates stock, and the seller's next answer uses it." |
| 2:30–3:00 | Optional: flash `/merchant` and `/lab` | "Behind this: hourly pricing, merchant guardrails (floor, max discount, approval) and a simulator. The lowest price comes from an optimizer, not an LLM. Any agent can plug in through the API." |

**Key facts to say correctly**
- The buyer never sees the seller's lowest price. Every buyer gets the same answer at the same moment (no personal pricing).
- The lowest price = opportunity cost of one salad (stock, time left, forecast demand, waste cost), adjusted for buyers who would have paid full price anyway, capped by the merchant's max discount (35%).
- Demand numbers are a synthetic forecast; payments are PayPal Sandbox (test money).

**If something breaks.** Click the scenario card again to reset. If PayPal is unreachable, switch to the backup recording and say so.
