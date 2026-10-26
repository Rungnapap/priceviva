import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createSessionToken, loginThrottled, recordLoginFailure, sameOrigin, verifyPassword, verifySessionToken } from "../src/lib/server/admin-session";

const SECRET = "x".repeat(64);

test("password hash from the CLI helper verifies; wrong password does not", () => {
  const out = execFileSync("node", ["scripts/hash-admin-password.mjs", "correct horse battery staple"], { encoding: "utf8" });
  const hash = out.match(/ADMIN_PASSWORD_HASH=(\S+)/)![1]!;
  assert.ok(verifyPassword("correct horse battery staple", hash));
  assert.ok(!verifyPassword("correct horse battery stapl", hash));
  assert.ok(!verifyPassword("anything", undefined));
  assert.ok(!verifyPassword("anything", "plaintext"));
});

test("session tokens: valid, expired, tampered, wrong secret", () => {
  const now = 1_800_000_000_000;
  const t = createSessionToken(now, SECRET);
  assert.ok(verifySessionToken(t, now + 1000, SECRET));
  assert.ok(!verifySessionToken(t, now + 9 * 3600_000, SECRET)); // expired after 8 h
  assert.ok(!verifySessionToken(t.replace(/.$/, (c) => (c === "A" ? "B" : "A")), now, SECRET));
  const [exp, mac] = t.split(".");
  assert.ok(!verifySessionToken(`${Number(exp) + 99999}.${mac}`, now, SECRET)); // extended expiry
  assert.ok(!verifySessionToken(t, now, "y".repeat(64)));
  assert.throws(() => createSessionToken(now, "short"));
});

test("CSRF same-origin check", () => {
  const mk = (h: Record<string, string>) => new Request("https://priceatlas.test/api/admin/x", { method: "POST", headers: h });
  assert.ok(sameOrigin(mk({ host: "priceatlas.test", origin: "https://priceatlas.test" })));
  assert.ok(!sameOrigin(mk({ host: "priceatlas.test", origin: "https://evil.test" })));
  assert.ok(!sameOrigin(mk({ host: "priceatlas.test" })));
});

test("login throttle after 5 failures", () => {
  const now = 1_000;
  for (let i = 0; i < 5; i++) recordLoginFailure("1.2.3.4", now);
  assert.ok(loginThrottled("1.2.3.4", now + 1));
  assert.ok(!loginThrottled("1.2.3.4", now + 11 * 60_000));
  assert.ok(!loginThrottled("5.6.7.8", now));
});
