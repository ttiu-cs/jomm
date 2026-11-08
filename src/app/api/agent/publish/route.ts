import { NextResponse } from "next/server";
import { handle, db, readJson } from "@/lib/server/http";
import { authenticateAgent } from "@/lib/agent/auth";
import { publishDecision } from "@/lib/server/pricing-service";
import { DomainError } from "@/lib/server/util";
// Agents may only publish a server-computed decision, never an arbitrary price, and only if policy allows.
export const POST = handle(async (req: Request) => {
  const a = authenticateAgent(req.headers.get("authorization"), "pricing:publish");
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const b = await readJson<{ decisionId?: string }>(req);
  if (!b.decisionId) throw new DomainError("VALIDATION", "decisionId required", 422);
  return publishDecision(db(), b.decisionId, a.actor);
});
