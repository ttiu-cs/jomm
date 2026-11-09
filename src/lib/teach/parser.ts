/**
 * Deterministic interpreter for what a shop owner says while showing items to the camera.
 * Used when no LLM key is configured, and as a safety net when the LLM response is invalid.
 * English first, with a few common Korean phrases.
 */

export type SellBy = "today" | "this_week" | "no_rush";

/**
 * What the seller agent needs to haggle well, beyond price and floor. All learned from the owner in
 * conversation. `undefined` = not asked yet; `null` = the owner didn't know / skipped.
 */
export interface SellingRules {
  /** Stall closing hour (0-23), for items that must go today. */
  closeHour?: number | null;
  /** What shoppers pay elsewhere, per unit, and where ("the supermarket"). */
  marketCents?: number | null;
  marketNote?: string | null;
  /** How fast it usually sells. */
  demand?: "high" | "normal" | "slow" | null;
  /** Volume deal; false = the owner said no bulk deals. */
  bulk?: { minQty: number; pctOff: number } | false | null;
  /** What happens to unsold stock. */
  leftover?: "waste" | "use" | "keep" | null;
}

export interface DraftFields {
  name: string;
  unit: string;
  quantity: number | null;
  listPriceCents: number | null;
  floorPriceCents: number | null;
  condition: string | null;
  sellBy: SellBy | null;
  facts: string[];
  rules?: SellingRules;
}

export interface Interpretation {
  newItemName: string | null;
  set: Partial<Omit<DraftFields, "name" | "facts">>;
  addFacts: string[];
  /** The owner said they don't know / skip: mark the rule being asked about as skipped. */
  skip?: boolean;
}

const COMPETITOR = /\b(supermarket|grocery(?: store)?|store|farm ?stand|stall|market|shop|walmart|costco|whole foods|trader joe'?s|safeway|down the (?:road|street)|next door|online|amazon)\b/i;

function to24(h: number, ampm?: string) {
  if (ampm) return ampm.toLowerCase() === "pm" && h < 12 ? h + 12 : ampm.toLowerCase() === "am" && h === 12 ? 0 : h;
  return h < 8 ? h + 12 : h; // "close at 6" means 6 pm at a market stall
}

/** Selling-rule answers: closing time, prices elsewhere, demand, bulk deals, leftovers. */
export function extractRules(t: string): { rules: SellingRules; marketAmount: number | null } {
  const rules: SellingRules = {};
  let marketAmount: number | null = null;
  const close = t.match(/\b(?:we |i )?(?:close|closing|pack up|shut)(?:s)?(?: up)?(?: is)? (?:at|by|around) (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (close) rules.closeHour = Math.min(23, to24(parseInt(close[1], 10), close[3]));
  const comp = t.match(COMPETITOR);
  const money = t.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (comp && money && !/\b(lowest|at least|no less|floor|minimum)\b/i.test(t)) {
    marketAmount = Math.round(parseFloat(money[1]) * 100);
    rules.marketCents = marketAmount;
    const note = t.match(/\b(?:the |a )?(supermarket|grocery store|farm ?stand(?: down the (?:road|street))?|store(?: down the (?:road|street))?|market|stall next door|walmart|costco|whole foods|trader joe'?s|safeway)\b/i);
    rules.marketNote = note ? `the ${note[1].toLowerCase()}` : "other shops";
  }
  if (/\b(sell(?:s)? out|go(?:es)? fast|fly off|always gone|gone by (?:noon|lunch|10|11))\b/i.test(t)) rules.demand = "high";
  else if (/\b(slow|not moving|isn'?t moving|hard to sell|not selling|nobody(?:'s)? buying)\b/i.test(t)) rules.demand = "slow";
  else if (/\b(steady|normal|about \d+\s*\w*\s*(?:a|per) day|sells? (?:ok|okay|fine))\b/i.test(t)) rules.demand = "normal";
  const pct = t.match(/(\d{1,2})\s*%\s*off/i);
  const minQ = t.match(/(\d+)\s*(?:lbs?|pounds?|boxes|box|kg|bags?)?\s*(?:or more|\+|and up|or over)/i);
  if (pct && minQ) rules.bulk = { minQty: parseInt(minQ[1], 10), pctOff: Math.min(50, parseInt(pct[1], 10)) };
  else if (/\bno (?:bulk|volume|quantity) (?:deals?|discounts?)\b|\bno deals?\b/i.test(t)) rules.bulk = false;
  if (/\b(left ?overs?|anything left|whatever'?s left|what'?s left|unsold|if (?:they|it) (?:don'?t|doesn'?t) sell)\b/i.test(t)) {
    if (/\b(compost|throw (?:them |it )?(?:away|out)|toss|bin|waste|trash|garbage)\b/i.test(t)) rules.leftover = "waste";
    else if (/\b(jam|juice|bake|pie|preserve|freeze|smoothie|turn (?:them|it) into|make)\b/i.test(t)) rules.leftover = "use";
    else if (/\b(keep|last|store|tomorrow)\b/i.test(t)) rules.leftover = "keep";
  }
  return { rules, marketAmount };
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
  const ex = extractRules(t);
  // A selling-rule answer ("The supermarket has them at $3.49", "5 lb or more, 10% off") must not be
  // read as this item's price, quantity, deadline or a buyer-facing fact.
  const rulesAnswer = Object.keys(ex.rules).length > 0 && !out.newItemName;
  if (Object.keys(ex.rules).length) out.set.rules = ex.rules;
  if (rulesAnswer) return out;
  if (/\b(don'?t know|not sure|no idea|skip|pass|doesn'?t matter)\b|모르/i.test(t) && !/\$|\d/.test(t)) {
    out.skip = true;
    return out;
  }

  let floor: number | null = null;
  const fm = t.match(FLOOR);
  if (fm) {
    floor = round2(parseFloat(fm[1]));
    out.set.floorPriceCents = floor;
  }
  const amounts: { cents: number; index: number }[] = [];
  for (const m of t.matchAll(MONEY)) amounts.push({ cents: round2(parseFloat(m[1] ?? m[2])), index: m.index ?? 0 });
  if (ex.marketAmount !== null) {
    const i = amounts.findIndex((a) => a.cents === ex.marketAmount);
    if (i >= 0) amounts.splice(i, 1);
  }
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
  const next = nextRule(item);
  if (next) return RULE_QUESTION[next](item);
  const c = checklist(item);
  return `Got it: ${item.name}, ${item.quantity} ${item.unit}, ${fmt(item.listPriceCents)} ${per(item.unit)}, never below ${fmt(item.floorPriceCents)}. ${c.filter((x) => x.done).length} of ${c.length} things I need to haggle well. Show me the next item, or tap “Open my shop” when you’re done.`;
}

export type RuleKey = "closeHour" | "marketCents" | "bulk" | "leftover" | "demand";
const RULE_QUESTION: Record<RuleKey, (i: DraftFields) => string> = {
  closeHour: () => "What time do you close today? I’ll pace my discounts so they’re gone by then.",
  marketCents: (i) => `What do shoppers pay for ${i.name.toLowerCase()} elsewhere, like at the supermarket? It helps me know how firm to be.`,
  bulk: (i) => `Any deal for bigger orders? For example, 10% off for 5 ${i.unit === "each" ? "or more" : (i.unit === "box" ? "boxes" : i.unit) + " or more"}.`,
  leftover: () => "If some are left at closing, what happens to them?",
  demand: () => "How fast do these usually sell?",
};

/** The next selling rule worth asking about, in conversation order (undefined = not asked yet). */
export function nextRule(item: DraftFields): RuleKey | null {
  const r = item.rules ?? {};
  if (item.sellBy === "today" && r.closeHour === undefined) return "closeHour";
  if (r.marketCents === undefined) return "marketCents";
  if (r.bulk === undefined) return "bulk";
  if (item.sellBy !== "no_rush" && r.leftover === undefined) return "leftover";
  if (r.demand === undefined) return "demand";
  return null;
}

/** What the agent knows vs. still needs, shown to the owner as a checklist. */
export function checklist(item: DraftFields): { key: string; label: string; done: boolean; skipped?: boolean }[] {
  const r = item.rules ?? {};
  const rule = (key: RuleKey, label: string) => ({ key, label, done: r[key] !== undefined && r[key] !== null, skipped: r[key] === null });
  return [
    { key: "quantity", label: "How many", done: item.quantity !== null },
    { key: "price", label: "Price", done: item.listPriceCents !== null },
    { key: "floor", label: "Lowest price", done: item.floorPriceCents !== null },
    { key: "facts", label: "What buyers should know", done: item.facts.length > 0 || !!item.condition },
    { key: "sellBy", label: "Sell by", done: item.sellBy !== null },
    ...(item.sellBy === "today" ? [rule("closeHour", "Closing time")] : []),
    rule("marketCents", "Price elsewhere"),
    { key: "bulk", label: "Bulk deal", done: r.bulk !== undefined && r.bulk !== null, skipped: r.bulk === null },
    ...(item.sellBy !== "no_rush" ? [rule("leftover", "If unsold")] : []),
    rule("demand", "How fast it sells"),
  ];
}
