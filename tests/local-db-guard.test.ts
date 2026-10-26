import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLocalTestPg } from "./helpers/local-db-guard";

const clean = {};

test("accepts only local throwaway servers", () => {
  for (const v of ["localhost:5432:postgres", "127.0.0.1:5433:postgres", "LOCALHOST:5432:postgres", "/tmp:54329:postgres", "/var/run/postgresql:5432:postgres"]) {
    assert.equal(checkLocalTestPg(v, clean).ok, true, v);
  }
});

test("refuses Supabase and every other remote host before connecting", () => {
  for (const v of [
    "db.abcdefghijklmnop.supabase.co:5432:postgres",
    "aws-0-eu-north-1.pooler.supabase.com:5432:postgres.abcdefghijklmnop",
    "localhost.example.com:5432:postgres",
    "10.0.0.5:5432:postgres",
    "192.168.1.20:5432:postgres",
    "0.0.0.0:5432:postgres",
    "::1:5432:postgres",
    "postgresql://postgres:pw@localhost:5432/postgres",
    "/tmp/../srv:5432:postgres",
  ]) {
    const r = checkLocalTestPg(v, clean);
    assert.equal(r.ok, false, v);
  }
});

test("refuses malformed values and odd user names", () => {
  for (const v of ["", "localhost", "localhost:5432", "localhost:port:postgres", "localhost:70000:postgres", "localhost:5432:post gres", "localhost:5432:x;drop"]) {
    assert.equal(checkLocalTestPg(v, clean).ok, false, v);
  }
  assert.equal(checkLocalTestPg(undefined, clean).ok, false);
});

test("refuses when libpq environment variables could redirect the connection", () => {
  for (const name of ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"]) {
    const r = checkLocalTestPg("localhost:5432:postgres", { [name]: "anything" });
    assert.equal(r.ok, false, name);
    if (!r.ok) assert.match(r.reason, new RegExp(name));
  }
});

test("refusal messages never echo the value (it could contain a password)", () => {
  const r = checkLocalTestPg("db.x.supabase.co:5432:postgres", clean);
  assert.equal(r.ok, false);
  if (!r.ok) assert.doesNotMatch(r.reason, /supabase\.co:5432/);
});
