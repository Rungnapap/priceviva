/**
 * Same-origin image relay used ONLY to build the on-device photo-search index (browsers may not read pixels of
 * cross-origin images). Strict rules against abuse (SSRF / bandwidth):
 *  - https only, host must be on the allow-list (DummyJSON's CDN + IMAGE_PROXY_HOSTS, e.g. your feed image hosts);
 *  - image content types only, max 3 MB, 8 s timeout, no cookies/headers forwarded;
 *  - per-visitor limit of 600 images per 10 minutes (the whole test catalogue is ~200).
 */
const DEFAULT_HOSTS = ["cdn.dummyjson.com"];
const WINDOW_MS = 10 * 60_000;
const PER_CLIENT = 600;
const hits = new Map<string, number[]>();

export function allowedHosts(env: Record<string, string | undefined> = process.env): string[] {
  return [...DEFAULT_HOSTS, ...(env.IMAGE_PROXY_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)];
}

export function checkProxyUrl(raw: string | null, env?: Record<string, string | undefined>): URL | null {
  if (!raw || raw.length > 1000) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
    return allowedHosts(env).includes(u.hostname.toLowerCase()) ? u : null;
  } catch {
    return null;
  }
}

export function proxyRateOk(client: string, now = Date.now()): boolean {
  const recent = (hits.get(client) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_CLIENT) return false;
  recent.push(now);
  hits.set(client, recent);
  return true;
}
