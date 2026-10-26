/**
 * Integration test: sign-up, login, logout, password reset, sessions and the signed-in visitor's own data,
 * through PriceViva's real request handlers → a Supabase stand-in (Auth + PostgREST) → real PostgreSQL running
 * the migrations with row-level security. Same safety guard as the importer test: LOCAL throwaway database only.
 *   PA_TEST_PG=localhost:5432:postgres npm run test:db
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { psql, type PgConn } from "./helpers/postgrest-mock";
import { checkLocalTestPg } from "./helpers/local-db-guard";
import { signJwt, startSupabaseMock } from "./helpers/supabase-mock";

const cfg = process.env.PA_TEST_PG;
const target = checkLocalTestPg(cfg);
const skip = !cfg ? "set PA_TEST_PG=localhost:5432:postgres (a local throwaway PostgreSQL) to run database tests" : target.ok ? false : `not run: ${target.reason}`;
const { host, port, user } = target.ok ? target : { host: "localhost", port: "5432", user: "postgres" };
if (cfg && !target.ok) test("PA_TEST_PG points at a local throwaway database", () => assert.fail(target.reason));

const admin: PgConn = { host, port, user, database: "postgres" };
const conn: PgConn = { ...admin, database: "pa_acc_it" };
const root = path.resolve(import.meta.dirname, "..");
const KEYS = { anon: "test-anon-key-000", service: "test-service-key-000" };
const SITE = "http://localhost:3000";
let server: Server | undefined;
let mockUrl = "";
type H = typeof import("../src/lib/server/auth/handlers");
let h: H;

const runFile = (file: string) =>
  new Promise<void>((resolve, reject) =>
    execFile("psql", ["-h", host, "-p", port, "-U", user, "-d", conn.database, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], (e, _o, se) => (e ? reject(new Error(se)) : resolve())),
  );

before(async () => {
  if (skip) return;
  await psql(admin, `drop database if exists ${conn.database}`);
  await psql(admin, `create database ${conn.database}`);
  await runFile(path.join(root, "scripts/db/local-supabase-roles.sql"));
  // Supabase's default privileges, so the migrations' own revokes/grants are what protects the data.
  await psql(conn, "alter default privileges in schema public grant all on tables to anon, authenticated, service_role; alter default privileges in schema public grant all on functions to anon, authenticated, service_role;");
  for (const f of readdirSync(path.join(root, "supabase/migrations")).filter((x) => x.endsWith(".sql")).sort()) await runFile(path.join(root, "supabase/migrations", f));
  const mock = await startSupabaseMock(conn, KEYS);
  server = mock.server;
  mockUrl = mock.url;
  process.env.NEXT_PUBLIC_SUPABASE_URL = mock.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEYS.anon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEYS.service;
  h = await import("../src/lib/server/auth/handlers");
});
after(() => server?.close());

/** A tiny browser: keeps cookies and sends PriceViva's own Origin, like a real page would. */
class Browser {
  jar = new Map<string, string>();
  raw: string[] = [];
  cookie = () => [...this.jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
  absorb(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      this.raw.push(c);
      const [pair = "", ...attrs] = c.split(";").map((s) => s.trim());
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = decodeURIComponent(pair.slice(i + 1));
      if (attrs.some((a) => /^Max-Age=0$/i.test(a)) || value === "") this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return res;
  }
  req(pathname: string, init: { method?: string; body?: unknown; origin?: string | null } = {}) {
    const headers: Record<string, string> = { cookie: this.cookie() };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.origin !== null) headers.origin = init.origin ?? SITE;
    return new Request(`${SITE}${pathname}`, { method: init.method ?? (init.body !== undefined ? "POST" : "GET"), headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  }
  async call(fn: (r: Request) => Promise<Response>, pathname: string, init: Parameters<Browser["req"]>[1] = {}) {
    const res = this.absorb(await fn(this.req(pathname, init)));
    const text = await res.text();
    return { status: res.status, location: res.headers.get("location"), json: (text ? JSON.parse(text) : null) as Record<string, unknown> };
  }
}

async function lastMail(to: string) {
  const mails = (await (await fetch(`${mockUrl}/__mail?to=${encodeURIComponent(to)}`)).json()) as { type: string; link: string }[];
  return mails.at(-1);
}
/** Clicks the link in the e-mail: Supabase verifies it and redirects to PriceViva's /auth/callback. */
async function clickLink(link: string): Promise<string> {
  const r = await fetch(link, { redirect: "manual" });
  return r.headers.get("location") ?? "";
}
const pathOf = (u: string) => {
  const x = new URL(u);
  return x.pathname + x.search;
};

const A = { email: "anna.test@example.invalid", password: "Correct-horse-42" };
const B = { email: "ben.test@example.invalid", password: "Battery-staple-7" };

test("sign-up form rules are enforced on the server", { skip }, async () => {
  const b = new Browser();
  for (const body of [
    { email: "not-an-email", password: A.password, confirm: A.password },
    { email: A.email, password: "short1", confirm: "short1" },
    { email: A.email, password: "onlyletters", confirm: "onlyletters" },
    { email: A.email, password: A.password, confirm: "different-1" },
  ]) {
    const r = await b.call(h.signupPOST, "/api/auth/signup", { body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.json.error, "invalid_request");
  }
});

test("requests from other websites or without JSON are refused (CSRF protection)", { skip }, async () => {
  const b = new Browser();
  assert.equal((await b.call(h.loginPOST, "/api/auth/login", { body: A, origin: null })).status, 403);
  assert.equal((await b.call(h.loginPOST, "/api/auth/login", { body: A, origin: "https://evil.example" })).status, 403);
  assert.equal((await b.call(h.logoutPOST, "/api/auth/logout", { body: {}, origin: "https://evil.example" })).status, 403);
  assert.equal((await b.call(h.accountSyncPOST, "/api/account/sync", { body: {}, origin: "https://evil.example" })).status, 403);
});

test("sign-up with e-mail confirmation, then the e-mail link signs the visitor in", { skip }, async () => {
  const b = new Browser();
  const r = await b.call(h.signupPOST, "/api/auth/signup", { body: { ...A, confirm: A.password } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, signedIn: false });
  assert.ok(b.jar.has("pv_pkce"), "PKCE verifier kept in an httpOnly cookie");
  assert.ok(!b.jar.has("pv_at"), "not signed in before confirming");

  // Logging in before confirming gives a clear message.
  const early = await b.call(h.loginPOST, "/api/auth/login", { body: A });
  assert.equal(early.json.error, "email_not_confirmed");

  const mail = await lastMail(A.email);
  assert.equal(mail?.type, "signup");
  const callback = await clickLink(mail!.link);
  assert.match(callback, /^http:\/\/localhost:3000\/auth\/callback\?next=%2Faccount%3Fwelcome%3D1&code=/);
  const cb = await b.call(h.callbackGET, pathOf(callback));
  assert.equal(cb.status, 303);
  assert.equal(cb.location, `${SITE}/account?welcome=1`);
  assert.ok(b.jar.has("pv_at") && b.jar.has("pv_rt") && !b.jar.has("pv_pkce"));
  const s = await b.call(h.sessionGET, "/api/auth/session");
  assert.equal((s.json.user as { email: string }).email, A.email);
  assert.equal((s.json.user as { emailConfirmed: boolean }).emailConfirmed, true);
});

test("session cookies are httpOnly, SameSite=Lax, site-wide, and Secure on https", { skip }, async () => {
  const b = new Browser();
  await b.call(h.loginPOST, "/api/auth/login", { body: A });
  const at = b.raw.find((c) => c.startsWith("pv_at="))!;
  assert.match(at, /HttpOnly/);
  assert.match(at, /SameSite=Lax/);
  assert.match(at, /Path=\//);
  assert.doesNotMatch(at, /Secure/, "plain http on localhost");
  const res = await h.loginPOST(new Request("https://www.priceviva.example/api/auth/login", { method: "POST", headers: { origin: "https://www.priceviva.example", "content-type": "application/json" }, body: JSON.stringify(A) }));
  assert.ok(res.headers.getSetCookie().every((c) => /; Secure/.test(c)));
});

test("signing up again with a registered address reveals nothing", { skip }, async () => {
  const before = (await (await fetch(`${mockUrl}/__mail?to=${A.email}`)).json()) as unknown[];
  const r = await new Browser().call(h.signupPOST, "/api/auth/signup", { body: { ...A, confirm: A.password } });
  assert.deepEqual(r.json, { ok: true, signedIn: false });
  const afterMails = (await (await fetch(`${mockUrl}/__mail?to=${A.email}`)).json()) as unknown[];
  assert.equal(afterMails.length, before.length);
});

test("login: wrong password and unknown e-mail give the same message; next= only allows PriceViva pages", { skip }, async () => {
  const b = new Browser();
  const wrong = await b.call(h.loginPOST, "/api/auth/login", { body: { email: A.email, password: "Wrong-pass-1" } });
  const unknown = await b.call(h.loginPOST, "/api/auth/login", { body: { email: "nobody@example.invalid", password: "Wrong-pass-1" } });
  assert.equal(wrong.json.error, "invalid_credentials");
  assert.deepEqual(unknown.json, wrong.json);
  for (const [next, want] of [["/alerts", "/alerts"], ["//evil.example", "/account"], ["https://evil.example", "/account"], ["/api/auth/logout", "/account"]] as [string, string][]) {
    const ok = await b.call(h.loginPOST, "/api/auth/login", { body: { ...A, next } });
    assert.equal(ok.json.next, want, next);
  }
});

test("an expired access token is refreshed automatically (people stay signed in)", { skip }, async () => {
  const b = new Browser();
  await b.call(h.loginPOST, "/api/auth/login", { body: A });
  const oldRt = b.jar.get("pv_rt");
  const sub = JSON.parse(Buffer.from(b.jar.get("pv_at")!.split(".")[1]!, "base64url").toString()).sub as string;
  b.jar.set("pv_at", signJwt({ sub, role: "authenticated", exp: Math.floor(Date.now() / 1000) - 10 }));
  const s = await b.call(h.sessionGET, "/api/auth/session");
  assert.equal((s.json.user as { email: string }).email, A.email);
  assert.notEqual(b.jar.get("pv_rt"), oldRt, "refresh token rotated");
});

test("logout removes the cookies and ends the session at Supabase", { skip }, async () => {
  const b = new Browser();
  await b.call(h.loginPOST, "/api/auth/login", { body: A });
  const stolen = new Map(b.jar);
  const r = await b.call(h.logoutPOST, "/api/auth/logout", { body: {} });
  assert.equal(r.status, 200);
  assert.ok(!b.jar.has("pv_at") && !b.jar.has("pv_rt"));
  assert.equal((await b.call(h.sessionGET, "/api/auth/session")).json.user, null);
  // Even a copy of the old cookies no longer works.
  const thief = new Browser();
  thief.jar = stolen;
  assert.equal((await thief.call(h.accountDataGET, "/api/account/data")).status, 401);
});

test("saved products and alerts: each signed-in user sees and changes only their own", { skip }, async () => {
  const a = new Browser();
  await a.call(h.loginPOST, "/api/auth/login", { body: A });
  const alert = { id: "al-test-1", productId: "p01", productName: "Test phone", productSlug: "test-phone", targetMinor: 99900, currency: "SEK", destination: "SE", paused: false };
  const r = await a.call(h.accountSyncPOST, "/api/account/sync", { body: { saved_add: ["p01", "p02", "p01"], alerts_upsert: [alert] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.saved, ["p01", "p02"], "no duplicates");
  assert.equal((r.json.alerts as unknown[]).length, 1);

  // Edit, pause, then delete.
  let d = await a.call(h.accountSyncPOST, "/api/account/sync", { body: { alerts_upsert: [{ ...alert, targetMinor: 89900, paused: true }] } });
  assert.equal((d.json.alerts as { targetMinor: number; paused: boolean }[])[0]!.targetMinor, 89900);
  assert.equal((d.json.alerts as { paused: boolean }[])[0]!.paused, true);

  // Second user: sign up (with confirmation) and log in.
  const b = new Browser();
  await b.call(h.signupPOST, "/api/auth/signup", { body: { ...B, confirm: B.password } });
  await b.call(h.callbackGET, pathOf(await clickLink((await lastMail(B.email))!.link)));
  const bData = await b.call(h.accountDataGET, "/api/account/data");
  assert.deepEqual(bData.json.saved, []);
  assert.deepEqual(bData.json.alerts, []);
  // B tries to remove A's things: nothing happens to A.
  await b.call(h.accountSyncPOST, "/api/account/sync", { body: { saved_remove: ["p01"], alerts_remove: ["al-test-1"] } });
  d = await a.call(h.accountDataGET, "/api/account/data");
  assert.deepEqual(d.json.saved, ["p01", "p02"]);
  assert.equal((d.json.alerts as unknown[]).length, 1);

  d = await a.call(h.accountSyncPOST, "/api/account/sync", { body: { saved_remove: ["p02"], alerts_remove: ["al-test-1"] } });
  assert.deepEqual(d.json.saved, ["p01"]);
  assert.deepEqual(d.json.alerts, []);
});

test("account data: signed-out, invalid and over-limit requests are refused", { skip }, async () => {
  assert.equal((await new Browser().call(h.accountDataGET, "/api/account/data")).status, 401);
  const a = new Browser();
  await a.call(h.loginPOST, "/api/auth/login", { body: A });
  assert.equal((await a.call(h.accountSyncPOST, "/api/account/sync", { body: { saved_add: "p01" } })).status, 400);
  assert.equal((await a.call(h.accountSyncPOST, "/api/account/sync", { body: { alerts_upsert: [{ id: "x y", productId: "p", productName: "n", productSlug: "s", targetMinor: -1, currency: "SEK", destination: "SE", paused: false }] } })).status, 400);
  const many = Array.from({ length: 200 }, (_, i) => `bulk-${i}`);
  const r = await a.call(h.accountSyncPOST, "/api/account/sync", { body: { saved_add: many } });
  assert.equal(r.json.error, "limit");
  const after = await a.call(h.accountDataGET, "/api/account/data");
  assert.deepEqual(after.json.saved, ["p01"], "the whole over-limit change was rolled back");
});

test("password reset by e-mail link; unknown addresses get the same answer", { skip }, async () => {
  const b = new Browser();
  const unknown = await b.call(h.forgotPOST, "/api/auth/forgot", { body: { email: "nobody@example.invalid" } });
  assert.deepEqual(unknown.json, { ok: true });
  const r = await b.call(h.forgotPOST, "/api/auth/forgot", { body: { email: A.email } });
  assert.deepEqual(r.json, { ok: true });
  const mail = await lastMail(A.email);
  assert.equal(mail?.type, "recovery");
  const cb = await b.call(h.callbackGET, pathOf(await clickLink(mail!.link)));
  assert.equal(cb.location, `${SITE}/reset-password`);

  assert.equal((await b.call(h.resetPOST, "/api/auth/reset", { body: { password: "New-secret-99", confirm: "nope" } })).status, 400);
  assert.equal((await b.call(h.resetPOST, "/api/auth/reset", { body: { password: "short", confirm: "short" } })).status, 400);
  const ok = await b.call(h.resetPOST, "/api/auth/reset", { body: { password: "New-secret-99", confirm: "New-secret-99" } });
  assert.equal(ok.status, 200);
  assert.equal((await new Browser().call(h.loginPOST, "/api/auth/login", { body: A })).json.error, "invalid_credentials");
  assert.equal((await new Browser().call(h.loginPOST, "/api/auth/login", { body: { email: A.email, password: "New-secret-99" } })).status, 200);
  A.password = "New-secret-99";
});

test("reset without a session (expired link) asks for a new link", { skip }, async () => {
  const r = await new Browser().call(h.resetPOST, "/api/auth/reset", { body: { password: "New-secret-99", confirm: "New-secret-99" } });
  assert.equal(r.status, 401);
  assert.equal(r.json.error, "session_expired");
});

test("e-mail links: other browser, expired or reused links end on a helpful page", { skip }, async () => {
  const b = new Browser();
  await b.call(h.forgotPOST, "/api/auth/forgot", { body: { email: A.email } });
  const link = (await lastMail(A.email))!.link;
  const target = pathOf(await clickLink(link));
  // Opened in a different browser: no PKCE cookie there.
  assert.equal((await new Browser().call(h.callbackGET, target)).location, `${SITE}/forgot-password?notice=other_browser`);
  // Supabase reports an expired link.
  assert.equal((await b.call(h.callbackGET, "/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")).location, `${SITE}/login?notice=link_expired`);
  // A made-up code (in a browser that did ask for a link).
  await b.call(h.forgotPOST, "/api/auth/forgot", { body: { email: A.email } });
  assert.match((await b.call(h.callbackGET, "/auth/callback?next=%2Faccount&code=00000000-0000-0000-0000-000000000000")).location ?? "", /\/login\?notice=link_(invalid|expired)$/);
});

test("alert e-mails (live mode, switched on): one e-mail per drop, none for test data, unsubscribe stops them", { skip }, async () => {
  const { runAlertEmails, unsubscribeToken } = await import("../src/lib/server/alert-emails");
  const { fxSnapshot } = await import("../src/data/fx");
  const unsub = await import("../src/app/api/alerts/unsubscribe/route");
  const sent: { to: string; subject: string; text: string }[] = [];
  const provider = { async send(m: { to: string; subject: string; text: string }) { sent.push(m); return { ok: true as const }; } };
  const a = new Browser();
  await a.call(h.loginPOST, "/api/auth/login", { body: A });
  await a.call(h.accountSyncPOST, "/api/account/sync", {
    body: { alerts_upsert: [{ id: "al-mail", productId: "p-mail", productName: "Mail phone", productSlug: "mail-phone", targetMinor: 100000, currency: "SEK", destination: "SE", paused: false }] },
  });
  let price = 95000;
  let source = "awin";
  const loadProducts = async () => [{
    id: "p-mail", slug: "mail-phone", name: "Mail phone", brandName: "", condition: "new",
    offers: [{ id: "o1", productId: "p-mail", retailerId: "r1", retailer: { id: "r1", name: "TEST Retailer", country: "SE" }, price: { minor: price, currency: "SEK" }, vatIncluded: true, shipFrom: "SE", stock: "in_stock", observedDaysAgo: 0, sourceUrl: null, clickable: true, source, destinations: { SE: { shipping: { amountMinor: 0, basis: "verified" }, importCharges: { amountMinor: 0, basis: "verified" } } } }],
  }] as unknown as import("../src/lib/types").CatalogProduct[];
  const saved = { ...process.env };
  Object.assign(process.env, { CATALOG_SOURCE: "live", ALERT_EMAILS_ENABLED: "true", ALERT_EMAIL_SECRET: "s".repeat(40), NEXT_PUBLIC_SITE_URL: "https://www.priceviva.example" });
  try {
    const run = () => runAlertEmails({ provider, loadProducts, fx: fxSnapshot });
    // Test data never e-mails, even with everything switched on.
    source = "sample";
    assert.equal((await run()).sent, 0);
    source = "awin";
    assert.equal((await run()).sent, 1);
    assert.equal(sent[0]!.to, A.email);
    assert.match(sent[0]!.text, /950/);
    assert.match(sent[0]!.text, /unsubscribe\?token=/);
    assert.equal((await run()).sent, 0, "same price: no second e-mail");
    price = 120000;
    assert.equal((await run()).sent, 0, "above target: nothing, but re-armed");
    price = 97000;
    assert.equal((await run()).sent, 1, "new drop after rising: one e-mail");
    // Unsubscribe from the e-mail link (no login needed).
    const userId = (await (await fetch(`${mockUrl}/__users`)).json() as { id: string; email: string }[]).find((u) => u.email === A.email)!.id;
    const bad = await unsub.POST(new Request(`${SITE}/api/alerts/unsubscribe`, { method: "POST", headers: { origin: SITE, "content-type": "application/json" }, body: JSON.stringify({ token: "forged.token" }) }));
    assert.equal(bad.status, 400);
    const res = await unsub.POST(new Request(`${SITE}/api/alerts/unsubscribe`, { method: "POST", headers: { origin: SITE, "content-type": "application/json" }, body: JSON.stringify({ token: unsubscribeToken(userId, "al-mail") }) }));
    assert.equal(res.status, 200);
    price = 50000;
    assert.equal((await run()).sent, 0, "unsubscribed");
    const events = (await psql(conn, "select status from public.price_alert_events order by created_at")).trim().split("\n");
    assert.deepEqual(events, ["sent", "sent"]);
  } finally {
    for (const k of ["CATALOG_SOURCE", "ALERT_EMAILS_ENABLED", "ALERT_EMAIL_SECRET", "NEXT_PUBLIC_SITE_URL"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test("signed-in users cannot write server-managed alert fields; they can still manage their own alerts", { skip }, async () => {
  const a = new Browser();
  await a.call(h.loginPOST, "/api/auth/login", { body: A });
  const alert = { id: "al-guard", productId: "p-guard", productName: "Guard phone", productSlug: "guard-phone", targetMinor: 100000, currency: "SEK", destination: "SE", paused: false };
  await a.call(h.accountSyncPOST, "/api/account/sync", { body: { alerts_upsert: [alert] } });
  const q = async (sqlText: string) => (await psql(conn, sqlText)).trim();
  const uid = await q(`select id from auth.users where email = '${A.email}'`);
  // The e-mail worker (server, security-definer function) records a notified price.
  await psql(conn, `set role service_role; select public.pa_alert_observe('{"user_id":"${uid}","alert_id":"al-guard","best_minor":90000,"retailer":"Shop"}')`);
  const asUser = (sqlText: string) => psql(conn, `set role authenticated; set request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sqlText}`);
  const state = () => q(`select coalesce(email_notified_minor::text, 'null') || '|' || target_minor || '|' || paused from public.price_alerts where user_id = '${uid}' and id = 'al-guard'`);
  assert.equal(await state(), "90000|100000|false");

  // Directly through the API's table access: every server-managed field is refused.
  for (const [what, stmt] of [
    ["email_notified_minor", "update public.price_alerts set email_notified_minor = null where id = 'al-guard'"],
    ["email_notified_at", "update public.price_alerts set email_notified_at = now() where id = 'al-guard'"],
    ["created_at", "update public.price_alerts set created_at = now() - interval '1 year' where id = 'al-guard'"],
    ["updated_at", "update public.price_alerts set updated_at = now() where id = 'al-guard'"],
    ["user_id", `update public.price_alerts set user_id = '${uid}' where id = 'al-guard'`],
    ["product_id", "update public.price_alerts set product_id = 'other' where id = 'al-guard'"],
    ["destination", "update public.price_alerts set destination = 'DE' where id = 'al-guard'"],
    ["insert with email_notified_minor", `insert into public.price_alerts (user_id, id, product_id, product_name, product_slug, target_minor, currency, destination, email_notified_minor) values ('${uid}', 'al-x', 'p-x', 'X', 'x', 1, 'SEK', 'SE', 5)`],
    ["saved product update", "update public.user_saved_products set product_id = 'x'"],
    ["saved product created_at", `insert into public.user_saved_products (user_id, product_id, created_at) values ('${uid}', 'p-y', now())`],
  ]) {
    await assert.rejects(asUser(stmt!), /permission denied/, what);
  }
  assert.equal(await state(), "90000|100000|false", "nothing changed");

  // What customers may do still works: pause keeps the e-mail state; a new target clears it (trigger).
  await asUser("update public.price_alerts set paused = true where id = 'al-guard'");
  assert.equal(await state(), "90000|100000|true");
  await a.call(h.accountSyncPOST, "/api/account/sync", { body: { alerts_upsert: [{ ...alert, paused: false }] } });
  assert.equal(await state(), "90000|100000|false", "unchanged target through the app keeps the e-mail state");
  await a.call(h.accountSyncPOST, "/api/account/sync", { body: { alerts_upsert: [{ ...alert, targetMinor: 80000 }] } });
  assert.equal(await state(), "null|80000|false", "new target through the app: e-mail state cleared by the database");
  await asUser("update public.price_alerts set target_minor = 70000 where id = 'al-guard'");
  assert.equal(await state(), "null|70000|false");
  // Delete own alert still allowed.
  await asUser("delete from public.price_alerts where id = 'al-guard'");
  assert.equal(await q(`select count(*) from public.price_alerts where user_id = '${uid}' and id = 'al-guard'`), "0");
});
