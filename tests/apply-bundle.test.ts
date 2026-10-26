import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { BUNDLE_PATH, buildApplySql, INTERNAL_FUNCTIONS, PUBLIC_FUNCTIONS, SERVER_FUNCTIONS, USER_FUNCTIONS } from "../scripts/db/build-apply-sql";

const root = path.resolve(import.meta.dirname, "..");

test("supabase/apply/priceviva_apply_all.sql is up to date (run: npm run db:bundle)", () => {
  assert.equal(readFileSync(BUNDLE_PATH, "utf8"), buildApplySql());
});

test("bundle contains every migration verbatim, in order, inside one transaction", () => {
  const sql = buildApplySql();
  const files = readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  let at = sql.indexOf("\nbegin;\n");
  assert.ok(at > 0);
  for (const f of files) {
    const body = readFileSync(path.join(root, "supabase/migrations", f), "utf8").trimEnd();
    const i = sql.indexOf(body, at);
    assert.ok(i > at, `${f} missing or out of order`);
    at = i;
  }
  assert.ok(sql.indexOf("\ncommit;\n") > at, "commit comes after the last migration");
  // The migrations themselves must not end the transaction early.
  for (const f of files) assert.doesNotMatch(readFileSync(path.join(root, "supabase/migrations", f), "utf8"), /^\s*(commit|rollback|begin)\s*;/im, f);
});

test("bundle and migrations never drop or truncate anything", () => {
  // Statements that run at install time only: function bodies (as $$ … $$) may delete a signed-in user's own rows
  // when they un-save something; DO blocks are still checked. "TRUNCATE" also appears as a privilege name.
  const installTime = buildApplySql().replace(/\bas\s+\$\$[\s\S]*?\$\$/gi, "");
  assert.doesNotMatch(installTime, /\b(drop\s+(table|schema|function|database|role|extension|policy|trigger|view|type|index|owned)\b|truncate\s+(table\s+)?[\w."]+\s*[;,]|delete\s+from\b)/i);
});

test("function lists match the functions the migrations create", () => {
  const all = readdirSync(path.join(root, "supabase/migrations")).map((f) => readFileSync(path.join(root, "supabase/migrations", f), "utf8")).join("\n");
  const created = new Set([...all.matchAll(/create or replace function public\.(pa_[a-z_]+)\(/g)].map((m) => m[1]));
  const listed = new Set<string>([...PUBLIC_FUNCTIONS, ...SERVER_FUNCTIONS, ...INTERNAL_FUNCTIONS, ...USER_FUNCTIONS]);
  assert.deepEqual([...created].sort(), [...listed].sort());
});
