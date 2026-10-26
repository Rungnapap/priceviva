import type { CountryCode, CurrencyCode } from "./types";

/**
 * Standard VAT rates used by the demo calculator.
 * Phase 2+ will move these into a versioned, country-specific calculation module
 * backed by an authorised tax/duty provider. Reduced rates (food, books) are not modeled.
 */
export const STANDARD_VAT: Record<CountryCode, number> = {
  SE: 0.25,
  DE: 0.19,
  GB: 0.2,
};

export const COUNTRY_CURRENCY: Record<CountryCode, CurrencyCode> = {
  SE: "SEK",
  DE: "EUR",
  GB: "GBP",
};

export const COUNTRY_NAME: Record<CountryCode, string> = {
  SE: "Sweden",
  DE: "Germany",
  GB: "United Kingdom",
};

/** EU customs union membership (no import duty / import VAT between members). */
export const EU_MEMBER: Record<CountryCode, boolean> = {
  SE: true,
  DE: true,
  GB: false,
};

export function sameCustomsUnion(a: CountryCode, b: CountryCode): boolean {
  return a === b || (EU_MEMBER[a] && EU_MEMBER[b]);
}

/** Remove the seller's domestic VAT from a VAT-inclusive price (minor units). */
export function removeVat(grossMinor: number, rate: number): number {
  return Math.round(grossMinor / (1 + rate));
}
