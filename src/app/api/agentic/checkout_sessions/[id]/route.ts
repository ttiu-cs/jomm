import { handle, db, readJson } from "@/lib/server/http";
import { sessionView, updateSession } from "@/lib/agentic/checkout";
type P = { params: Promise<{ id: string }> };
// ACP-style: GET / POST /checkout_sessions/{id}. Updates carry the negotiation extension.
export const GET = handle(async (_req: Request, { params }: P) => sessionView(db(), (await params).id));
export const POST = handle(async (req: Request, { params }: P) => updateSession(db(), (await params).id, await readJson(req)));
