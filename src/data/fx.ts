import type { CurrencyCode } from "@/lib/types";

/**
 * DEMO exchange-rate snapshot (EUR base). These are fixed illustrative values,
 * NOT live rates. Phase 2 replaces this with a timestamped reference-rate import
 * (e.g. the ECB euro foreign exchange reference rates), stored with its date.
 */
export const fxSnapshot = {
  base: "EUR" as const,
  label: "Demo reference rates (fixed, not live)",
  asOf: "2026-10-01",
  // Illustrative values only; shown with the "Demo reference rates" label whenever used.
  rates: {
    EUR: 1,
    SEK: 11.2,
    GBP: 0.86,
    USD: 1.08,
    NOK: 11.6,
    DKK: 7.46,
    CHF: 0.94,
    CAD: 1.48,
    AUD: 1.65,
    JPY: 162,
  } satisfies Record<CurrencyCode, number>,
};
