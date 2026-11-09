/**
 * The fixed demo scenario: Rosa's fruit stand and the shoppers' agents that visit it.
 * Client-safe (no server imports). The seller side is played back, not recorded live.
 */

export const ROSA = {
  shopName: "Rosa’s Fruit Stand",
  owner: "Rosa",
  /** What Rosa says to her phone while pointing it at each crate (played back as a scene). */
  scenes: [
    {
      photo: "/photos/apples-box.jpg",
      lines: [
        "These are Fuji apples, 30 lb. Sweet and crisp, great for lunchboxes and pies.",
        "$2.89 a pound, but no less than $2.35.",
        "No rush, they keep for two weeks.",
        "The supermarket has Fujis at $3.49.",
        "If someone takes 5 lb or more, give them 10% off.",
        "Steady. About 10 pounds a day.",
      ],
      learned: "Fuji apples · $2.89/lb · never below $2.35 · no rush",
    },
    {
      photo: "/photos/peaches-hand.jpg",
      lines: [
        "Next is white peaches, 12 lb. A little soft, perfect for smoothies and jam.",
        "$3.79 per pound, lowest $2.15.",
        "They have to go today.",
        "We close at 6.",
        "The farm stand down the road sells them for $3.50.",
        "3 lb or more, 15% off.",
        "Anything left goes to compost.",
        "Slow this week. It's been cold.",
      ],
      learned: "White peaches · $3.79/lb · never below $2.15 · must go today",
    },
    {
      photo: "/photos/strawberries-market.jpg",
      lines: [
        "And this is strawberries, 8 boxes. Picked this morning, sweet and fragrant, great for parties.",
        "$5.49 a box, at least $4.25.",
        "Sell them by this week.",
        "Supermarket berries are $4.99, and they're not this fresh.",
        "No bulk deals on these.",
        "Leftovers I turn into jam.",
        "They sell out by noon on weekends.",
      ],
      learned: "Strawberries · $5.49/box · never below $4.25 · this week",
    },
  ],
  /** Rosa's phone video: one clip for opening the stall, then one per crate (generated, POV, hands only). */
  clips: { open: "/videos/rosa-open.mp4", scenes: ["/videos/rosa-apples.mp4", "/videos/rosa-peaches.mp4", "/videos/rosa-strawberries.mp4"] },
  photos: { "fuji apples": "/photos/apples-box.jpg", "white peaches": "/photos/peaches-hand.jpg", strawberries: "/photos/strawberries-market.jpg" } as Record<string, string>,
};

export type Priority = "cheapest" | "quality" | "balanced";

export interface Intent {
  /** Words the agent matches against the stall's products and the owner's own words. */
  want: string;
  qty: number;
  /** Total budget in cents, or null when the shopper said price doesn't matter. */
  budgetCents: number | null;
  priority: Priority;
  question: string | null;
}

export interface Persona {
  id: string;
  name: string;
  emoji: string;
  says: string;
  intent: Intent;
}

/** Shoppers with different goals. Each one's agent behaves differently against the same stall. */
export const PERSONAS: Persona[] = [
  {
    id: "maya",
    name: "Maya",
    emoji: "🥤",
    says: "Fruit for smoothies this week. 3 lb, cheapest you can find, $8 max.",
    intent: { want: "fruit smoothies", qty: 3, budgetCents: 800, priority: "cheapest", question: "Are they ripe enough for smoothies?" },
  },
  {
    id: "leo",
    name: "Leo",
    emoji: "🍎",
    says: "The sweetest apples for my kid’s lunchbox. 2 lb. Price doesn’t matter, quality does.",
    intent: { want: "sweet apples lunchbox", qty: 2, budgetCents: null, priority: "quality", question: "Are they sweet?" },
  },
  {
    id: "jun",
    name: "Jun",
    emoji: "🎉",
    says: "Strawberries for a party tonight. 3 boxes, keep it under $17.",
    intent: { want: "strawberries party", qty: 3, budgetCents: 1700, priority: "balanced", question: "Are they good for a party?" },
  },
  {
    id: "rex",
    name: "Rex",
    emoji: "🪙",
    says: "2 boxes of strawberries. I’ll pay $5 total, not a cent more.",
    intent: { want: "strawberries", qty: 2, budgetCents: 500, priority: "cheapest", question: null },
  },
];

const PURPOSE = /\b(smoothies?|jam|pies?|baking|lunch(?:box(?:es)?)?|kids?|party|parties|gift|snack|juice)\b/gi;

/** Turn a shopper's own sentence into an agent intent (deterministic, no AI needed). */
export function parseIntent(text: string): Intent {
  const t = text.trim();
  const qm = t.match(/(\d+(?:\.\d+)?)\s*(lbs?|pounds?|boxes|box|kg)\b/i) ?? t.match(/(?<![$\d.])\b(\d+)\b(?!\s*(?:dollars|\$|\.\d))/);
  const qty = qm ? Math.max(1, Math.min(10, Math.round(parseFloat(qm[1])))) : 1;
  const bm = t.match(/(?:under|below|max|budget|up to|at most|no more than|pay)\s*\$\s*(\d+(?:\.\d{1,2})?)/i) ?? t.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  const priceFree = /price doesn.?t matter|any price|whatever it costs/i.test(t);
  const budgetCents = bm && !priceFree ? Math.round(parseFloat(bm[1]) * 100) : null;
  const priority: Priority = /cheap|bargain|lowest|deal|budget|not a cent/i.test(t) ? "cheapest" : /best|sweetest|quality|freshest|premium/i.test(t) ? "quality" : "balanced";
  const adjective = t.match(/\b(sweet(?:est)?|fresh(?:est)?|ripe|crisp|juicy)\b/i)?.[1]?.toLowerCase().replace(/est$/, "");
  const purpose = t.match(PURPOSE)?.[0]?.toLowerCase();
  const question = adjective ? `Are they ${adjective === "sweet" || adjective === "fresh" ? adjective : adjective}?` : purpose ? `Are they good for ${purpose}?` : null;
  const want = t
    .replace(/\b\w+['’]\w+\b/g, " ")
    .replace(/\$\s*\d+(?:\.\d{1,2})?/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:lbs?|pounds?|boxes|box|kg)?\b/gi, " ")
    .replace(/\b(i|i’ll|i'll|want|need|for|my|a|the|this|week|tonight|keep|it|under|max|cheapest|you|can|find|price|doesn.?t|matter|quality|does|pay|total|not|cent|more|of|and|to)\b/gi, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { want: want || t, qty, budgetCents, priority, question };
}

export interface CatalogItemLite {
  productId: string;
  sku: string;
  shopId: string;
  name: string;
  unit: string;
  listPriceCents: number;
  available: number;
  facts: string[];
}

/** What colour a shopper might mean, for the rule-based agent only (the OpenAI agent just knows). */
const COLOURS: Record<string, string[]> = { red: ["strawberr", "apple", "cherr"], pink: ["peach", "strawberr"], orange: ["peach", "orange"], yellow: ["peach", "banana"], green: ["apple", "grape"] };

const words = (s: string) => (s.toLowerCase().match(/[a-z]+/g) ?? []).map((w) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, ""));

/** The buyer agent picks the product that best fits the intent, using only public catalog data. */
export function pickForIntent(items: CatalogItemLite[], intent: Intent): { item: CatalogItemLite; why: string } | null {
  const want = new Set(words(intent.want));
  const scored = items
    .filter((i) => i.available >= intent.qty)
    .map((i) => {
      const nameHits = words(i.name).filter((w) => want.has(w)).length;
      const factWords = words(i.facts.join(" "));
      const factHits = [...new Set(factWords.filter((w) => want.has(w) && w.length > 3))];
      const colourHit = [...want].some((w) => (COLOURS[w] ?? []).some((stem) => i.name.toLowerCase().includes(stem)));
      const generic = (want.has("fruit") ? 1 : 0) + (colourHit ? 2 : 0);
      const priceScore = intent.priority === "cheapest" ? -i.listPriceCents / 1000 : 0;
      return { i, score: nameHits * 3 + factHits.length * 2 + generic + priceScore, nameHits, factHits };
    })
    .filter((s) => s.score > 0 || s.nameHits > 0 || s.factHits.length > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  const why = best.factHits.length ? `the owner says “${best.i.facts.find((f) => words(f).some((w) => best.factHits.includes(w))) ?? best.i.facts[0]}”` : `it matches “${intent.want}”`;
  return { item: best.i, why };
}
