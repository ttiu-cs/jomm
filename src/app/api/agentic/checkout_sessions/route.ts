import { handle, db, readJson } from "@/lib/server/http";
import { createSession } from "@/lib/agentic/checkout";
// ACP-style: POST /checkout_sessions. A buyer agent opens a session for one item, optionally with a price proposal.
export const POST = handle(async (req: Request) => createSession(db(), await readJson(req)));
