import { test } from "node:test";
import assert from "node:assert/strict";
import { diff, firstSync, isEmpty, toAccountAlert, type AccountAlert, type Snapshot } from "../src/lib/account-sync";
import { safeNext, signupSchema, loginSchema, resetSchema, fieldErrors } from "../src/lib/auth-rules";

const alert = (id: string, productId = "p1", extra: Partial<AccountAlert> = {}): AccountAlert => ({
  id, productId, productName: "Phone", productSlug: "phone", targetMinor: 10000, currency: "SEK", destination: "SE", paused: false, emailEnabled: true, ...extra,
});
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("diff: adds, removes and changed alerts only", () => {
  const prev: Snapshot = { saved: ["a", "b"], alerts: [alert("x"), alert("y", "p2")] };
  const next: Snapshot = { saved: ["b", "c"], alerts: [alert("x", "p1", { paused: true }), alert("z", "p3")] };
  const d = diff(prev, next);
  assert.deepEqual(d.saved_add, ["c"]);
  assert.deepEqual(d.saved_remove, ["a"]);
  assert.deepEqual(d.alerts_upsert.map((a) => a.id), ["x", "z"]);
  assert.deepEqual(d.alerts_remove, ["y"]);
  assert.ok(isEmpty(diff(next, next)));
});

test("first sign-in: a guest's lists are added to the account, conflicts keep the account's alert", () => {
  const local: Snapshot = { saved: ["a", "b"], alerts: [alert("g1", "p1"), alert("g2", "p2")] };
  const server: Snapshot = { saved: ["b"], alerts: [alert("s1", "p2")] };
  const p = firstSync(local, null, ME, server);
  assert.deepEqual(p.saved_add, ["a"]);
  assert.deepEqual(p.alerts_upsert.map((a) => a.id), ["g1"]);
  assert.deepEqual(p.saved_remove, []);
  assert.deepEqual(p.alerts_remove, []);
});

test("shared computer: another account's lists are never copied into this account", () => {
  const local: Snapshot = { saved: ["theirs"], alerts: [alert("t1")] };
  assert.ok(isEmpty(firstSync(local, OTHER, ME, { saved: [], alerts: [] })));
  assert.deepEqual(firstSync(local, ME, ME, { saved: [], alerts: [] }).saved_add, ["theirs"]);
});

test("browser alert → account alert drops browser-only fields and defaults e-mail on", () => {
  const a = toAccountAlert({ id: "x", productId: "p", productName: "N", productSlug: "s", targetMinor: 1, currency: "EUR", destination: "DE", createdAt: "", paused: false, lastNotifiedMinor: 5, lastNotifiedAt: "t", lastCheckedAt: "t", lastBestMinor: 3 });
  assert.deepEqual(Object.keys(a).sort(), ["currency", "destination", "emailEnabled", "id", "paused", "productId", "productName", "productSlug", "targetMinor"]);
  assert.equal(a.emailEnabled, true);
});

test("form rules: e-mail, password strength, confirmation", () => {
  const bad = (v: unknown) => fieldErrors((signupSchema.safeParse(v) as { error: Parameters<typeof fieldErrors>[0] }).error);
  assert.equal(bad({ email: "", password: "Abcdefg1", confirm: "Abcdefg1" }).email, "auth.err.emailRequired");
  assert.equal(bad({ email: "x@", password: "Abcdefg1", confirm: "Abcdefg1" }).email, "auth.err.emailInvalid");
  assert.equal(bad({ email: "a@b.se", password: "Ab1", confirm: "Ab1" }).password, "auth.err.passwordShort");
  assert.equal(bad({ email: "a@b.se", password: "abcdefgh", confirm: "abcdefgh" }).password, "auth.err.passwordWeak");
  assert.equal(bad({ email: "a@b.se", password: "Abcdefg1", confirm: "Abcdefg2" }).confirm, "auth.err.passwordMismatch");
  assert.equal(bad({ email: "a@b.se", password: "å".repeat(37) + "1", confirm: "å".repeat(37) + "1" }).password, "auth.err.passwordLong");
  assert.ok(signupSchema.safeParse({ email: " Anna@Example.se ", password: "Lösenord1", confirm: "Lösenord1" }).success);
  assert.ok(loginSchema.safeParse({ email: "a@b.se", password: "x" }).success, "login does not apply sign-up rules");
  assert.ok(!resetSchema.safeParse({ password: "short1", confirm: "short1" }).success);
});

test("safeNext only allows PriceViva pages", () => {
  assert.equal(safeNext("/alerts?x=1"), "/alerts?x=1");
  for (const v of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined, "/api/auth/logout", "/auth/callback", "/login", "/a\nb"]) {
    assert.equal(safeNext(v as string), "/account", String(v));
  }
});

test("price filter uses the price shown on the card — including sample list prices (your 'laptop 500–1000 USD' case)", async () => {
  const { shownPrice, rangeInCurrency, inRange } = await import("../src/lib/listing-price");
  const { mapDummyProduct } = await import("../src/lib/sample/dummyjson");
  const { fxSnapshot } = await import("../src/data/fx");
  const dj = (id: number, title: string, price: number) =>
    mapDummyProduct({ id, title, price, category: "laptops", description: "", brand: "Samsung", stock: 5, images: [], thumbnail: "" } as never, "2026-10-26T00:00:00Z").product;
  const tab = dj(160, "Samsung Galaxy Tab S8 Plus Grey", 599.99); // only a DummyJSON list price, no shop offer
  const yoga = dj(81, "Lenovo Yoga 920", 1099.99);
  const mini = dj(159, "iPad Mini 2021 Starlight", 499.99);
  const range = rangeInCurrency({ min: 500, max: 1000, currency: "USD" }, "USD", fxSnapshot);
  const shown = (p: typeof tab) => shownPrice(p, "SE", "USD", fxSnapshot);
  assert.equal(shown(tab), 59999, "same number as the card shows");
  assert.ok(inRange(shown(tab)!, range.minMinor, range.maxMinor), "USD 599.99 is between 500 and 1000");
  assert.ok(!inRange(shown(yoga)!, range.minMinor, range.maxMinor), "USD 1,099.99 is above");
  assert.ok(!inRange(shown(mini)!, range.minMinor, range.maxMinor), "USD 499.99 is below");
  // Same range typed in USD but viewed in SEK: converted with the same rates as the card.
  const sek = rangeInCurrency({ min: 500, max: 1000, currency: "USD" }, "SEK", fxSnapshot);
  assert.ok(inRange(shownPrice(tab, "SE", "SEK", fxSnapshot)!, sek.minMinor, sek.maxMinor));
});
