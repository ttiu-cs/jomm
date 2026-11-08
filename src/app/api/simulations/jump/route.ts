import { handle, db, readJson, resolveProductId } from "@/lib/server/http";
import { jumpToScenario, DEMO_SCENARIOS } from "@/lib/server/sim-service";
import { DomainError } from "@/lib/server/util";
export const POST = handle(async (req: Request) => {
  const d = db();
  const b = await readJson<{ sku?: string; scenario?: string }>(req);
  const s = DEMO_SCENARIOS[b.scenario as keyof typeof DEMO_SCENARIOS];
  if (!s) throw new DomainError("VALIDATION", "scenario must be lunch or closing", 422);
  jumpToScenario(d, resolveProductId(d, b.sku), s);
  return { ok: true, scenario: b.scenario };
});
