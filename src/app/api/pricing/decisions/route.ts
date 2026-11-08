import { handle, db, resolveProductId } from "@/lib/server/http";
import { listDecisions } from "@/lib/server/pricing-service";
export const dynamic = "force-dynamic";
export const GET = handle((req: Request) => {
  const d = db();
  const u = new URL(req.url);
  return listDecisions(d, resolveProductId(d, u.searchParams.get("sku")), undefined, Number(u.searchParams.get("limit") ?? 50));
});
