/**
 * Deterministic interpreter for what a shop owner says while showing items to the camera.
 * Used when no LLM key is configured, and as a safety net when the LLM response is invalid.
 * English first, with a few common Korean phrases.
 */

export type SellBy = "today" | "this_week" | "no_rush";

export interface DraftFields {
  name: string;
  unit: string;
  quantity: number | null;
  listPriceCents: number | null;
  floorPriceCents: number | null;
  condition: string | null;
  sellBy: SellBy | null;
  facts: string[];
}

export interface Interpretation {
  newItemName: string | null;
  set: Partial<Omit<DraftFields, "name" | "facts">>;
  addFacts: string[];
}

const UNIT_MAP: [RegExp, string][] = [
  [/^(lbs?|pounds?)$/i, "lb"],
  [/^(kg|kilos?|kilograms?)$/i, "kg"],
  [/^(box|boxes|박스)$/i, "box"],
  [/^(bags?)$/i, "bag"],
  [/^(bunch|bunches|단)$/i, "bunch"],
  [/^(packs?|팩)$/i, "pack"],
  [/^(pairs?|켤레)$/i, "pair"],
  [/^(pieces?|pcs|items?|each|units?|개|벌)$/i, "each"],
];
const UNIT_WORDS = "lbs?|pounds?|kg|kilos?|kilograms?|boxes|box|bags?|bunch(?:es)?|packs?|pairs?|pieces?|pcs|items?|units?|each|개|박스|팩|단|켤레|벌";

const NEW_ITEM = /(?:^|[.!?]\s*|\b(?:and|okay|ok|now|next)[,]?\s+)(?:this is|these are|here (?:is|are)|next (?:is|are|up is|we have)|now (?:this is|these are)|over here (?:is|are|we have)|this one is|이건|이거는|이것은|이쪽은|여기는)\s+(?:a |an |some |our |my |the )?([^,.;!?]+)/i;

const FLOOR = new RegExp(
  String.raw`(?:no less than|not less than|nothing (?:less|lower) than|at least|lowest(?: price)?(?: i(?:'d| would) (?:take|accept|go))?(?: is)?|minimum(?: price)?(?: is)?|floor(?: is| of)?|don'?t go (?:below|under|lower than)|never (?:below|under)|not (?:below|under)|bottom(?: line)?(?: is)?|최저(?:가)?(?:는)?|최소)\s*(?:is\s*)?(?:\$\s*)?(\d+(?:\.\d{1,2})?)`,
  "i",
);
const MONEY = /\$\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks|usd|달러)/gi;
const QTY = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(${UNIT_WORDS})\b`, "i");
const QTY_LOOSE = /(?:we have|i have|there (?:are|is)|about|around|got)\s+(\d+)(?!\s*(?:dollars?|bucks|\$|%|years?|months?|days?|hours?))/i;
const QTY_LEFT = /(\d+)\s+(?:of them|left|in stock|on hand)/i;

const DESCRIPTOR =
  /\b(sweet|sour|tart|crisp|crunchy|juicy|ripe|overripe|soft|firm|fresh|organic|local|picked|harvest|season|flavor|taste|tasty|size|large|small|big|medium|heavy|brand|vintage|wore|worn|wear|used|new|tags?|stain|stains|tear|hole|scratch|faded|fit|fits|warm|waterproof|leather|wool|cotton|silk|denim|condition|perfect|great|good|bruis\w*|blemish\w*|seedless|heirloom|grade|imported|handmade)\b|달|아삭|신선|당도|새것|얼룩|사이즈/i;

function round2(x: number) {
  return Math.round(x * 100);
}

export function normalizeUnit(word: string | undefined): string {
  if (!word) return "each";
  for (const [re, u] of UNIT_MAP) if (re.test(word.trim())) return u;
  return "each";
}

function cleanName(raw: string): string {
  let n = raw
    .replace(new RegExp(String.raw`\b\d+(?:\.\d+)?\s*(?:${UNIT_WORDS})\b.*$`, "i"), "")
    .replace(/\$.*$/, "")
    .replace(/\b(?:and|that|which|we|they|it)\b.*$/i, "")
    .trim();
  n = n.split(/\s+/).slice(0, 5).join(" ");
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function interpretUtterance(text: string): Interpretation {
  const t = text.trim();
  const out: Interpretation = { newItemName: null, set: {}, addFacts: [] };
  if (!t) return out;

  const ni = t.match(NEW_ITEM);
  if (ni) {
    const name = cleanName(ni[1]);
    if (name.length >= 2) out.newItemName = name;
  }

  let floor: number | null = null;
  const fm = t.match(FLOOR);
  if (fm) {
    floor = round2(parseFloat(fm[1]));
    out.set.floorPriceCents = floor;
  }
  const amounts: { cents: number; index: number }[] = [];
  for (const m of t.matchAll(MONEY)) amounts.push({ cents: round2(parseFloat(m[1] ?? m[2])), index: m.index ?? 0 });
  const list = amounts.find((a) => a.cents !== floor || amounts.length === 1 && floor === null);
  if (list && list.cents !== floor) out.set.listPriceCents = list.cents;

  const qm = t.match(QTY);
  if (qm && !/^\$/.test(t.slice(Math.max(0, (qm.index ?? 0) - 1), qm.index ?? 0))) {
    out.set.quantity = Math.round(parseFloat(qm[1]));
    out.set.unit = normalizeUnit(qm[2]);
  } else {
    const lm = t.match(QTY_LEFT) ?? t.match(QTY_LOOSE);
    if (lm) out.set.quantity = parseInt(lm[1], 10);
    else {
      const wm = t.match(/\b(?:just |only )?(one|two|three|four|five|six|seven|eight|nine|ten)\b(?: of (?:them|these))?(?:\s+(?:left|in stock|pieces?|items?))?/i);
      const words = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
      if (wm && (/^\s*(?:just |only )?(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(t) || /\b(left|in stock|of them|of these|i have|we have)\b/i.test(t)))
        out.set.quantity = words.indexOf(wm[1].toLowerCase()) + 1;
    }
  }

  if (/\b(today|tonight|by (?:close|closing|the end of (?:the )?day)|end of (?:the )?day)\b|오늘/i.test(t)) out.set.sellBy = "today";
  else if (/\b(this week|in a few days|by (?:the )?weekend|this weekend)\b|이번 ?주/i.test(t)) out.set.sellBy = "this_week";
  else if (/\b(no rush|no hurry|not in a hurry|whenever|take (?:your|its) time)\b|급하지/i.test(t)) out.set.sellBy = "no_rush";

  if (/\b(like new|brand new|new with tags|never (?:worn|used)|unworn)\b|새것/i.test(t)) out.set.condition = "Like new";
  else if (/\b(?:(?:barely|only) (?:worn|used)|worn (?:once|twice)|good condition|great condition)\b/i.test(t)) out.set.condition = "Good";
  else if (/\b(stain|stains|tear|hole|scratch|damage|faded|worn out|missing button)\b|얼룩/i.test(t)) out.set.condition = "Has flaws";
  else if (/\b(overripe|very ripe|bruis\w*|soft)\b/i.test(t)) out.set.condition = "Very ripe";
  else if (/\b(fresh|picked (?:this|today)|this morning|just came in)\b|신선/i.test(t)) out.set.condition = "Fresh";

  for (const clause of t.split(/(?<=[.!?;])\s+|,\s+(?=[a-z가-힣])/i)) {
    const c = clause.replace(NEW_ITEM, "").trim().replace(/^[,.\s]+|[,.\s]+$/g, "");
    if (c.length < 4 || !DESCRIPTOR.test(c)) continue;
    if (FLOOR.test(c) && c.replace(FLOOR, "").trim().split(/\s+/).length < 3) continue;
    out.addFacts.push(c.charAt(0).toUpperCase() + c.slice(1));
  }
  return out;
}

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const per = (unit: string) => (unit === "each" ? "each" : `per ${unit}`);

/** The next question the seller agent asks about the item in focus. */
export function nextQuestion(item: DraftFields | null): string {
  if (!item) return "Show me the first item and tell me what it is. For example: “These are Fuji apples, about 30 lb.”";
  if (item.quantity === null) return `How many ${item.unit === "each" ? "" : item.unit + " of "}${item.name} do you have?`;
  if (item.listPriceCents === null) return `What price should I ask for ${item.name}, ${per(item.unit)}?`;
  if (item.floorPriceCents === null) return `What’s the lowest you’d accept ${per(item.unit)}? I will never go below it.`;
  if (item.facts.length === 0 && !item.condition) return `What should buyers know about ${item.name}? Taste, size, condition, any flaws?`;
  if (item.sellBy === null) return `Do these need to sell today, this week, or is there no rush?`;
  return `Got it: ${item.name}, ${item.quantity} ${item.unit}, ${fmt(item.listPriceCents)} ${per(item.unit)}, never below ${fmt(item.floorPriceCents)}. Show me the next item, or tap “Open my shop” when you’re done.`;
}
