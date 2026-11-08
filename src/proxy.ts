import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional HTTP Basic auth for merchant surfaces (set MERCHANT_BASIC_AUTH="user:password" when
 * deploying publicly). Shopper storefront, quote/order/PayPal routes and the token-authenticated
 * agent API stay public.
 */
const MERCHANT_PATHS = [/^\/merchant/, /^\/lab/, /^\/api\/state/, /^\/api\/pricing\//, /^\/api\/simulations\//, /^\/api\/orders\/[^/]+\/reconcile/];

export function proxy(req: NextRequest) {
  const cred = process.env.MERCHANT_BASIC_AUTH;
  if (!cred || !MERCHANT_PATHS.some((r) => r.test(req.nextUrl.pathname))) return NextResponse.next();
  const h = req.headers.get("authorization");
  if (h?.startsWith("Basic ") && atob(h.slice(6)) === cred) return NextResponse.next();
  return new NextResponse("Merchant authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Retail Pricing OS merchant"' } });
}

export const config = { matcher: ["/merchant/:path*", "/lab/:path*", "/api/:path*"] };
