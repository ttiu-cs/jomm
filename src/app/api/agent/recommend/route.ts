import { NextResponse } from "next/server";
import { handle, db, readJson, resolveProductId } from "@/lib/server/http";
import { authenticateAgent } from "@/lib/agent/auth";
import { computeRecommendation } from "@/lib/server/pricing-service";
import { summarizeDecision } from "@/lib/server/agent-view";
export const POST = handle(async (req: Request) => {
  const a = authenticateAgent(req.headers.get("authorization"), "pricing:recommend");
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const d = db();
  const b = await readJson<{ sku?: string }>(req);
  return summarizeDecision(computeRecommendation(d, resolveProductId(d, b.sku), a.actor));
});
