// Sandbox shim for src/lib/server/auth/http.ts. In the browser preview the route handlers run in the page, where
// scripts can't set real (httpOnly) cookies on synthetic responses, so a small jar in localStorage stands in for
// the browser's cookie store. The real app uses httpOnly, SameSite=Lax cookies (see the real module).
export interface CookieToSet { name: string; value: string; maxAge?: number }
const KEY = "__pv_preview_cookies";
const jar = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
function store(cookies: CookieToSet[]) {
  const j = jar();
  for (const c of cookies) { if (c.maxAge === 0 || c.value === "") delete j[c.name]; else j[c.name] = c.value; }
  localStorage.setItem(KEY, JSON.stringify(j));
}
export function cookieHeader(_req: Request): string { return Object.entries(jar()).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; "); }
export function readCookies(_req: Request): Map<string, string> { return new Map(Object.entries(jar())); }
// Browsers don't let scripts set Origin; the preview's fetch router marks same-origin calls instead.
export function sameOrigin(req: Request): boolean { return req.headers.get("x-pv-origin") === location.origin; }
export function isSecure(_req: Request): boolean { return false; }
export function respond(_req: Request, body: unknown, init: { status?: number; cookies?: CookieToSet[] } = {}): Response {
  store(init.cookies ?? []);
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } });
}
export function redirect(req: Request, to: string, cookies: CookieToSet[] = []): Response {
  store(cookies);
  return new Response(null, { status: 200, headers: { "x-pv-location": new URL(to, req.url).toString() } });
}
