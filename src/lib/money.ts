import type { CurrencyCode, Money } from "./types";

export interface FxTable {
  base: CurrencyCode;
  rates: Record<CurrencyCode, number>;
  asOf: string;
  label: string;
}

/**
 * Convert minor units between currencies via the table's base currency.
 * Rounds once, at the end, to the nearest minor unit (half away from zero).
 */
/**
 * Build a complete display FX table from ECB-style quotes (EUR base). Returns null if any display currency is
 * missing, so callers fall back to the clearly labelled demo table instead of showing a wrong conversion.
 */
export function fxFromQuotes(quotes: Record<string, number>, asOf: string, label: string, currencies: CurrencyCode[]): FxTable | null {
  const rates = { EUR: 1 } as Record<CurrencyCode, number>;
  for (const c of currencies) {
    if (c === "EUR") continue;
    const r = Number(quotes[c]);
    if (!Number.isFinite(r) || r <= 0) return null;
    rates[c] = r;
  }
  return { base: "EUR", rates, asOf, label };
}

export function convertMinor(minor: number, from: CurrencyCode, to: CurrencyCode, fx: FxTable): number {
  if (from === to) return minor;
  const fromRate = fx.rates[from];
  const toRate = fx.rates[to];
  if (!fromRate || !toRate) throw new Error(`Missing FX rate for ${from} or ${to}`);
  const value = (minor / fromRate) * toRate;
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function convertMoney(m: Money, to: CurrencyCode, fx: FxTable): Money {
  return { minor: convertMinor(m.minor, m.currency, to, fx), currency: to };
}

const formatters = new Map<string, Intl.NumberFormat>();

/** `locale` = the interface language (BCP 47, e.g. "sv-SE"); defaults to en-GB. The ISO code is always shown. */
export function formatMoney(minor: number, currency: CurrencyCode, opts: { compact?: boolean; locale?: string } = {}): string {
  const loc = opts.locale ?? "en-GB";
  const key = `${loc}-${currency}-${opts.compact ? "c" : "f"}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(loc, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      // Use each currency's own decimals (JPY has none); compact always drops them.
      ...(opts.compact ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    });
    formatters.set(key, f);
  }
  // Intl uses a non-breaking space between code and number; keep it.
  return f.format(minor / 100);
}

/** Percent discount vs a reference price — only when same currency and genuinely lower. */
export function discountPercent(price: Money, reference: Money | undefined | null): number | null {
  if (!reference || reference.currency !== price.currency) return null;
  if (reference.minor <= price.minor || reference.minor <= 0) return null;
  return Math.round(((reference.minor - price.minor) / reference.minor) * 100);
}
