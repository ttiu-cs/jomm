import { handle, db } from "@/lib/server/http";
import { shopPage } from "@/lib/teach/catalog";
export const dynamic = "force-dynamic";
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ shopId: string }> }) => shopPage(db(), (await params).shopId));
