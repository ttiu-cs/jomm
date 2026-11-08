import { handle, db } from "@/lib/server/http";
import { orderView } from "@/lib/server/commerce";
export const dynamic = "force-dynamic";
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => orderView(db(), (await params).id));
