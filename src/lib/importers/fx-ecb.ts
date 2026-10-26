/**
 * Euro foreign exchange reference rates from the European Central Bank (published on working days).
 * https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/
 * Used only to convert for display; the original price and currency are always stored and shown.
 */
export const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

export function parseEcbXml(xml: string): { asOf: string; rates: { quote: string; rate: number }[] } {
  const date = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/);
  if (!date) throw new Error("ECB file has no date");
  const rates: { quote: string; rate: number }[] = [];
  for (const m of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const rate = Number(m[2]);
    if (Number.isFinite(rate) && rate > 0) rates.push({ quote: m[1]!, rate });
  }
  if (rates.length === 0) throw new Error("ECB file has no rates");
  return { asOf: date[1]!, rates };
}

export async function fetchEcbRates() {
  const res = await fetch(ECB_DAILY_URL, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ECB rates request failed with HTTP ${res.status}`);
  return parseEcbXml(await res.text());
}
