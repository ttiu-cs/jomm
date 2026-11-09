/** Real photos (Pexels, see public/photos/CREDITS.md) used by the demo camera and the samples. */
export type SceneKind = "fruit" | "closet";

export const SCENES: Record<SceneKind, { wide: string; items: { match: RegExp; src: string; alt: string }[] }> = {
  fruit: {
    wide: "/photos/stall-live.jpg",
    items: [
      { match: /apple|사과/i, src: "/photos/apples-box.jpg", alt: "A crate of red apples" },
      { match: /peach|복숭아/i, src: "/photos/peaches-hand.jpg", alt: "Ripe peaches on a cloth" },
      { match: /strawberr|berry|딸기/i, src: "/photos/strawberries-market.jpg", alt: "A basket of strawberries" },
    ],
  },
  closet: {
    wide: "/photos/closet-bedroom.jpg",
    items: [
      { match: /coat|trench|코트/i, src: "/photos/coat-on-hook.jpg", alt: "Coats hanging on hooks" },
      { match: /denim|jean|jacket|자켓|재킷/i, src: "/photos/denim-jacket.jpg", alt: "A denim jacket" },
    ],
  },
};

/** The photo for an item name in a scene, or null if nothing matches. */
export function photoFor(scene: SceneKind, text: string) {
  return SCENES[scene].items.find((i) => i.match.test(text)) ?? null;
}

/** Load a same-origin photo and return a square JPEG data URL (used as the product photo). */
export async function photoToDataUrl(src: string, size = 480): Promise<string | null> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    c.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}
