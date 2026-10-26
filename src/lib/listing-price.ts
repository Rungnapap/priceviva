/** Search price filter helpers: which price a product is filtered and sorted by, and the range itself. */
import { rankingFor } from "./catalog-queries";
import type { FxTable } from "./money";
import { convertMinor } from "./money";
import type { CatalogProduct, CountryCode, CurrencyCode } from "./types";

/**
 * The price SHOWN on the product card (src/components/price-summary.tsx uses this same function), which is what
 * the search price filter and price sorting use — so what people filter by is exactly what they see:
 *   1. the lowest complete delivered total for the delivery country, when one exists;
 *   2. otherwise the lowest shop offer's price with unknown costs not included;
 *   3. otherwise a sample list price (TEST DATA, e.g. DummyJSON products without sample shop offers);
 *   null: no price at all — never guessed; such products are left out of price ranges.
 * Converted to the visitor's currency with the same exchange rates as everywhere else.
 */
export function shownPrice(product: CatalogProduct, destination: CountryCode, currency: CurrencyCode, fx: FxTable): number | null {
  let r: ReturnType<typeof rankingFor>;
  try {
    r = rankingFor(product, destination, currency, fx);
  } catch {
    return null; // missing exchange rate: never guess
  }
  if (r.best && r.best.displayTotalMinor !== null) return r.best.displayTotalMinor;
  const fallback = r.offers.find((o) => o.tier === 1) ?? r.offers.find((o) => o.tier === 2);
  return fallback ? fallback.displayKnownMinor : null;
}

/** A price range typed in one currency, applied in another (e.g. the visitor switched currency after filtering). */
export function rangeInCurrency(
  range: { min: number | null; max: number | null; currency: CurrencyCode | null },
  display: CurrencyCode,
  fx: FxTable,
): { minMinor: number | null; maxMinor: number | null; converted: boolean } {
  const from = range.currency ?? display;
  const conv = (major: number | null) => (major === null ? null : from === display ? Math.round(major * 100) : convertMinor(Math.round(major * 100), from, display, fx));
  return { minMinor: conv(range.min), maxMinor: conv(range.max), converted: from !== display };
}

export function inRange(minor: number, minMinor: number | null, maxMinor: number | null): boolean {
  return (minMinor === null || minor >= minMinor) && (maxMinor === null || minor <= maxMinor);
}

/** Parses a typed price ("1 299,50", "2000") into major units; null = empty; NaN = invalid (negative, letters, too big). */
export function parsePriceInput(text: string): number | null {
  const v = text.trim().replace(/\s/g, "");
  if (v === "") return null;
  if (!/^\d+([.,]\d{1,2})?$/.test(v)) return Number.NaN;
  const n = Number.parseFloat(v.replace(",", "."));
  return n >= 0 && n <= 1e9 ? n : Number.NaN;
}
