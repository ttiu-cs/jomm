import { handle, db } from "@/lib/server/http";
import { acceptCounter } from "@/lib/server/negotiation";
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => acceptCounter(db(), (await params).id));
