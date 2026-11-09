import QRCode from "qrcode";
import { db } from "@/lib/server/http";
import { getItemBySku } from "@/lib/teach/catalog";
export const dynamic = "force-dynamic";
// SVG QR code pointing to the item's page, for printed shelf labels.
export async function GET(req: Request, { params }: { params: Promise<{ shopId: string; sku: string }> }) {
  const { shopId, sku } = await params;
  try {
    getItemBySku(db(), shopId, decodeURIComponent(sku));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const origin = new URL(req.url).origin;
  const svg = await QRCode.toString(`${origin}/s/${shopId}/${encodeURIComponent(decodeURIComponent(sku))}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
}
