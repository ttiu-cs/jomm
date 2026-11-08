import { NextResponse } from "next/server";
import { handle, db, resolveProductId } from "@/lib/server/http";
import { authenticateAgent } from "@/lib/agent/auth";
import { agentContext } from "@/lib/server/agent-view";
export const dynamic = "force-dynamic";
export const GET = handle((req: Request) => {
  const a = authenticateAgent(req.headers.get("authorization"), "pricing:read");
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const d = db();
  return agentContext(d, resolveProductId(d, new URL(req.url).searchParams.get("sku")));
});
