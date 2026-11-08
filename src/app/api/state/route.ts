import { handle, db, resolveProductId } from "@/lib/server/http";
import { dashboardState } from "@/lib/server/state";
export const dynamic = "force-dynamic";
export const GET = handle((req: Request) => {
  const d = db();
  const url = new URL(req.url);
  return dashboardState(d, resolveProductId(d, url.searchParams.get("sku")));
});
