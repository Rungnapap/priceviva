/**
 * Interface languages. English and Swedish are complete for the shopping interface (navigation, search,
 * product cards, comparison, Local Deal Radar, alerts, favourites, errors). German and Thai have full
 * resource files but are machine-assisted and awaiting native review, so they are offered as "beta".
 * Long information pages (About, Stores, Admin) are English-only and say so.
 */
export const LOCALES = ["en", "sv", "de", "th"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "pv_locale";

export const LOCALE_INFO: Record<Locale, { label: string; intl: string; status: "complete" | "beta" }> = {
  en: { label: "English", intl: "en-GB", status: "complete" },
  sv: { label: "Svenska", intl: "sv-SE", status: "complete" },
  de: { label: "Deutsch", intl: "de-DE", status: "beta" },
  th: { label: "ไทย", intl: "th-TH", status: "beta" },
};

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
