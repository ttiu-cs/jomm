import { MINA } from "../demo/mina";

/** Scripted owner walk-throughs, used by the demo camera and as a stage fallback. Client-safe. */
export const EXAMPLE_SCRIPTS: Record<"fruit" | "closet", { shopName: string; lines: string[] }> = {
  fruit: {
    shopName: "Sunny Fruit Stand",
    lines: [
      "These are Fuji apples, about 30 lb. They're really sweet and crisp this year.",
      "$2.89 a pound, but no less than $2.35.",
      "No rush, they keep well.",
      "Next is white peaches, 12 lb. A little soft, they have to go today.",
      "$3.79 per pound, lowest $2.15.",
      "And this is strawberries, 8 box. Picked this morning, very fragrant.",
      "$5.49 a box, at least $4.25. Sell them by this week.",
    ],
  },
  closet: { shopName: MINA.shopName, lines: MINA.scenes.flatMap((sc) => sc.lines) },
};

const ASKS_MARKET = /elsewhere|supermarket|pay for/i;
/** The text to say for a script line, or null if it's a conditional line the agent didn't ask for. */
export function scriptLine(line: string, lastAgentReply: string | null): string | null {
  if (!line.startsWith("?market:")) return line;
  return lastAgentReply && ASKS_MARKET.test(lastAgentReply) ? line.slice("?market:".length) : null;
}
