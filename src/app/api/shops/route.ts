import { handle, db } from "@/lib/server/http";
import { listShops } from "@/lib/teach/catalog";
export const dynamic = "force-dynamic";
export const GET = handle(() => listShops(db()));
