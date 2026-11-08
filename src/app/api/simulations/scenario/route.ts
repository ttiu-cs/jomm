import { handle, db, readJson, resolveProductId, MERCHANT } from "@/lib/server/http";
import { setScenario } from "@/lib/server/sim-service";
import { z } from "zod";
const Body = z.object({ sku: z.string().optional(), weather: z.enum(["sunny", "cloudy", "rainy", "hot"]).optional(), event: z.enum(["none", "office_event", "street_festival"]).optional(), demandShift: z.number().min(0.2).max(3).optional() }).strict();
export const POST = handle(async (req: Request) => {
  const d = db();
  const b = Body.parse(await readJson(req));
  setScenario(d, resolveProductId(d, b.sku), b);
  return { ok: true };
});
