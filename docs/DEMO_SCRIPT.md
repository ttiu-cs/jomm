# 3-minute demo script

**One line:** Shoppers’ AI agents come to a small stall. The stall’s own agent sells to each one the owner’s way, and PayPal pays the owner.

**Positioning:** Shopping is moving to AI agents, and PayPal is building the rails (Agent Ready, Store Sync, Orders v2). Big merchants will plug in. A fruit stand has no catalog and no developer. Jomm. puts the smallest seller on those rails by talking.

## Setup
- Start the app and open `/demo` on a laptop (projector) at 1440 px wide or more.
- With PayPal Sandbox keys, run one checkout beforehand so the Sandbox login is warm, and keep a backup recording of the PayPal step. Without keys, the payment is labeled “practice”; say so, and never present it as a PayPal payment.

## Script
| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00–0:20 | `/demo` top | Let Rosa’s replay play | “This is Rosa. Before opening, she points her phone at each crate and talks, once. Price, the lowest she’d take, whether it must go today.” |
| 0:20–0:40 | Act 1 card | Point at the private limits | “Her agent turned that into listings and private rules. The lock means no buyer will ever see these numbers.” |
| 0:40–1:30 | Maya | Click **Maya’s agent** | “Maya wants smoothie fruit, cheapest, $8 max. Her agent reads Rosa’s product feed and picks the soft peaches, because Rosa said they’re perfect for smoothies. They haggle. Rosa said peaches must go today, so her agent gives ground.” Point at the dark panel: “Every step is a checkout session with PayPal as the payment provider, the shape PayPal Agent Ready uses.” |
| 1:30–1:50 | Approve | Click Pay (PayPal) | “Maya’s agent can’t pay on its own. Maya approves in PayPal. The server captures and verifies with PayPal.” Point at the phone: “Rosa’s phone: PayPal, $7.95. Peaches gone before they turned.” |
| 1:50–2:20 | Leo, then Rex | Click **Leo’s agent**, approve; click **Rex’s agent** | “Leo only cares about quality: he asks if they’re sweet and pays full price. Rex lowballs. Rosa’s agent holds the line above her private floor. No sale, nothing charged.” |
| 2:20–2:45 | Custom intent | Type “4 lb peaches for jam, under $10” | “Any shopper, any agent, any intent. Same stall rules.” |
| 2:45–3:00 | Rosa’s phone | Point at the day total | “Rosa never looked up from her crates. Her agent sold four different ways, and PayPal paid her.” |

## Say correctly
- Rosa’s teaching is a scripted replay. It runs her words through the real teaching parser, but no live camera is used in the demo.
- The checkout sessions follow the Agentic Commerce Protocol shape that PayPal Agent Ready accepts, and the product feed follows the idea of Store Sync. Neither is connected to PayPal’s Agent Ready or Store Sync programs in this build. The price negotiation is our own extension.
- Payment is PayPal Orders v2 in Sandbox (test money) when keys are set; otherwise a labeled practice payment.
- Rosa’s reactions on her phone are scripted lines, chosen by what actually happened.
