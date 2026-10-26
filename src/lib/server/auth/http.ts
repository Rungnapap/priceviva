/**
 * Request/response helpers for the account routes. Kept in one small module so the sandbox preview can swap in
 * a cookie jar (browsers don't let scripts set real cookies on synthetic responses). Nothing here logs secrets.
 */

export interface CookieToSet {
  name: string;
  value: string;
  /** Seconds; 0 deletes the cookie. Omitted = session cookie. */
  maxAge?: number;
}

/** The raw Cookie header of a request. */
export function cookieHeader(req: Request): string {
  return req.headers.get("cookie") ?? "";
}

export function readCookies(req: Request): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of cookieHeader(req).split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out.set(k, decodeURIComponent(v));
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
}

/**
 * State-changing requests must come from PriceViva's own pages (protects against cross-site request forgery,
 * on top of SameSite=Lax cookies). Browsers always send Origin on POST/PUT/PATCH/DELETE from fetch and forms.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

function serialize(c: CookieToSet, secure: boolean): string {
  const parts = [`${c.name}=${encodeURIComponent(c.value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  if (c.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(c.maxAge))}`);
  return parts.join("; ");
}

/** Cookies are marked Secure whenever the site is served over https (always in production). */
export function isSecure(req: Request): boolean {
  return new URL(req.url).protocol === "https:" || process.env.NODE_ENV === "production";
}

export function respond(req: Request, body: unknown, init: { status?: number; cookies?: CookieToSet[] } = {}): Response {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const c of init.cookies ?? []) headers.append("set-cookie", serialize(c, isSecure(req)));
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function redirect(req: Request, to: string, cookies: CookieToSet[] = []): Response {
  const headers = new Headers({ location: new URL(to, req.url).toString(), "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", serialize(c, isSecure(req)));
  return new Response(null, { status: 303, headers });
}
