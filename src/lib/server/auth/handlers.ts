/**
 * Account and sign-in request handlers (used by the files in src/app/api/auth, src/app/api/account and
 * src/app/auth/callback). Plain functions of Request → Response, so they are tested directly.
 *
 * Rules:
 *  - every state-changing request must come from PriceViva's own pages (Origin check) and carry JSON;
 *  - inputs are validated with the same rules as the forms (src/lib/auth-rules.ts);
 *  - error answers are message codes that never reveal whether an e-mail address has an account;
 *  - private data is read and written with the visitor's own token, so Supabase row-level security applies.
 */
import { z } from "zod";
import { alertSchema } from "@/lib/alerts";
import { forgotSchema, loginSchema, resetSchema, safeNext, signupSchema } from "@/lib/auth-rules";
import { rpc, RpcError } from "../supabase-rpc";
import {
  AuthError,
  authConfigured,
  createPkce,
  exchangeCode,
  getUser,
  resendConfirmation,
  sendPasswordReset,
  signInWithPassword,
  signOut,
  signUp,
  updatePassword,
  type AuthUser,
} from "./gotrue";
import { readCookies, redirect, respond, sameOrigin, type CookieToSet } from "./http";
import { clearSessionCookies, currentSession, PKCE_COOKIE, sessionCookies } from "./session";

const MAX_BODY = 16_384;
const PKCE_MAX_AGE = 3600;

const fail = (req: Request, error: string, status: number, cookies: CookieToSet[] = []) => respond(req, { ok: false, error }, { status, cookies });

async function jsonBody(req: Request): Promise<unknown> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return null;
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Common checks for POST routes. Returns an error response, or null when the request may proceed. */
function guard(req: Request): Response | null {
  if (!authConfigured()) return fail(req, "not_configured", 503);
  if (!sameOrigin(req)) return fail(req, "forbidden", 403);
  return null;
}

function authFailure(req: Request, e: unknown, cookies: CookieToSet[] = []): Response {
  if (e instanceof AuthError) return fail(req, e.code, e.status, e.code === "session_expired" ? clearSessionCookies() : cookies);
  return fail(req, "unavailable", 503, cookies);
}

const callbackUrl = (req: Request, next: string) => `${new URL(req.url).origin}/auth/callback?next=${encodeURIComponent(next)}`;
const publicUser = (u: AuthUser) => ({ id: u.id, email: u.email, emailConfirmed: u.emailConfirmed });

// --- session ------------------------------------------------------------------------------------------------
export async function sessionGET(req: Request): Promise<Response> {
  if (!authConfigured()) return respond(req, { configured: false, user: null });
  const cur = await currentSession(req);
  if (!cur.accessToken) return respond(req, { configured: true, user: null }, { cookies: cur.cookies });
  try {
    const user = await getUser(cur.accessToken);
    return respond(req, { configured: true, user: publicUser(user) }, { cookies: cur.cookies });
  } catch (e) {
    if (e instanceof AuthError && e.code === "unavailable") return respond(req, { configured: true, user: null, error: "unavailable" }, { status: 503 });
    return respond(req, { configured: true, user: null }, { cookies: clearSessionCookies() });
  }
}

// --- log in / sign up / log out -----------------------------------------------------------------------------
export async function loginPOST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const parsed = loginSchema.safeParse(await jsonBody(req));
  if (!parsed.success) return fail(req, "invalid_request", 400);
  try {
    const s = await signInWithPassword(parsed.data.email, parsed.data.password);
    return respond(req, { ok: true, next: safeNext(parsed.data.next), user: publicUser(s.user) }, { cookies: sessionCookies(s) });
  } catch (e) {
    return authFailure(req, e);
  }
}

export async function signupPOST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const parsed = signupSchema.safeParse(await jsonBody(req));
  if (!parsed.success) return fail(req, "invalid_request", 400);
  try {
    const pkce = await createPkce();
    const s = await signUp(parsed.data.email, parsed.data.password, callbackUrl(req, "/account?welcome=1"), pkce);
    if (s) return respond(req, { ok: true, signedIn: true, user: publicUser(s.user) }, { cookies: sessionCookies(s) });
    // E-mail confirmation: the link in the e-mail finishes sign-up in this browser (PKCE verifier cookie).
    return respond(req, { ok: true, signedIn: false }, { cookies: [{ name: PKCE_COOKIE, value: pkce.verifier, maxAge: PKCE_MAX_AGE }] });
  } catch (e) {
    return authFailure(req, e);
  }
}

export async function logoutPOST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return fail(req, "forbidden", 403);
  const cur = authConfigured() ? await currentSession(req) : { accessToken: null, cookies: [] };
  if (cur.accessToken) {
    try {
      await signOut(cur.accessToken);
    } catch {
      /* the cookies are removed either way */
    }
  }
  return respond(req, { ok: true }, { cookies: clearSessionCookies() });
}

// --- password reset and confirmation e-mails -----------------------------------------------------------------
export async function forgotPOST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const parsed = forgotSchema.safeParse(await jsonBody(req));
  if (!parsed.success) return fail(req, "invalid_request", 400);
  const pkce = await createPkce();
  const cookies = [{ name: PKCE_COOKIE, value: pkce.verifier, maxAge: PKCE_MAX_AGE }];
  try {
    await sendPasswordReset(parsed.data.email, callbackUrl(req, "/reset-password"), pkce);
  } catch (e) {
    // Same answer whether or not the address has an account; only infrastructure problems are reported.
    if (e instanceof AuthError && (e.code === "rate_limited" || e.code === "unavailable" || e.code === "not_configured")) return authFailure(req, e);
  }
  return respond(req, { ok: true }, { cookies });
}

export async function resendPOST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const parsed = forgotSchema.safeParse(await jsonBody(req));
  if (!parsed.success) return fail(req, "invalid_request", 400);
  try {
    await resendConfirmation(parsed.data.email, callbackUrl(req, "/account?welcome=1"));
  } catch (e) {
    if (e instanceof AuthError && (e.code === "rate_limited" || e.code === "unavailable")) return authFailure(req, e);
  }
  return respond(req, { ok: true });
}

export async function resetPOST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const parsed = resetSchema.safeParse(await jsonBody(req));
  if (!parsed.success) return fail(req, "invalid_request", 400);
  const cur = await currentSession(req);
  if (!cur.accessToken) return fail(req, "session_expired", 401, cur.cookies);
  try {
    await updatePassword(cur.accessToken, parsed.data.password);
    return respond(req, { ok: true }, { cookies: cur.cookies });
  } catch (e) {
    return authFailure(req, e, cur.cookies);
  }
}

/** Target of the links in Supabase's e-mails (sign-up confirmation and password reset). */
export async function callbackGET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const clearPkce: CookieToSet = { name: PKCE_COOKIE, value: "", maxAge: 0 };
  if (url.searchParams.get("error") || url.searchParams.get("error_code")) {
    const expired = /expired/i.test(`${url.searchParams.get("error_code")} ${url.searchParams.get("error_description")}`);
    return redirect(req, `/login?notice=${expired ? "link_expired" : "link_invalid"}`, [clearPkce]);
  }
  const code = url.searchParams.get("code");
  const verifier = readCookies(req).get(PKCE_COOKIE);
  // No code: the link used Supabase's older flow; the e-mail address is confirmed, so the visitor can log in.
  if (!code || !authConfigured()) return redirect(req, "/login?notice=confirmed", [clearPkce]);
  // Opened in another browser or device: Supabase has confirmed the address, but this browser can't finish it.
  if (!verifier) return redirect(req, next === "/reset-password" ? "/forgot-password?notice=other_browser" : "/login?notice=confirmed", [clearPkce]);
  try {
    const s = await exchangeCode(code, verifier);
    return redirect(req, next, [...sessionCookies(s), clearPkce]);
  } catch (e) {
    const expired = e instanceof AuthError && e.code === "link_invalid";
    return redirect(req, next === "/reset-password" ? `/forgot-password?notice=${expired ? "link_expired" : "link_invalid"}` : `/login?notice=${expired ? "link_expired" : "link_invalid"}`, [clearPkce]);
  }
}

// --- the signed-in visitor's own data ------------------------------------------------------------------------
const id64 = z.string().min(1).max(64);
const syncSchema = z.object({
  saved_add: z.array(id64).max(200).default([]),
  saved_remove: z.array(id64).max(200).default([]),
  alerts_upsert: z
    .array(
      alertSchema
        .pick({ id: true, productId: true, productName: true, productSlug: true, targetMinor: true, currency: true, destination: true, paused: true })
        .extend({ emailEnabled: z.boolean().default(true), id: z.string().regex(/^[A-Za-z0-9-]{1,40}$/), productName: z.string().min(1).max(200), productSlug: z.string().min(1).max(200) }),
    )
    .max(50)
    .default([]),
  alerts_remove: z.array(z.string().max(40)).max(50).default([]),
});

export interface AccountData {
  saved: string[];
  alerts: {
    id: string;
    productId: string;
    productName: string;
    productSlug: string;
    targetMinor: number;
    currency: string;
    destination: string;
    paused: boolean;
    emailEnabled: boolean;
    emailNotifiedMinor: number | null;
    emailNotifiedAt: string | null;
    createdAt: string;
  }[];
}

function dataFailure(req: Request, e: unknown, cookies: CookieToSet[]): Response {
  if (e instanceof RpcError) {
    if (e.status === 401 || /JWT|not signed in/i.test(e.message)) return fail(req, "session_expired", 401, clearSessionCookies());
    if (/up to (200|50)/.test(e.message)) return fail(req, "limit", 400, cookies);
    if (e.status === 404 || /does not exist|Could not find the function|PGRST202/i.test(e.message)) return fail(req, "database_not_ready", 503, cookies);
  }
  return fail(req, "unavailable", 503, cookies);
}

export async function accountDataGET(req: Request): Promise<Response> {
  if (!authConfigured()) return fail(req, "not_configured", 503);
  const cur = await currentSession(req);
  if (!cur.accessToken) return fail(req, "signed_out", 401, cur.cookies);
  try {
    const data = await rpc<AccountData>("pa_me_data", {}, { role: "user", accessToken: cur.accessToken });
    return respond(req, { ok: true, ...data }, { cookies: cur.cookies });
  } catch (e) {
    return dataFailure(req, e, cur.cookies);
  }
}

export async function accountSyncPOST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const parsed = syncSchema.safeParse(await jsonBody(req));
  if (!parsed.success) return fail(req, "invalid_request", 400);
  const cur = await currentSession(req);
  if (!cur.accessToken) return fail(req, "signed_out", 401, cur.cookies);
  try {
    const data = await rpc<AccountData>("pa_me_sync", parsed.data, { role: "user", accessToken: cur.accessToken });
    return respond(req, { ok: true, ...data }, { cookies: cur.cookies });
  } catch (e) {
    return dataFailure(req, e, cur.cookies);
  }
}
