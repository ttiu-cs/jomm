import { bus, type BusEvent } from "@/lib/server/events";
export const dynamic = "force-dynamic";
// Server-Sent Events: clients refetch state when something changes.
export async function GET(req: Request) {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (ev: BusEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
      const ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 15000);
      bus.on("event", send);
      controller.enqueue(enc.encode("retry: 2000\n\n"));
      cleanup = () => { clearInterval(ping); bus.off("event", send); };
      req.signal.addEventListener("abort", () => { cleanup(); try { controller.close(); } catch {} });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
