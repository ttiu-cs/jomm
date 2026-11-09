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
  closet: {
    shopName: "Mina's Closet",
    lines: [
      "This is a wool coat, worn twice, size M.",
      "Just one. $64, at least $47.50. No rush.",
      "Next is denim jacket, size S, small stain on the left cuff.",
      "One left. $27.50, lowest $16. I'd like it gone this week.",
    ],
  },
};
