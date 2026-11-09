import { handle, db } from "@/lib/server/http";
import { cancelSession } from "@/lib/agentic/checkout";
// ACP-style: POST /checkout_sessions/{id}/cancel. The buyer agent walks away; nothing is charged.
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => cancelSession(db(), (await params).id));
