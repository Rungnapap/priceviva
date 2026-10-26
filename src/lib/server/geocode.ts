/**
 * Place / postcode lookup for Local Deal Radar, via OpenStreetMap Nominatim (free, no key).
 *
 * Nominatim usage policy (operations.osmfoundation.org/policies/nominatim): at most 1 request per second,
 * an identifying User-Agent, no autocomplete-as-you-type, cache results. So this module:
 *  - only runs on explicit search (the UI never calls it per keystroke),
 *  - spaces upstream calls ≥ 1.1 s apart for the whole server, and limits each visitor to 20 lookups/minute,
 *  - caches answers for 24 h,
 *  - sends only the typed text (no IP, cookies or location) and rounds returned coordinates to ~100 m.
 * For production traffic, point GEOCODER_URL at a paid/self-hosted Nominatim-compatible service.
 */
export interface GeoResult {
  /** Short label for the UI, e.g. "Kalmar" or "392 32 Kalmar". */
  label: string;
  /** Longer description, e.g. "Kalmar, Kalmar kommun, Kalmar län, Sverige". */
  detail: string;
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2, upper case. */
  country: string;
}

export type GeocodeResponse =
  | { status: "ok"; results: GeoResult[]; cached: boolean }
  | { status: "invalid" | "disabled" | "rate_limited" | "unavailable"; message: string };

interface Deps {
  fetch: typeof fetch;
  now: () => number;
  env: Record<string, string | undefined>;
}

/** Countries searched (comma-separated ISO codes); default: the delivery countries plus Nordic neighbours. */
const countryList = (env: Record<string, string | undefined>) =>
  (env.GEOCODER_COUNTRIES ?? "se,de,gb,no,dk,fi").toLowerCase().split(",").map((c) => c.trim()).filter((c) => /^[a-z]{2}$/.test(c));
const CACHE_TTL_MS = 24 * 3_600_000;
const CACHE_MAX = 500;
const PER_IP_PER_MIN = 20;
const MIN_GAP_MS = 1_100;

const cache = new Map<string, { at: number; results: GeoResult[] }>();
const hits = new Map<string, number[]>();
let lastUpstream = 0;

/** Test hook. */
export function resetGeocoder() {
  cache.clear();
  hits.clear();
  lastUpstream = 0;
}

export function cleanQuery(raw: string | null): string | null {
  if (!raw) return null;
  // Control characters (0–31 and 127) become spaces; done by character code so no regex needs control characters.
  const visible = Array.from(raw, (ch) => {
    const c = ch.charCodeAt(0);
    return c < 32 || c === 127 ? " " : ch;
  }).join("");
  const q = visible.replace(/\s+/g, " ").trim();
  return q.length >= 2 && q.length <= 80 ? q : null;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

type NominatimRow = {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  addresstype?: string;
  address?: Record<string, string | undefined>;
};

/** Human label: the place's own name; for postcodes "392 32 Kalmar". */
export function labelFor(r: NominatimRow): string {
  const a = r.address ?? {};
  const town = a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? a.county;
  if (r.addresstype === "postcode" && a.postcode) return [a.postcode, town].filter(Boolean).join(" ").slice(0, 120);
  return (r.name || town || (r.display_name ?? "").split(",")[0] || "").trim().slice(0, 120);
}

function toResult(r: NominatimRow, allowed: string[]): GeoResult | null {
  const cc = r.address?.country_code?.toLowerCase();
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  const label = labelFor(r);
  if (!r.display_name || !label || !cc || !allowed.includes(cc) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const detail = r.display_name.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 4).join(", ").slice(0, 160);
  return { label, detail, lat: round(lat), lng: round(lng), country: cc.toUpperCase() };
}

async function upstream(
  path: string,
  cacheKey: string,
  clientKey: string,
  d: Deps,
  parse: (json: unknown) => GeoResult[],
): Promise<GeocodeResponse> {
  if (d.env.GEOCODER === "off") return { status: "disabled", message: "Place search is turned off on this site." };
  const now = d.now();
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < CACHE_TTL_MS) return { status: "ok", results: hit.results, cached: true };

  const recent = (hits.get(clientKey) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= PER_IP_PER_MIN) return { status: "rate_limited", message: "Too many place searches. Please wait a minute." };
  if (now - lastUpstream < MIN_GAP_MS) return { status: "rate_limited", message: "Place search is busy. Try again in a second." };
  hits.set(clientKey, [...recent, now]);
  lastUpstream = now;

  const base = (d.env.GEOCODER_URL ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    const res = await d
      .fetch(`${base}${path}`, {
        signal: ctrl.signal,
        headers: { "User-Agent": `PriceViva/0.6 (${d.env.GEOCODER_CONTACT || "contact not configured"})`, "Accept-Language": "en" },
      })
      .finally(() => clearTimeout(timer));
    if (!res.ok) return { status: "unavailable", message: `Place search is unavailable right now (HTTP ${res.status}).` };
    const results = parse(await res.json());
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(cacheKey, { at: now, results });
    return { status: "ok", results, cached: false };
  } catch {
    return { status: "unavailable", message: "Place search could not be reached. Check your connection and try again." };
  }
}

export async function geocode(rawQuery: string | null, clientKey: string, deps: Partial<Deps> = {}): Promise<GeocodeResponse> {
  const d: Deps = { fetch: deps.fetch ?? fetch, now: deps.now ?? Date.now, env: deps.env ?? process.env };
  if (d.env.GEOCODER === "off") return { status: "disabled", message: "Place search is turned off on this site." };
  const q = cleanQuery(rawQuery);
  if (!q) return { status: "invalid", message: "Type 2–80 characters: a city, town or postcode." };
  const allowed = countryList(d.env);
  return upstream(
    `/search?format=jsonv2&limit=6&addressdetails=1&countrycodes=${allowed.join(",")}&q=${encodeURIComponent(q)}`,
    `q:${q.toLowerCase()}`,
    clientKey,
    d,
    (json) => {
      const out: GeoResult[] = [];
      for (const r of Array.isArray(json) ? (json as NominatimRow[]) : []) {
        const g = toResult(r, allowed);
        if (g && !out.some((x) => x.label === g.label && Math.abs(x.lat - g.lat) < 0.02 && Math.abs(x.lng - g.lng) < 0.02)) out.push(g);
      }
      return out;
    },
  );
}

/**
 * Town name for a device position. The position is rounded to 0.01° (~1 km) BEFORE it leaves the server,
 * so the geocoder never receives the precise location.
 */
export async function reverseGeocode(lat: number, lng: number, clientKey: string, deps: Partial<Deps> = {}): Promise<GeocodeResponse> {
  const d: Deps = { fetch: deps.fetch ?? fetch, now: deps.now ?? Date.now, env: deps.env ?? process.env };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { status: "invalid", message: "Invalid position." };
  const rl = Math.round(lat * 100) / 100;
  const rg = Math.round(lng * 100) / 100;
  return upstream(`/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${rl}&lon=${rg}`, `r:${rl},${rg}`, clientKey, d, (json) => {
    const r = json as NominatimRow & { error?: string };
    if (!r || r.error) return [];
    const cc = r.address?.country_code?.toLowerCase();
    const g = toResult(r, cc ? [cc] : []);
    // Keep the user's own (rounded) position as the centre; the geocoder only supplies the name.
    return g ? [{ ...g, lat: rl, lng: rg }] : [];
  });
}
