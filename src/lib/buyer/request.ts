/** Parse a shopper's natural-language request for the demo buyer agent (deterministic). */
import { normalizeUnit } from "../teach/parser";

export interface BuyerRequest {
  qty: number;
  unit: string | null;
  budgetCents: number | null; // total budget
  keywords: string;
  question: string | null;
}

export function parseBuyerRequest(text: string): BuyerRequest {
  const t = text.trim();
  const qm = t.match(/(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kg|kilos?|boxes|box|bags?|packs?|pairs?|pieces?|pcs|items?|each)\b/i) ?? t.match(/\b(\d+)\s+(?!dollars?|bucks)([a-z]+)/i);
  const unitWord = qm?.[2];
  const unit = unitWord && /^(lbs?|pounds?|kg|kilos?|boxes|box|bags?|packs?|pairs?|pieces?|pcs|items?|each)$/i.test(unitWord) ? normalizeUnit(unitWord) : null;
  const qty = qm ? Math.max(1, Math.min(10, Math.round(parseFloat(qm[1])))) : 1;
  const bm = t.match(/(?:under|below|max(?:imum)?|budget(?: of| is)?|up to|no more than|at most|for)\s*\$\s*(\d+(?:\.\d{1,2})?)/i) ?? t.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  const budgetCents = bm ? Math.round(parseFloat(bm[1]) * 100) : null;
  let keywords = t
    .replace(/(?:under|below|max(?:imum)?|budget(?: of| is)?|up to|no more than|at most|for)?\s*\$\s*\d+(?:\.\d{1,2})?\s*(?:total|in total)?/gi, " ")
    .replace(/(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kg|kilos?|boxes|box|bags?|packs?|pairs?|pieces?|pcs|items?|each)\b/gi, " ")
    .replace(/\b(i want|i need|find me|get me|buy me|looking for|please|some|of)\b/gi, " ")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!keywords) keywords = t;
  const adjectives = keywords.match(/\b(sweet|crisp|juicy|ripe|fresh|organic|warm|waterproof|soft|clean|like new)\b/i);
  const question = adjectives ? `Are they ${adjectives[1].toLowerCase()}?` : null;
  return { qty, unit, budgetCents, keywords, question };
}
