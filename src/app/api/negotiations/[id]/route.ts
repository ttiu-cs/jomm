import { handle, db } from "@/lib/server/http";
import { buyerView } from "@/lib/server/negotiation";
export const dynamic = "force-dynamic";
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => buyerView(db(), (await params).id));
