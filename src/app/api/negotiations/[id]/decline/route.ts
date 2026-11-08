import { handle, db } from "@/lib/server/http";
import { declineNegotiation } from "@/lib/server/negotiation";
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => declineNegotiation(db(), (await params).id));
