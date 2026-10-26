/**
 * Photographic page backgrounds (supplied by the site owner, v0.5). Files live in public/images/site/.
 * Each background has a wide desktop file and a tighter mobile crop around the subject (art direction),
 * with explicit pixel sizes so the browser can reserve space and next/image can build a srcset.
 *
 * To replace one: put the new file(s) in public/images/site/ and change the entry here
 * (docs/REPLACE_IMAGES.md). Keep text out of the image files — all text is real HTML.
 */
export interface ImageFile {
  src: string;
  width: number;
  height: number;
}

export interface Backdrop {
  desktop: ImageFile;
  mobile: ImageFile;
  /** Describes the photo for screen readers. Decorative uses pass alt="" instead. */
  alt: string;
  /** CSS object-position for the desktop file (where the subject is). */
  position?: string;
}

const f = (name: string, width: number, height: number): ImageFile => ({ src: `/images/site/${name}.webp`, width, height });

export const backdrops = {
  /** Homepage hero (owner-supplied, v0.7): shoppers walking through a bright mall; the couple is just right of centre. */
  home: {
    desktop: f("hero-mall-v7", 2103, 748),
    mobile: f("hero-mall-v7-mobile", 1009, 748),
    alt: "Shoppers of different ages walking through a bright shopping mall with shopping bags, including a smiling couple and a parent with a pushchair",
    position: "60% 35%",
  },
  /** Global Compare (owner-supplied, v0.7): city skyline at sunset with the Eiffel Tower and an aeroplane. */
  globalV7: {
    desktop: f("global-city-v7", 1983, 793),
    mobile: f("global-city-v7-mobile", 1030, 793),
    alt: "An international city skyline at sunset with the Eiffel Tower, a river and an aeroplane overhead",
    position: "45% 55%",
  },
  /** Local Deal Radar (owner-supplied, v0.7): a couple with shopping bags walking through a bright mall. */
  localV7: {
    desktop: f("local-mall-v7", 2086, 754),
    mobile: f("local-mall-v7-mobile", 980, 754),
    alt: "A couple carrying shopping bags walking through a bright, glass-roofed shopping mall with shops on both sides",
    position: "60% 40%",
  },
  /** Fashion and Beauty: cream handbag, scarf, sunglasses and perfume on marble. */
  fashionBeauty: {
    desktop: f("bg-fashion-beauty", 1983, 793),
    mobile: f("bg-fashion-beauty-mobile", 983, 793),
    alt: "A cream handbag, silk scarf, sunglasses and a perfume bottle on a marble counter in a mall",
    position: "75% 60%",
  },
  /** Global Compare: international city skyline at sunset with an aeroplane. */
  global: {
    desktop: f("bg-global-city", 1983, 793),
    mobile: f("bg-global-city-mobile", 1000, 793),
    alt: "An international city skyline at sunset with an aeroplane overhead",
    position: "50% 55%",
  },
  /** Local Deal Radar: busy mall corridor with shops on both sides. */
  local: {
    desktop: f("bg-mall-corridor", 1120, 728),
    mobile: f("bg-mall-corridor-mobile", 800, 728),
    alt: "Shoppers walking along a bright shopping-mall corridor lined with stores",
    position: "50% 55%",
  },
  /** Search and category pages without their own photo (v0.7 mall photo). */
  browse: {
    desktop: f("hero-mall-v7", 2103, 748),
    mobile: f("hero-mall-v7-mobile", 1009, 748),
    alt: "Shoppers walking through a bright shopping mall",
    position: "55% 35%",
  },
  /** Saved, alerts, price history, stores, privacy (v0.7 mall photo, right half). */
  calm: {
    desktop: f("local-mall-v7", 2086, 754),
    mobile: f("local-mall-v7-mobile", 980, 754),
    alt: "Shoppers walking through a bright shopping mall",
    position: "60% 30%",
  },
} satisfies Record<string, Backdrop>;

export type BackdropName = keyof typeof backdrops;

/** Category page header photo: the category's own photo; Beauty keeps the earlier handbag/perfume photo. */
export function categoryBackdrop(c: { slug: string; image: string; imageAlt: string; imageSize?: [number, number]; imagePosition?: string }): Backdrop {
  if (c.slug === "beauty") return backdrops.fashionBeauty;
  if (!c.imageSize) return backdrops.browse;
  const file = { src: c.image, width: c.imageSize[0], height: c.imageSize[1] };
  return { desktop: file, mobile: file, alt: c.imageAlt, position: c.imagePosition ?? "50% 50%" };
}
