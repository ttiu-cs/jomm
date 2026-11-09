/**
 * The second sample: Mina sells five things from her closet. When CHANNEL3_API_KEY is set, her agent
 * looks each one up on Channel3 (new prices online) and suggests a resale price. Client-safe.
 * "?market:" lines are only said when the agent has to ask for the price elsewhere (no Channel3 key).
 */
export const MINA = {
  shopName: "Mina's Closet",
  owner: "Mina",
  hello: "Hi Mina! Show me what you'd like to sell.",
  scenes: [
    {
      clip: "/videos/mina-jacket.mp4",
      photo: "/photos/denim-jacket.jpg",
      lines: [
        "This is a Levi's trucker jacket, size S, small stain on the left cuff.",
        "One left. $19, lowest $14. I'd like it gone this week.",
        "?market:New ones are about $85 online.",
        "If it doesn't sell, I'll donate it.",
        "Denim sells okay.",
      ],
    },
    {
      clip: "/videos/mina-coat.mp4",
      photo: "/photos/coat-on-hook.jpg",
      lines: [
        "Next is a Madewell wool coat, worn twice, size M.",
        "Just one. Let's ask $115, but no less than $85.",
        "No rush.",
        "?market:New ones go for about $350 online.",
        "Coats go fast once it gets cold.",
      ],
    },
    {
      clip: "/videos/mina-sneakers.mp4",
      photo: "/photos/closet-bedroom.jpg",
      lines: [
        "Next are Nike Air Force 1 sneakers, size 8, worn a few times, with the box.",
        "One pair. $48, lowest $35.",
        "This week, please.",
        "?market:New ones are about $130 online.",
        "If they don't sell, I'll donate them.",
        "Sneakers sell fast.",
      ],
    },
    {
      clip: "/videos/mina-tote.mp4",
      photo: "/photos/closet-bedroom.jpg",
      lines: [
        "And this is a Coach leather tote bag, barely used, like new.",
        "Just one. $95, but no less than $75.",
        "No rush.",
        "?market:New ones are about $200 online.",
        "Bags sell steady.",
      ],
    },
    {
      clip: "/videos/mina-sunglasses.mp4",
      photo: "/photos/closet-bedroom.jpg",
      lines: [
        "And these are Ray-Ban Wayfarer sunglasses, with the case, small scratch on one arm.",
        "One pair. $55, lowest $40. Sell them this week.",
        "?market:New ones are about $210 online.",
        "If they don't sell, I'll keep them.",
        "Sunglasses sell slow in winter.",
      ],
    },
  ],
};
