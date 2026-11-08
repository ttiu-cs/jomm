# 3-minute demo script

**Setup (before recording).** `npm run seed`, start the app, open `/merchant` on desktop and `/shop` on a phone (or a narrow browser window) side by side. With Sandbox credentials, run one full checkout beforehand to warm up the PayPal popup and Sandbox login. Keep a Sandbox personal account logged in. Have a backup recording of the PayPal step in case the network fails. Never present a MOCK payment as PayPal.

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00–0:20 | Home | Show the thesis | "Every buyer agent knows how to find the best price. Retail Pricing OS lets every seller agent set one. This is not a markdown tool." |
| 0:20–0:45 | Command Center | Point to the SKU, 100 units, $3.20 sunk cost vs incremental fees, policy $4.00–$9.50, 11 selling hours | "Production cost is sunk once the salad is made, so the optimizer maximizes contribution from here on, with waste as a cost." |
| 0:45–1:20 | Time machine | Advance 1 hour ×3 → recommendation **Raise $7 → $8** (LUNCH_PEAK, LOW_STOCK…) → Approve & publish → advance → raise again → advance past lunch → **Lower** (POST_PEAK_LULL, EXPIRY_RISK) | "Prices go up and down: lunch shoppers are less price-sensitive, and afterwards waste risk dominates. Each move shows evidence: expected contribution if we follow vs if we hold." |
| 1:20–1:40 | Merchant agent | Type "Keep price ≥ $4.50; optimize for today's demand." → Draft policy → shows floor $4.00 → $4.50 → Confirm & recompute | "The agent only drafts structured policy. I confirm it. The optimizer, not the LLM, sets the price." |
| 1:40–2:20 | Storefront + PayPal | On the phone: price matches the dashboard → Lock price (5-min quote) → PayPal → Sandbox approve → **Paid ✓** | "The price the shopper accepted is locked. Even if I republish now, this quote won't change. The server captures and verifies amount, currency and reference with PayPal." |
| 2:20–2:45 | Command Center | Payment activity shows `PAYPAL SANDBOX · VERIFIED` with capture ID; stock −1; Recompute | "The verified sale reduced stock exactly once, and the next decision starts from that state. That's a state update, not retraining." |
| 2:45–3:00 | Pricing Lab + Agent API | Show fixed vs adaptive + sensitivity row going negative; flash `/agent` | "Same seeded shoppers for both strategies, labeled synthetic. When the model is wrong it can lose, which is why guardrails exist. Seller agents get scoped APIs. Next: bakery, deli, flowers, POS and shelf labels." |

**Contingencies.** If PayPal is unreachable, switch to the pre-recorded capture and say so. If the time machine lands on HOLD because of the cooldown, advance one more hour. Reset with "Reset demo" (seed 42 is deterministic, so rehearsals repeat exactly).
