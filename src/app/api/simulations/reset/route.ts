import { handle, db, readJson, resolveProductId, MERCHANT } from "@/lib/server/http";
import { seedDemo } from "@/lib/server/sim-service";
import { z } from "zod";
const Body = z.object({ seed: z.number().int().min(0).max(1e9).optional(), openingStock: z.number().int().min(0).max(1000).optional(), withHistory: z.boolean().optional(), weather: z.enum(["sunny", "cloudy", "rainy", "hot"]).optional(), event: z.enum(["none", "office_event", "street_festival"]).optional(), demandShift: z.number().min(0.2).max(3).optional() }).strict();
export const POST = handle(async (req: Request) => {
  seedDemo(db(), Body.parse(await readJson(req)));
  return { ok: true };
});
