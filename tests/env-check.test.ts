import { test } from "node:test";
import assert from "node:assert/strict";
import { keyKind, legacyJwtRole, supabaseEnvProblems } from "../src/lib/server/env-check";

// Fake keys in the documented shapes only (not real credentials).
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ iss: "supabase", role })).toString("base64url")}.c2lnbmF0dXJl`;
const URL_OK = "https://abcdefghijklmnop.supabase.co";
const PUB = "sb_publishable_TESTONLY000000000000";
const SECRET = "sb_secret_TESTONLY00000000000000000";

test("recognises new and legacy key types", () => {
  assert.equal(keyKind(PUB), "public");
  assert.equal(keyKind(SECRET), "secret");
  assert.equal(keyKind(jwt("anon")), "public");
  assert.equal(keyKind(jwt("service_role")), "secret");
  assert.equal(keyKind("hello"), "unknown");
  assert.equal(legacyJwtRole("eyJ.not-base64.x"), null);
});

test("a correct setup has no problems (new and legacy keys)", () => {
  assert.deepEqual(supabaseEnvProblems({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: PUB, SUPABASE_SERVICE_ROLE_KEY: SECRET }), []);
  assert.deepEqual(supabaseEnvProblems({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"), SUPABASE_SERVICE_ROLE_KEY: jwt("service_role") }), []);
  assert.deepEqual(supabaseEnvProblems({}), []);
});

test("a secret key in any NEXT_PUBLIC_ variable is an error", () => {
  for (const k of [SECRET, jwt("service_role")]) {
    const p = supabaseEnvProblems({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: k });
    assert.ok(p.some((x) => x.level === "error" && x.variable === "NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  }
  assert.ok(supabaseEnvProblems({ NEXT_PUBLIC_SOMETHING: SECRET }).some((x) => x.variable === "NEXT_PUBLIC_SOMETHING" && x.level === "error"));
});

test("public key in the secret variable, identical keys and bad URLs are caught", () => {
  assert.ok(supabaseEnvProblems({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, SUPABASE_SERVICE_ROLE_KEY: PUB }).some((x) => x.level === "error"));
  assert.ok(supabaseEnvProblems({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRET, SUPABASE_SERVICE_ROLE_KEY: SECRET }).some((x) => /same as the public key/.test(x.message)));
  for (const u of ["http://abc.supabase.co", "https://abc.supabase.co/rest/v1", "postgresql://postgres:pw@db.abc.supabase.co:5432/postgres", "not a url"]) {
    assert.ok(supabaseEnvProblems({ NEXT_PUBLIC_SUPABASE_URL: u }).some((x) => x.level === "error"), u);
  }
  assert.ok(supabaseEnvProblems({ SUPABASE_SERVICE_ROLE_KEY: SECRET }).some((x) => /missing/.test(x.message)));
  assert.ok(supabaseEnvProblems({ SUPABASE_DB_URL: "postgresql://x" }).some((x) => x.level === "warning"));
});

test("messages never contain the key or URL values", () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: "http://secret-host.example/rest/v1", NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRET, SUPABASE_SERVICE_ROLE_KEY: SECRET, NEXT_PUBLIC_X: jwt("service_role") };
  const text = JSON.stringify(supabaseEnvProblems(env));
  for (const v of Object.values(env)) assert.ok(!text.includes(v));
  assert.ok(!text.includes("secret-host"));
});
