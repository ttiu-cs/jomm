"use client";
import { useLive } from "./useLive";

export interface SellerData {
  shop: { id: string; name: string };
  items: {
    productId: string;
    sku: string;
    name: string;
    unit: string;
    listPriceCents: number;
    available: number;
    floorCents: number;
    sellBy: "today" | "this_week" | "no_rush";
    sold: number;
    condition: string | null;
    facts: string[];
    photo?: string | null;
  }[];
  negotiations: { id: string; status: string; qty: number; name: string; unit: string; agreed_price_cents: number | null; published_cents: number; last_message: string | null; created_at: string }[];
  sales: { id: string; status: string; payment_source: string; total_cents: number; qty: number; name: string; unit: string; origin: string; capture_id: string | null; verified: number | null; paid_at: string | null }[];
  totals: { paypalCents: number; mockCents: number; orders: number };
}

export const SELL_BY_LABEL: Record<string, string> = { today: "Sell today", this_week: "This week", no_rush: "No rush" };

export function useSeller(shopId: string) {
  return useLive<SellerData>(`/api/shops/${shopId}/seller`, 5000);
}
