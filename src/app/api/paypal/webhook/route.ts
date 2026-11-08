import { NextResponse } from "next/server";
import { db } from "@/lib/server/http";
import { handlePayPalWebhook } from "@/lib/server/commerce";
import { getPayPalApi } from "@/lib/paypal/client";
export async function POST(req: Request) {
  const api = getPayPalApi();
  if (!api || !process.env.PAYPAL_WEBHOOK_ID) return NextResponse.json({ error: "WEBHOOK_DISABLED" }, { status: 404 });
  const raw = await req.text();
  const names = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"];
  const headers = Object.fromEntries(names.map((n) => [n, req.headers.get(n)]));
  try {
    const r = await handlePayPalWebhook(db(), api, headers, raw);
    return NextResponse.json({ note: r.note }, { status: r.httpStatus });
  } catch (e) {
    console.error("[webhook]", e);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 }); // PayPal retries
  }
}
