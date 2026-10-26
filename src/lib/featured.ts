import type { CatalogProduct } from "./types";

const FEATURED_COUNT = 8;

const shopCount = (p: CatalogProduct) => new Set(p.offers.filter((o) => !o.informational).map((o) => o.retailer.id)).size;

/**
 * "Worth exploring": products that several shops sell come first (they can actually be compared),
 * then the pick is spread across departments so the grid isn't eight lipsticks. No popularity or
 * sales data is implied — the section never claims to be "trending" or "best-selling".
 */
export function pickFeatured(pool: CatalogProduct[], count = FEATURED_COUNT): CatalogProduct[] {
  // Tier 1: sold by 2+ shops (comparable), tier 2: one shop, tier 3: no shop offer yet.
  // Within a tier, alternate departments; products with a photo come before those without.
  const tier = (p: CatalogProduct) => (shopCount(p) >= 2 ? 0 : shopCount(p) === 1 ? 1 : 2);
  const out: CatalogProduct[] = [];
  for (const t of [0, 1, 2]) {
    const byDept = new Map<string, CatalogProduct[]>();
    const inTier = pool
      .filter((p) => tier(p) === t)
      .sort((a, b) => shopCount(b) - shopCount(a) || Number(b.images.length > 0) - Number(a.images.length > 0));
    for (const p of inTier) {
      const k = p.department ?? "other";
      byDept.set(k, [...(byDept.get(k) ?? []), p]);
    }
    const queues = [...byDept.values()];
    while (out.length < count && queues.some((q) => q.length)) {
      for (const q of queues) {
        const next = q.shift();
        if (next) out.push(next);
        if (out.length === count) break;
      }
    }
    if (out.length === count) break;
  }
  return out;
}
