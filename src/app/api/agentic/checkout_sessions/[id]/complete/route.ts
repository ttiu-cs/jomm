import { handle, db } from "@/lib/server/http";
import { completeSession } from "@/lib/agentic/checkout";
// ACP-style: POST /checkout_sessions/{id}/complete. Creates the order; the buyer then approves in PayPal.
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => completeSession(db(), (await params).id));
