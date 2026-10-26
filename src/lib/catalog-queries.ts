/**
 * Pure helpers over catalogue views. Safe in both server and client components
 * (they never import demo data or server secrets).
 */
import { rankOffers, type Ranking } from "./pricing";
import { discountPercent, type FxTable } from "./money";
import type { CatalogOffer, CatalogProduct, CountryCode, CurrencyCode } from "./types";

export function rankingFor(product: CatalogProduct, destination: CountryCode, currency: CurrencyCode, fx: FxTable): Ranking<CatalogOffer> {
  return rankOffers(product.offers, destination, currency, fx);
}

/** Best evidence-backed discount among a product's current offers (needs a reference price with evidence). */
export function bestVerifiedDiscount(product: CatalogProduct): number | null {
  let best: number | null = null;
  for (const o of product.offers) {
    if (o.stock === "out_of_stock") continue;
    const d = discountPercent(o.price, o.reference?.price);
    if (d !== null && (best === null || d > best)) best = d;
  }
  return best;
}

/** Comparison is only allowed within one department/subcategory. */
export function compareGroup(p: Pick<CatalogProduct, "department" | "subcategory">): string {
  return `${p.department || "uncategorised"}/${p.subcategory || "-"}`;
}
