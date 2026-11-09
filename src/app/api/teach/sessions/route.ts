import { handle, db, readJson } from "@/lib/server/http";
import { createShopSession, newSessionForShop } from "@/lib/teach/service";
// Start teaching: a new shop ({shopName}) or a new morning session for an existing shop ({shopId}).
export const POST = handle(async (req: Request) => {
  const b = await readJson<{ shopName?: string; shopId?: string }>(req);
  return b.shopId ? newSessionForShop(db(), b.shopId) : createShopSession(db(), b.shopName ?? "");
});
