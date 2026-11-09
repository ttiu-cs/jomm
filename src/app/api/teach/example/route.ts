import { handle, db, readJson } from "@/lib/server/http";
import { createShopSession, EXAMPLE_SCRIPTS, teachTurn } from "@/lib/teach/service";
import { DomainError } from "@/lib/server/util";
// Rehearsal / stage fallback: replays a scripted owner walk-through through the normal turn logic.
export const POST = handle(async (req: Request) => {
  const b = await readJson<{ script?: string }>(req);
  const sc = EXAMPLE_SCRIPTS[b.script ?? ""];
  if (!sc) throw new DomainError("VALIDATION", "script must be fruit or closet", 422);
  const d = db();
  const s = createShopSession(d, sc.shopName);
  let last = s;
  for (const line of sc.lines) last = await teachTurn(d, s.id, { text: line });
  return last;
});
