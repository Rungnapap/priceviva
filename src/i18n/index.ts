import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { en, type MessageKey } from "./messages/en";
import { sv } from "./messages/sv";
import { de } from "./messages/de";
import { th } from "./messages/th";

export type { MessageKey };
export type Vars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: Vars) => string;

const DICTS: Record<Locale, Record<MessageKey, string>> = { en, sv, de, th };

/** Replaces `{name}` placeholders; unknown placeholders are left visible so mistakes are noticed. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Looks a key up in the locale, falling back to English (never to the raw key). */
export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const msg = DICTS[locale]?.[key] ?? en[key] ?? key;
  return interpolate(msg, vars);
}

export function makeT(locale: Locale): TFunction {
  return (key, vars) => translate(locale, key, vars);
}

export function parseLocale(v: string | undefined | null): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Category label in the interface language; unknown slugs keep their stored name. */
export function categoryLabel(t: TFunction, slug: string, fallback: string): string {
  const key = `cat.${slug}` as MessageKey;
  return key in en ? t(key) : fallback;
}

/** Picks the singular key for n === 1 (enough for en/sv/de; Thai has no plural forms and uses the same text). */
export function plural(t: TFunction, n: number, one: MessageKey, many: MessageKey, vars?: Vars): string {
  return t(n === 1 ? one : many, { n, ...vars });
}
