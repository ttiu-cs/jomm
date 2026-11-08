import { handle, db, readJson, resolveProductId, MERCHANT } from "@/lib/server/http";
import { advanceHour, runToClose, startNewDay } from "@/lib/server/sim-service";
export const POST = handle(async (req: Request) => {
  const d = db();
  const b = await readJson<{ sku?: string; mode?: "hour" | "close" | "newday"; openingStock?: number }>(req);
  const pid = resolveProductId(d, b.sku);
  if (b.mode === "close") return { hours: runToClose(d, pid) };
  if (b.mode === "newday") { startNewDay(d, pid, b.openingStock ?? 100); return { ok: true }; }
  return { hours: [advanceHour(d, pid)] };
});
