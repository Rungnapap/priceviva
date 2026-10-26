/**
 * Minimal client for Supabase Auth (GoTrue) over HTTPS, used only on the server. No SDK, no secrets:
 * it uses the project URL and the PUBLIC (publishable/anon) key, exactly like Supabase's own browser library.
 * Passwords are sent straight to Supabase over TLS and never stored or logged by PriceViva.
 */
import { serverEnv } from "../env";

export interface AuthUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

/** Friendly, non-revealing error codes (message keys auth.err.<code>). */
export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "weak_password"
  | "same_password"
  | "rate_limited"
  | "signup_disabled"
  | "email_invalid"
  | "session_expired"
  | "link_invalid"
  | "not_configured"
  | "account_exists"
  | "invalid_request"
  | "unavailable";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly status: number,
  ) {
    super(code);
  }
}

export function authConfigured(): boolean {
  return !!serverEnv.supabaseUrl && !!serverEnv.supabaseAnonKey;
}

interface RawUser {
  id?: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  identities?: unknown[];
}
interface RawSession {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: RawUser;
}

const toUser = (u: RawUser): AuthUser => ({ id: String(u.id ?? ""), email: u.email ?? null, emailConfirmed: !!(u.email_confirmed_at ?? u.confirmed_at) });

function toSession(s: RawSession): AuthSession | null {
  if (!s.access_token || !s.refresh_token || !s.user?.id) return null;
  return { accessToken: s.access_token, refreshToken: s.refresh_token, expiresIn: Number(s.expires_in) || 3600, user: toUser(s.user) };
}

function mapError(status: number, body: Record<string, unknown>): AuthError {
  const code = String(body.error_code ?? body.code ?? body.error ?? "");
  const msg = String(body.msg ?? body.message ?? body.error_description ?? "");
  if (status === 429 || /rate_limit/.test(code)) return new AuthError("rate_limited", 429);
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg)) return new AuthError("email_not_confirmed", 400);
  if (code === "weak_password" || /password should/i.test(msg)) return new AuthError("weak_password", 422);
  if (code === "same_password") return new AuthError("same_password", 422);
  if (code === "user_already_exists" || code === "email_exists") return new AuthError("account_exists", 422);
  if (code === "signup_disabled" || /signups not allowed/i.test(msg)) return new AuthError("signup_disabled", 403);
  if (code === "email_address_invalid" || code === "validation_failed") return new AuthError("email_invalid", 400);
  if (code === "bad_jwt" || code === "session_not_found" || code === "refresh_token_not_found" || code === "refresh_token_already_used" || status === 401 || status === 403)
    return new AuthError("session_expired", 401);
  if (code === "flow_state_not_found" || code === "flow_state_expired" || code === "bad_code_verifier" || code === "otp_expired") return new AuthError("link_invalid", 400);
  if (code === "invalid_credentials" || code === "invalid_grant" || /invalid login credentials/i.test(msg)) return new AuthError("invalid_credentials", 400);
  if (status >= 500) return new AuthError("unavailable", 503);
  return new AuthError("invalid_request", 400);
}

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string; query?: Record<string, string> } = {}): Promise<T> {
  const url = serverEnv.supabaseUrl;
  const key = serverEnv.supabaseAnonKey;
  if (!url || !key) throw new AuthError("not_configured", 503);
  const u = new URL(`${url}/auth/v1/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) u.searchParams.set(k, v);
  const headers: Record<string, string> = { apikey: key, "content-type": "application/json", accept: "application/json" };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  else if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;
  let res: Response;
  try {
    res = await fetch(u, { method: init.method ?? "POST", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new AuthError("unavailable", 503);
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) throw mapError(res.status, json);
  return json as T;
}

export interface Pkce {
  verifier: string;
  challenge: string;
}

/** PKCE: the e-mail link only works in the browser that asked for it (the verifier stays in an httpOnly cookie). */
export async function createPkce(): Promise<Pkce> {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  const verifier = base64url(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge: base64url(digest) };
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signInWithPassword(email: string, password: string): Promise<AuthSession> {
  const s = toSession(await call<RawSession>("token", { query: { grant_type: "password" }, body: { email, password } }));
  if (!s) throw new AuthError("unavailable", 503);
  return s;
}

/**
 * Creates an account. Returns a session when Supabase is set to confirm e-mails automatically, otherwise null
 * (a confirmation e-mail was sent). For an address that already has an account Supabase answers exactly like
 * for a new one (when confirmations are on), so nobody can find out which addresses are registered.
 */
export async function signUp(email: string, password: string, redirectTo: string, pkce: Pkce): Promise<AuthSession | null> {
  try {
    const r = await call<RawSession & RawUser>("signup", {
      query: { redirect_to: redirectTo },
      body: { email, password, code_challenge: pkce.challenge, code_challenge_method: "s256" },
    });
    return toSession(r);
  } catch (e) {
    // With confirmations off, Supabase reports existing accounts. Treat it like success (no account enumeration):
    // the page tells the visitor to check their e-mail or log in.
    if (e instanceof AuthError && e.code === "account_exists") return null;
    throw e;
  }
}

export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  const s = toSession(await call<RawSession>("token", { query: { grant_type: "refresh_token" }, body: { refresh_token: refreshToken } }));
  if (!s) throw new AuthError("session_expired", 401);
  return s;
}

export async function exchangeCode(code: string, verifier: string): Promise<AuthSession> {
  const s = toSession(await call<RawSession>("token", { query: { grant_type: "pkce" }, body: { auth_code: code, code_verifier: verifier } }));
  if (!s) throw new AuthError("link_invalid", 400);
  return s;
}

export async function getUser(accessToken: string): Promise<AuthUser> {
  const u = await call<RawUser>("user", { method: "GET", token: accessToken });
  if (!u.id) throw new AuthError("session_expired", 401);
  return toUser(u);
}

export async function updatePassword(accessToken: string, password: string): Promise<void> {
  await call("user", { method: "PUT", token: accessToken, body: { password } });
}

/** Always succeeds from the visitor's point of view (no account enumeration). */
export async function sendPasswordReset(email: string, redirectTo: string, pkce: Pkce): Promise<void> {
  await call("recover", { query: { redirect_to: redirectTo }, body: { email, code_challenge: pkce.challenge, code_challenge_method: "s256" } });
}

export async function resendConfirmation(email: string, redirectTo: string): Promise<void> {
  await call("resend", { query: { redirect_to: redirectTo }, body: { type: "signup", email } });
}

export async function signOut(accessToken: string): Promise<void> {
  await call("logout", { query: { scope: "local" }, token: accessToken });
}
