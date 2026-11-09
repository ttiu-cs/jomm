import { db, readJson } from "@/lib/server/http";
import { runBuyerAgent, type AgentEvent } from "@/lib/agentic/buyer-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Runs the shopper's buyer agent and streams what it does as NDJSON events.
export async function POST(req: Request) {
  const b = await readJson<{ intent?: string; shopId?: string }>(req);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        if (!b.shopId) throw new Error("shopId required");
        await runBuyerAgent(db(), b.shopId, b.intent ?? "", emit);
      } catch (e) {
        emit({ type: "done", outcome: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
