/**
 * TEST HELPER: a small stand-in for a Supabase project, backed by a real local PostgreSQL (via psql).
 *   /rest/v1/rpc/<pa_fn>   PostgREST-style RPC. The role comes from the API key (anon / service_role), or from a
 *                          signed-in user's token (authenticated, with request.jwt.claims set), so function grants
 *                          and row-level security are exercised exactly like on Supabase.
 *   /auth/v1/*             the parts of Supabase Auth (GoTrue) that PriceViva uses: signup (PKCE), verify link,
 *                          token (password / refresh_token / pkce), user (GET/PUT), logout, recover, resend.
 *   /__mail, /__users      test-only: read the "e-mails" Supabase would have sent; inspect users.
 * Tokens are HS256 JWTs signed with a test secret. Synthetic test data only.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { psql, type PgConn } from "./postgrest-mock";

export interface SupabaseMockOptions {
  /** Like Supabase's "Confirm email" switch being OFF: sign-up signs the user in immediately. */
  autoconfirm?: boolean;
  /** Access-token lifetime in seconds (short values test refreshing). */
  accessTtl?: number;
}

interface MockUser {
  id: string;
  email: string;
  password: string;
  confirmedAt: string | null;
}
interface Mail {
  to: string;
  type: "signup" | "recovery";
  link: string;
}

const SECRET = "test-jwt-secret-not-for-production";
const b64 = (v: string) => Buffer.from(v, "utf8").toString("base64url");

export function signJwt(payload: Record<string, unknown>): string {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function verifyJwt(token: string): Record<string, unknown> | null {
  const [h, b, s] = token.split(".");
  if (!h || !b || !s) return null;
  const want = createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url");
  if (want !== s) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString("utf8")) as Record<string, unknown>;
  if (typeof p.exp !== "number" || p.exp < Math.floor(Date.now() / 1000)) return null;
  return p;
}

export async function startSupabaseMock(conn: PgConn, keys: { anon: string; service: string }, port = 0, opts: SupabaseMockOptions = {}) {
  const users = new Map<string, MockUser>(); // by e-mail
  const refresh = new Map<string, { userId: string; sessionId: string }>();
  const revokedSessions = new Set<string>();
  const codes = new Map<string, { userId: string; challenge: string | null; type: "signup" | "recovery"; clicked: boolean; redirectTo: string }>();
  const mails: Mail[] = [];
  const calls: string[] = [];
  let base = "";

  const byId = (id: string) => [...users.values()].find((u) => u.id === id);
  const sql = (s: string) => s.replace(/'/g, "''");

  function session(u: MockUser) {
    const sessionId = randomUUID();
    const exp = Math.floor(Date.now() / 1000) + (opts.accessTtl ?? 3600);
    const accessToken = signJwt({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", exp, session_id: sessionId });
    const rt = randomUUID().replace(/-/g, "");
    refresh.set(rt, { userId: u.id, sessionId });
    return { access_token: accessToken, token_type: "bearer", expires_in: opts.accessTtl ?? 3600, refresh_token: rt, user: publicUser(u) };
  }
  const publicUser = (u: MockUser) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.confirmedAt, confirmed_at: u.confirmedAt, identities: [{}] });
  const err = (res: ServerResponse, status: number, code: string, msg: string) => send(res, status, { code: status, error_code: code, msg });

  function userFromBearer(req: IncomingMessage): MockUser | null {
    const tok = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const p = verifyJwt(tok);
    if (!p || revokedSessions.has(String(p.session_id))) return null;
    return byId(String(p.sub)) ?? null;
  }

  async function confirm(u: MockUser) {
    if (u.confirmedAt) return;
    u.confirmedAt = new Date().toISOString();
    await psql(conn, `update auth.users set email_confirmed_at = now() where id = '${u.id}'`);
  }

  function newCode(u: MockUser, type: "signup" | "recovery", challenge: string | null, redirectTo: string) {
    const code = randomUUID();
    codes.set(code, { userId: u.id, challenge, type, clicked: false, redirectTo });
    mails.push({ to: u.email, type, link: `${base}/auth/v1/verify?token=${code}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}` });
  }

  async function auth(req: IncomingMessage, res: ServerResponse, url: URL, body: Record<string, unknown>) {
    const path = url.pathname.replace(/^\/auth\/v1\//, "");
    const redirectTo = url.searchParams.get("redirect_to") ?? "";
    if (path === "verify" && req.method === "GET") {
      const c = codes.get(url.searchParams.get("token") ?? "");
      const to = new URL(c?.redirectTo || redirectTo || base);
      if (!c) {
        to.searchParams.set("error", "access_denied");
        to.searchParams.set("error_code", "otp_expired");
        to.searchParams.set("error_description", "Email link is invalid or has expired");
      } else {
        const u = byId(c.userId);
        if (u) await confirm(u);
        c.clicked = true;
        to.searchParams.set("code", url.searchParams.get("token") ?? "");
      }
      res.writeHead(303, { location: to.toString() });
      return res.end();
    }
    if (req.headers.apikey !== keys.anon && req.headers.apikey !== keys.service) return err(res, 401, "no_api_key", "Invalid API key");
    calls.push(`auth:${path}${url.searchParams.get("grant_type") ? `:${url.searchParams.get("grant_type")}` : ""}`);
    const email = String(body.email ?? "").toLowerCase();
    const password = String(body.password ?? "");

    if (path === "signup" && req.method === "POST") {
      if (password.length < 6) return err(res, 422, "weak_password", "Password should be at least 6 characters.");
      const existing = users.get(email);
      if (existing) return opts.autoconfirm ? err(res, 422, "user_already_exists", "User already registered") : send(res, 200, { id: randomUUID(), email, identities: [] });
      const u: MockUser = { id: randomUUID(), email, password, confirmedAt: opts.autoconfirm ? new Date().toISOString() : null };
      users.set(email, u);
      await psql(conn, `insert into auth.users (id, email, email_confirmed_at) values ('${u.id}', '${sql(email)}', ${u.confirmedAt ? "now()" : "null"})`);
      if (opts.autoconfirm) return send(res, 200, session(u));
      newCode(u, "signup", typeof body.code_challenge === "string" ? body.code_challenge : null, redirectTo);
      return send(res, 200, publicUser(u));
    }
    if (path === "token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const u = users.get(email);
        if (!u || u.password !== password) return err(res, 400, "invalid_credentials", "Invalid login credentials");
        if (!u.confirmedAt) return err(res, 400, "email_not_confirmed", "Email not confirmed");
        return send(res, 200, session(u));
      }
      if (grant === "refresh_token") {
        const r = refresh.get(String(body.refresh_token ?? ""));
        if (!r || revokedSessions.has(r.sessionId)) return err(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
        refresh.delete(String(body.refresh_token));
        const u = byId(r.userId);
        return u ? send(res, 200, session(u)) : err(res, 400, "refresh_token_not_found", "not found");
      }
      if (grant === "pkce") {
        const c = codes.get(String(body.auth_code ?? ""));
        if (!c || !c.clicked) return err(res, 404, "flow_state_not_found", "invalid flow state, no valid flow state found");
        const hash = createHash("sha256").update(String(body.code_verifier ?? "")).digest("base64url");
        if (c.challenge && hash !== c.challenge) return err(res, 400, "bad_code_verifier", "code challenge does not match previously saved code verifier");
        codes.delete(String(body.auth_code));
        const u = byId(c.userId);
        return u ? send(res, 200, session(u)) : err(res, 404, "user_not_found", "User not found");
      }
      return err(res, 400, "validation_failed", "unsupported grant_type");
    }
    if (path === "user") {
      const u = userFromBearer(req);
      if (!u) return err(res, 403, "bad_jwt", "invalid JWT: unable to parse or verify signature");
      if (req.method === "GET") return send(res, 200, publicUser(u));
      if (req.method === "PUT") {
        if (typeof body.password === "string") {
          if (body.password.length < 6) return err(res, 422, "weak_password", "Password should be at least 6 characters.");
          if (body.password === u.password) return err(res, 422, "same_password", "New password should be different from the old password.");
          u.password = body.password;
        }
        return send(res, 200, publicUser(u));
      }
    }
    if (path === "logout" && req.method === "POST") {
      const tok = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      const p = verifyJwt(tok);
      if (p) revokedSessions.add(String(p.session_id));
      res.writeHead(204);
      return res.end();
    }
    if (path === "recover" && req.method === "POST") {
      const u = users.get(email);
      if (u) newCode(u, "recovery", typeof body.code_challenge === "string" ? body.code_challenge : null, redirectTo);
      return send(res, 200, {});
    }
    if (path === "resend" && req.method === "POST") {
      const u = users.get(email);
      if (u && !u.confirmedAt) newCode(u, "signup", null, redirectTo);
      return send(res, 200, {});
    }
    return err(res, 404, "not_found", "not found");
  }

  async function rest(req: IncomingMessage, res: ServerResponse, url: URL, raw: string) {
    const m = url.pathname.match(/^\/rest\/v1\/rpc\/(pa_[a-z_]+)$/);
    const key = req.headers.apikey;
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    let role: string | null = key === keys.service ? "service_role" : key === keys.anon ? "anon" : null;
    let claims: Record<string, unknown> | null = null;
    if (role === "anon" && bearer && bearer !== keys.anon) {
      claims = verifyJwt(bearer);
      if (!claims || revokedSessions.has(String(claims.session_id))) return send(res, 401, { code: "PGRST301", message: "JWT expired" });
      role = "authenticated";
    }
    if (req.method !== "POST" || !m || !role) return send(res, m ? 401 : 404, { message: role ? "not found" : "Invalid API key" });
    calls.push(`${role}:${m[1]}`);
    try {
      const p = JSON.stringify((JSON.parse(raw || "{}") as { p?: unknown }).p ?? {});
      const tag = `j${randomUUID().slice(0, 12).replace(/-/g, "")}`;
      const setClaims = claims ? `set request.jwt.claims = '${sql(JSON.stringify({ sub: claims.sub, role: "authenticated", email: claims.email }))}'; ` : "";
      const out = await psql(conn, `set role ${role}; ${setClaims}select public.${m[1]}(p => $${tag}$${p}$${tag}$::jsonb);`);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(out.trim() === "" ? "null" : out.trim());
    } catch (e) {
      const msg = (e as Error).message.replace(/^psql:.*?ERROR:\s*/s, "").split("\n")[0] ?? "error";
      send(res, /permission denied/.test(msg) ? 403 : 400, { message: msg.trim() });
    }
  }

  const server: Server = createServer((req, res) => {
    // CORS so the sandbox browser preview can call it directly (test helper only).
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "apikey, authorization, content-type, accept, content-profile, accept-profile");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      const url = new URL(req.url ?? "/", base);
      try {
        if (url.pathname === "/__mail") return send(res, 200, mails.filter((m) => !url.searchParams.get("to") || m.to === url.searchParams.get("to")));
        if (url.pathname === "/__users") return send(res, 200, [...users.values()].map((u) => ({ id: u.id, email: u.email, confirmed: !!u.confirmedAt })));
        if (url.pathname.startsWith("/auth/v1/")) {
          let body: Record<string, unknown> = {};
          try {
            body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          } catch {
            /* empty */
          }
          return await auth(req, res, url, body);
        }
        return await rest(req, res, url, raw);
      } catch (e) {
        send(res, 500, { message: (e as Error).message });
      }
    });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  return { url: base, server, calls, mails, users };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
