/** Country and currency names in the interface language, from the browser/Node Intl data (no extra translations). */
function displayName(type: "region" | "currency", code: string, intl: string): string | undefined {
  try {
    return new Intl.DisplayNames([intl], { type }).of(code) ?? undefined;
  } catch {
    return undefined;
  }
}

export const regionName = (code: string, fallback: string, intl: string) => displayName("region", code, intl) ?? fallback;
export const currencyName = (code: string, intl: string) => displayName("currency", code, intl) ?? code;
