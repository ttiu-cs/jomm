/** Pricing Lab: fixed vs adaptive under identical seeded synthetic conditions. ALL SYNTHETIC. */
import { simulateDay, compareStrategies, sensitivityGrid, type SimConfig } from "../pricing/simulator";
import { DEFAULT_COSTS, DEFAULT_DEMAND_MODEL, DEFAULT_POLICY, CLOSE_HOUR, OPEN_HOUR } from "../pricing/scenario";
import type { LocalEvent, Weather } from "../pricing/types";

const WEATHERS: Weather[] = ["sunny", "cloudy", "rainy", "hot"];
const EVENTS: LocalEvent[] = ["none", "office_event", "street_festival"];

export function runLab(q: URLSearchParams) {
  const num = (k: string, d: number, lo: number, hi: number) => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && q.get(k) !== null ? Math.min(hi, Math.max(lo, v)) : d;
  };
  const weather = (WEATHERS as string[]).includes(q.get("weather") ?? "") ? (q.get("weather") as Weather) : "cloudy";
  const event = (EVENTS as string[]).includes(q.get("event") ?? "") ? (q.get("event") as LocalEvent) : "none";
  const seed = num("seed", 42, 0, 1e9);
  const fixed = Math.round(num("fixedPrice", 700, 300, 1500) / 25) * 25;
  const stock = num("stock", 100, 10, 300);
  const seeds = num("seeds", 20, 1, 60);
  const truthSens = num("truthSensitivity", 1, 0.3, 3);
  const truthDemand = num("truthDemand", 1, 0.3, 3);
  const model = DEFAULT_DEMAND_MODEL;
  const truth = {
    ...model,
    sensitivityPerDollar: model.sensitivityPerDollar * truthSens,
    hourlyVisits: Object.fromEntries(Object.entries(model.hourlyVisits).map(([h, v]) => [h, v * truthDemand])),
  };
  const cfg: SimConfig = {
    seed,
    openHour: OPEN_HOUR,
    closeHour: CLOSE_HOUR,
    openingStock: stock,
    costs: DEFAULT_COSTS,
    policy: { ...DEFAULT_POLICY, mode: "autopilot", cooldownMinutes: 60 },
    model,
    truth,
    ctx: { weather, event, demandMultiplier: 1 },
  };
  const seedList = Array.from({ length: seeds }, (_, i) => seed + i);
  return {
    label: "SYNTHETIC SIMULATION — not observed business results",
    assumptions: { seed, weather, event, fixedPriceCents: fixed, openingStock: stock, seeds, truthSensitivityMult: truthSens, truthDemandMult: truthDemand, policy: cfg.policy, costs: cfg.costs },
    day: { fixed: simulateDay(cfg, { kind: "fixed", priceCents: fixed }), adaptive: simulateDay(cfg, { kind: "adaptive", startPriceCents: fixed }) },
    summary: compareStrategies(cfg, fixed, seedList),
    sensitivity: q.get("sensitivity") === "0" ? [] : sensitivityGrid(cfg, fixed, seedList.slice(0, Math.min(10, seeds))),
  };
}
