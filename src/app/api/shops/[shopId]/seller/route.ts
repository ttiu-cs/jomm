import { handle, db } from "@/lib/server/http";
import { sellerDashboard } from "@/lib/teach/catalog";
export const dynamic = "force-dynamic";
// Seller-private (merchant auth when MERCHANT_BASIC_AUTH is set): includes floors and all deals.
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ shopId: string }> }) => sellerDashboard(db(), (await params).shopId));
