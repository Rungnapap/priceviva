/** Pure session/password helpers (no framework imports, unit-tested). See admin-auth.ts. */
import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { serverEnv } from "./env";

export const ADMIN_COOKIE = "pa_admin";
const SESSION_MS = 8 * 60 * 60 * 1000;

export function verifyPassword(password: string, stored = serverEnv.adminPasswordHash): boolean {
  if (!stored || !password || password.length > 512) return false;
  // Format: scrypt:N:r:p:salt:hash  (":" so .env variable expansion never mangles it)
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  try {
    const expected = Buffer.from(hashB64, "base64url");
    const actual = scryptSync(password, Buffer.from(saltB64, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(now = Date.now(), secret = serverEnv.adminSessionSecret): string {
  if (!secret || secret.length < 32) throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters.");
  const exp = String(now + SESSION_MS);
  return `${exp}.${sign(`admin|${exp}`, secret)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now(), secret = serverEnv.adminSessionSecret): boolean {
  if (!token || !secret || secret.length < 32) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || !/^\d{13}$/.test(exp) || Number(exp) < now) return false;
  const expected = Buffer.from(sign(`admin|${exp}`, secret));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_MS / 1000,
};

/** CSRF guard for admin POSTs: the Origin (or Referer) must match this site. */
export function sameOrigin(req: Request): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!host || !origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Simple in-memory login throttle (per server instance). Use a shared store if you run many instances.
const attempts = new Map<string, { n: number; until: number }>();
export function loginThrottled(key: string, now = Date.now()): boolean {
  const a = attempts.get(key);
  if (!a || a.until < now) return false;
  return a.n >= 5;
}
export function recordLoginFailure(key: string, now = Date.now()) {
  const a = attempts.get(key);
  if (!a || a.until < now) attempts.set(key, { n: 1, until: now + 10 * 60_000 });
  else a.n++;
}
