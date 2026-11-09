/**
 * Channel3 product search (https://trychannel3.com), used while a seller teaches a second-hand item:
 * the agent looks up what the same kind of item sells for new online, so it can suggest a resale
 * price and later haggle with "new ones go for $X". Server-side only (CHANNEL3_API_KEY).
 *
 * Channel3 indexes general merchandise (clothing, home, electronics), not groceries, so it is only
 * used for items sold one by one ("each"), never for produce.
 */

export interface PriceLookup {
  source: "channel3";
  query: string;
  count: number;
  lowCents: number;
  medianCents: number;
  highCents: number;
  examples: { title: string; priceCents: number; domain: string }[];
}

type Fetch = typeof fetch;
const cache = new Map<string, PriceLookup | null>();

export function channel3Configured() {
  return !!process.env.CHANNEL3_API_KEY?.trim();
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Summarize search hits into a new-price range: same-brand offers first, outliers dropped. */
export function summarize(query: string, products: { title: string; offers?: { price?: { price?: number; currency?: string }; domain?: string; condition?: string }[] }[]): PriceLookup | null {
  const hits = products
    .map((p) => {
      const o = p.offers?.find((x) => x.price?.price && (x.price.currency ?? "USD") === "USD" && (x.condition ?? "new") === "new");
      return o ? { title: p.title, priceCents: Math.round(o.price!.price! * 100), domain: o.domain ?? "" } : null;
    })
    .filter((h): h is { title: string; priceCents: number; domain: string } => !!h && h.priceCents > 0);
  if (hits.length < 3) return null;
  const brand = query.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  const sameBrand = brand.length >= 3 ? hits.filter((h) => `${h.title} ${h.domain}`.toLowerCase().replace(/[^a-z0-9 .]/g, "").includes(brand)) : [];
  let pool = sameBrand.length >= 3 ? sameBrand : hits;
  const m = median(pool.map((h) => h.priceCents));
  pool = pool.filter((h) => h.priceCents <= m * 2.5 && h.priceCents >= m / 2.5);
  if (pool.length < 3) return null;
  const prices = pool.map((h) => h.priceCents).sort((a, b) => a - b);
  return {
    source: "channel3",
    query,
    count: pool.length,
    lowCents: prices[0],
    medianCents: median(prices),
    highCents: prices[prices.length - 1],
    examples: pool.slice(0, 3),
  };
}

export async function lookupNewPrice(query: string, f: Fetch = fetch): Promise<PriceLookup | null> {
  const key = process.env.CHANNEL3_API_KEY?.trim();
  const q = query.trim().slice(0, 80);
  if (!key || q.length < 3) return null;
  if (cache.has(q.toLowerCase())) return cache.get(q.toLowerCase())!;
  try {
    const res = await f("https://api.trychannel3.com/v1/search", {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, limit: 12 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const out = summarize(q, ((await res.json()) as { products?: [] }).products ?? []);
    cache.set(q.toLowerCase(), out);
    return out;
  } catch (e) {
    console.warn("[channel3] lookup failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Fair resale range as a share of the new price, by condition. */
export function resaleRange(newCents: number, condition: string | null): { lowCents: number; highCents: number; label: string } {
  const [lo, hi, label] =
    condition === "Like new" ? [0.45, 0.55, "like new"] : condition === "Has flaws" ? [0.2, 0.3, "with a small flaw"] : condition === "Good" ? [0.3, 0.4, "lightly worn"] : [0.3, 0.4, "used"];
  const r = (x: number) => Math.round((newCents * x) / 100) * 100; // whole dollars
  return { lowCents: r(lo), highCents: r(hi), label };
}
