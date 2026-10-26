/**
 * Awin feed discovery: the publisher "feed list" CSV
 *   https://productdata.awin.com/datafeed/list/apikey/<DATA_FEED_API_KEY>
 * Columns (per Awin docs): Advertiser ID, Advertiser Name, Primary Region, Membership Status, Feed ID,
 * Feed Name, Language, Vertical, Last Imported, [Last Checked], [No of products], URL.
 * Discovery only REGISTERS feeds (disabled). An admin must enable one explicitly.
 */
import { csvObjects } from "../csv";
import { parseDate } from "../normalize";
import { COUNTRY_CURRENCY } from "@/lib/tax";
import type { CountryCode } from "@/lib/types";

export const AWIN_FEED_LIST_URL = "https://productdata.awin.com/datafeed/list/apikey/{API_KEY}";
const AWIN_PRODUCTDATA_HOST = "productdata.awin.com";

export interface DiscoveredFeed {
  external_feed_id: string;
  advertiser_id: string;
  advertiser_name: string;
  name: string;
  country: string | null;
  language: string | null;
  currency: string | null;
  membership_status: string;
  provider_last_imported_at: string | null;
  download_url_template: string | null;
}

/** Replace the API key in an Awin URL with a placeholder so it can be stored safely. */
export function toUrlTemplate(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" || u.hostname !== AWIN_PRODUCTDATA_HOST) return null;
    const path = u.pathname.replace(/\/apikey\/[^/]+/i, "/apikey/{API_KEY}");
    if (!path.includes("/apikey/{API_KEY}")) return null;
    return `https://${AWIN_PRODUCTDATA_HOST}${path}${u.search}`;
  } catch {
    return null;
  }
}

/** Fill the key back in at download time (server only). Refuses anything that isn't productdata.awin.com. */
export function fromUrlTemplate(template: string, apiKey: string): string {
  const url = template.replace("{API_KEY}", encodeURIComponent(apiKey));
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== AWIN_PRODUCTDATA_HOST) throw new Error("Feed URL must be https://productdata.awin.com/…");
  return url;
}

function regionToCountry(region: string): string | null {
  const r = region.trim().toUpperCase();
  if (r === "UK") return "GB";
  return /^[A-Z]{2}$/.test(r) ? r : null;
}

export async function* parseFeedList(chunks: AsyncIterable<string> | Iterable<string>): AsyncGenerator<DiscoveredFeed> {
  for await (const { values } of csvObjects(chunks)) {
    const fid = values["Feed ID"]?.trim();
    if (!fid) continue;
    const country = regionToCountry(values["Primary Region"] ?? "");
    yield {
      external_feed_id: fid,
      advertiser_id: (values["Advertiser ID"] ?? "").trim(),
      advertiser_name: (values["Advertiser Name"] ?? "").trim(),
      name: (values["Feed Name"] ?? "").trim(),
      country,
      language: (values["Language"] ?? "").trim() || null,
      currency: country && country in COUNTRY_CURRENCY ? COUNTRY_CURRENCY[country as CountryCode] : null,
      membership_status: (values["Membership Status"] ?? "").trim(),
      provider_last_imported_at: parseDate(values["Last Imported"]),
      download_url_template: toUrlTemplate(values["URL"]),
    };
  }
}

export async function fetchFeedList(apiKey: string): Promise<DiscoveredFeed[]> {
  const res = await fetch(AWIN_FEED_LIST_URL.replace("{API_KEY}", encodeURIComponent(apiKey)), {
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Awin feed list request failed with HTTP ${res.status}. Check AWIN_DATAFEED_API_KEY.`);
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error("Awin returned HTML instead of the feed list CSV (invalid key or access denied).");
  const out: DiscoveredFeed[] = [];
  for await (const f of parseFeedList([text])) out.push(f);
  return out;
}
