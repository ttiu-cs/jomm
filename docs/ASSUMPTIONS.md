# Assumptions and what is real vs synthetic

## Real / synthetic / mocked / unavailable
| Thing | Status |
|---|---|
| Pricing optimizer, guardrails, reason codes | **Real code**, deterministic, unit-tested |
| Demand model parameters | **Assumptions** (configurable, seeded). Not estimated from real data. |
| Walk-in shoppers advanced by the time machine | **SIMULATED** (seeded Poisson arrivals + per-shopper uniform draws) |
| 7 days of prior exposure history | **SYNTHETIC_HISTORY** (exists only so confidence starts at "medium"; `npm run seed -- --cold-start` disables it) |
| Pricing Lab results, lift and sensitivity | **Synthetic simulation**, not observed business lift |
| Storefront checkout with Sandbox credentials | **Real PayPal Sandbox** API calls (test money) |
| Storefront checkout without credentials | **MOCK_CHECKOUT**, labeled everywhere, not PayPal |
| PayPal flow tests | Run against an in-memory fake of Orders v2 (`tests/helpers.ts`) |
| LLM narration and policy drafting | **Optional**. With no `ANTHROPIC_API_KEY`, deterministic fallback. LLM output never sets prices or applies policy. |
| Weather and events | Synthetic selectors; no live weather API |
| POS, ESL, ERP, multi-store, buyer-agent checkout | **Unavailable** (roadmap) |

## Illustrative unit economics (`src/lib/pricing/scenario.ts`)
| Item | Value | Treatment |
|---|---|---|
| Ingredients / packaging / labor | $2.30 / $0.35 / $0.55 = **$3.20** | Sunk once produced → excluded from objective, reported as accounting COGS |
| Fulfillment per order | $0.10 | Incremental |
| Payment fee | 3.49% + $0.49 | Incremental. An **assumption**, not a quoted PayPal rate. |
| Disposal per unsold unit | $0.25 | Incremental at close |
| Full-cost break-even | ≈ $3.93 | Floor is raised to this ($4.00 on grid) if "allow below full cost" is off |

## Demand model
- Expected product views per hour: 9:7, 10:9, 11:20, 12:34, 13:25, 14:10, 15:8, 16:9, 17:15, 18:12, 19:8 (about 157 per day).
- Conversion at $7.00 reference: 60%. Sensitivity `b = 0.16 /$` (point elasticity ≈ −1.1 at $7). At 12:00–13:00, `b × 0.65` (lunch shoppers less price-sensitive). Conversion capped at 95%.
- Weather multipliers: sunny ×1.10, cloudy ×1.00, rainy ×0.75, hot ×1.25. Office event 11–13 ×1.5. Street festival 15–19 ×1.6.
- "Unforecasted traffic" (time machine slider, Lab "True traffic ×") changes the simulated world only. The optimizer learns about it only through observed sell-through.

## Default policy
Floor $4.00, ceiling $9.50, max step $1.00 per publication, 60 store-minute cooldown, min expected gain $0.25, approval mode, below-cost allowed (floor is already above break-even), agents may not publish, low confidence requires approval, $0.25 price grid, quote TTL 5 minutes (real wall-clock).

## Modeling approximations (be honest about these)
- One unit per order in the economics (qty > 1 orders still decrement correctly).
- DP continuation ignores the step limit and cooldown for future hours. The current decision respects them.
- No cross-item substitution, no strategic waiting by shoppers, no day-to-day carry-over (sell-by = close).
- Calibration is a shrunk observed/forecast ratio, not a fitted model. Confidence is a heuristic based on exposure volume and price variety.
- Store clock is simulated; quote expiry uses real time. Cooldown is measured in simulated store minutes.
- Synthetic lift (≈ +2–4% contribution in the base case) can turn negative when shoppers are more price-sensitive than the model assumes. The Lab shows this on purpose.
