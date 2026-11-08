import { handle, db, resolveProductId } from "@/lib/server/http";
import { storefrontState } from "@/lib/server/state";
import { getContext } from "@/lib/server/context";
export const dynamic = "force-dynamic";
// Shopper-safe state. Logs a VIEW exposure (conversion denominator) when ?view=1.
export const GET = handle((req: Request) => {
  const d = db();
  const url = new URL(req.url);
  const pid = resolveProductId(d, url.searchParams.get("sku"));
  const s = storefrontState(d, pid);
  if (url.searchParams.get("view") === "1" && s.price && s.storeOpen) {
    const c = getContext(d, pid);
    d.prepare("INSERT INTO exposure_events (product_id, sim_day, sim_hour, source, kind, count, price_cents, created_at) VALUES (?,?,?,?,?,?,?,?)").run(pid, c.sim.sim_day, c.sim.current_hour, "STOREFRONT", "VIEW", 1, s.price.priceCents, new Date().toISOString());
  }
  return s;
});
