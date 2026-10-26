import { cookies } from "next/headers";
import { LOCALE_COOKIE, type Locale } from "./config";
import { makeT, parseLocale, type TFunction } from "./index";

/** Interface language for server components: the `pv_locale` cookie set by the language selector. */
export async function getLocale(): Promise<Locale> {
  try {
    const jar = await cookies();
    return parseLocale(jar.get(LOCALE_COOKIE)?.value);
  } catch {
    return parseLocale(undefined);
  }
}

export async function getT(): Promise<TFunction> {
  return makeT(await getLocale());
}
