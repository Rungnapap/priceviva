/**
 * Signed-in sessions, stored in two httpOnly cookies (page scripts can't read them):
 *   pv_at  short-lived access token (≈1 hour)
 *   pv_rt  refresh token, kept for 30 days so people stay signed in; rotated on every refresh
 * The access token is a Supabase JWT. PriceViva never trusts what is inside it: Supabase verifies it on every
 * request, and row-level security uses the verified user id. It is only decoded here to know when to refresh.
 */
import { AuthError, refreshSession, type AuthSession } from "./gotrue";
import { readCookies, type CookieToSet } from "./http";

export const ACCESS_COOKIE = "pv_at";
export const REFRESH_COOKIE = "pv_rt";
export const PKCE_COOKIE = "pv_pkce";
const REFRESH_MAX_AGE = 30 * 24 * 3600;

export function sessionCookies(s: AuthSession): CookieToSet[] {
  return [
    { name: ACCESS_COOKIE, value: s.accessToken, maxAge: s.expiresIn },
    { name: REFRESH_COOKIE, value: s.refreshToken, maxAge: REFRESH_MAX_AGE },
  ];
}

export const clearSessionCookies = (): CookieToSet[] => [
  { name: ACCESS_COOKIE, value: "", maxAge: 0 },
  { name: REFRESH_COOKIE, value: "", maxAge: 0 },
];

/** Seconds until the token expires (unverified read, only used to decide when to refresh). */
export function secondsLeft(jwt: string, now = Date.now()): number {
  try {
    const part = jwt.split(".")[1] ?? "";
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof json.exp === "number" ? json.exp - Math.floor(now / 1000) : -1;
  } catch {
    return -1;
  }
}

export interface CurrentSession {
  accessToken: string | null;
  /** Cookies to send back (refreshed tokens, or deletions when the session ended). */
  cookies: CookieToSet[];
}

/** Returns a usable access token, refreshing it when it is missing or about to expire. */
export async function currentSession(req: Request): Promise<CurrentSession> {
  const jar = readCookies(req);
  const at = jar.get(ACCESS_COOKIE);
  const rt = jar.get(REFRESH_COOKIE);
  if (at && secondsLeft(at) > 60) return { accessToken: at, cookies: [] };
  if (!rt) return { accessToken: null, cookies: at ? clearSessionCookies() : [] };
  try {
    const s = await refreshSession(rt);
    return { accessToken: s.accessToken, cookies: sessionCookies(s) };
  } catch (e) {
    if (e instanceof AuthError && e.code === "unavailable") return { accessToken: at ?? null, cookies: [] };
    return { accessToken: null, cookies: clearSessionCookies() };
  }
}
