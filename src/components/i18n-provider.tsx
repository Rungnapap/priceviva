"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_INFO, type Locale } from "@/i18n/config";
import { makeT, type TFunction } from "@/i18n";
import { regionName } from "@/i18n/display-names";
import { COUNTRY_NAME } from "@/lib/tax";
import type { CountryCode, CurrencyCode } from "@/lib/types";
import { formatMoney } from "@/lib/money";

const I18nContext = createContext<{ locale: Locale; t: TFunction }>({ locale: DEFAULT_LOCALE, t: makeT(DEFAULT_LOCALE) });

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  // One translate function per language, so components can list `t` as a hook dependency without re-running every render.
  const value = useMemo(() => ({ locale, t: makeT(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useT = (): TFunction => useContext(I18nContext).t;
export const useLocale = (): Locale => useContext(I18nContext).locale;
export const useIntlLocale = (): string => LOCALE_INFO[useContext(I18nContext).locale].intl;

/** Saves the choice for a year and reloads so server-rendered pages use it too. */
export function chooseLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  location.reload();
}

/** Country name in the interface language (falls back to the English name). */
export function useCountryName(): (code: CountryCode) => string {
  const intl = useIntlLocale();
  return useMemo(() => (code: CountryCode) => regionName(code, COUNTRY_NAME[code], intl), [intl]);
}

/** formatMoney in the interface language's number style (e.g. "1 299,00 SEK" in Swedish). */
export function useFormatMoney(): (minor: number, currency: CurrencyCode, opts?: { compact?: boolean }) => string {
  const locale = useIntlLocale();
  return useMemo(() => (minor: number, currency: CurrencyCode, opts?: { compact?: boolean }) => formatMoney(minor, currency, { ...opts, locale }), [locale]);
}
