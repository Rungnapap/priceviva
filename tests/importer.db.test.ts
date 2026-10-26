/**
 * Integration test: Awin importer -> PostgREST-style RPC -> real PostgreSQL running the Supabase migration.
 * Requires a local PostgreSQL (psql on PATH). Set PA_TEST_PG="host:port:user" to enable, e.g.
 *   PA_TEST_PG=/tmp:54329:postgres npm run test:db
 * Uses only the synthetic fixtures in tests/fixtures (never real products).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import type { FxTable } from "../src/lib/money";
import { fxSnapshot } from "../src/data/fx";
import type { Server } from "node:http";
import { psql, startPostgrestMock, type PgConn } from "./helpers/postgrest-mock";
import { checkLocalTestPg } from "./helpers/local-db-guard";
import { readdirSync } from "node:fs";

const cfg = process.env.PA_TEST_PG;
// Safety guard: these tests drop and recreate a database, so they only ever connect to PostgreSQL on this computer.
const target = checkLocalTestPg(cfg);
const skip = !cfg ? "set PA_TEST_PG=localhost:5432:postgres (a local throwaway PostgreSQL) to run database tests" : target.ok ? false : `not run: ${target.reason}`;
const { host, port, user } = target.ok ? target : { host: "localhost", port: "5432", user: "postgres" };
if (cfg && !target.ok) {
  // Make the refusal visible as a failure instead of silently skipping. No connection has been made.
  test("PA_TEST_PG points at a local throwaway database", () => assert.fail(target.reason));
}
const admin: PgConn = { host, port, user, database: "postgres" };
const conn: PgConn = { ...admin, database: "pa_it" };
const root = path.resolve(import.meta.dirname, "..");
const KEYS = { anon: "test-anon-key-000", service: "test-service-key-000" };
let server: Server | undefined;

// Imported lazily so env vars are set first.
let importFeed: typeof import("../src/lib/importers/run").importFeed;
let rpc: typeof import("../src/lib/server/supabase-rpc").rpc;
let rankOffers: typeof import("../src/lib/pricing").rankOffers;

const runFile = (file: string) =>
  new Promise<void>((resolve, reject) =>
    execFile("psql", ["-h", host, "-p", port, "-U", user, "-d", "pa_it", "-v", "ON_ERROR_STOP=1", "-q", "-f", file], (e, _o, se) => (e ? reject(new Error(se)) : resolve())),
  );
const fixture = (name: string) => createReadStream(path.join(root, "tests/fixtures", name), { encoding: "utf8", highWaterMark: 97 }); // tiny chunks: exercises chunk-boundary parsing

type Feed = Parameters<typeof importFeed>[0];
let alpha: Feed;
let beta: Feed;

before(async () => {
  if (skip) return;
  await psql(admin, "drop database if exists pa_it");
  await psql(admin, "create database pa_it");
  await runFile(path.join(root, "scripts/db/local-supabase-roles.sql"));
  // Every migration in order, then every migration after the first again: additive migrations must be safe to run twice.
  const migrations = readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of migrations) await runFile(path.join(root, "supabase/migrations", f));
  for (const f of migrations.slice(1)) await runFile(path.join(root, "supabase/migrations", f));
  const mock = await startPostgrestMock(conn, KEYS);
  server = mock.server;
  process.env.NEXT_PUBLIC_SUPABASE_URL = mock.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEYS.anon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEYS.service;
  ({ importFeed } = await import("../src/lib/importers/run"));
  ({ rpc } = await import("../src/lib/server/supabase-rpc"));
  ({ rankOffers } = await import("../src/lib/pricing"));

  await rpc("pa_admin_feeds_upsert", {
    provider: "awin",
    feeds: [
      { external_feed_id: "F-ALPHA", advertiser_id: "9001", advertiser_name: "TEST Retailer Alpha", name: "Default", country: "GB", currency: "GBP", membership_status: "active" },
      { external_feed_id: "F-BETA", advertiser_id: "9002", advertiser_name: "TEST Retailer Beta", name: "Default", country: "GB", currency: "GBP", membership_status: "active" },
    ],
  }, { role: "service" });
  const ids = (await psql(conn, "select external_feed_id || '=' || id from feeds")).trim().split("\n").map((l) => l.split("="));
  const id = (x: string) => ids.find(([k]) => k === x)![1]!;
  const base = { provider: "awin" as const, country: "GB", currency: "GBP", vat_included: true, enabled: true, download_url_template: null, provider_last_imported_at: null, last_success_at: null, refresh_hours: 24, name: "Default" };
  alpha = { ...base, id: id("F-ALPHA"), external_feed_id: "F-ALPHA", advertiser_id: "9001", advertiser_name: "TEST Retailer Alpha" };
  beta = { ...base, id: id("F-BETA"), external_feed_id: "F-BETA", advertiser_id: "9002", advertiser_name: "TEST Retailer Beta" };
});

after(async () => {
  server?.close();
});

const q = async (sql: string) => (await psql(conn, sql)).trim();

test("enable rules: one feed first, second only after a successful run", { skip }, async () => {
  const r1 = await rpc<{ ok: boolean }>("pa_admin_feed_update", { feed_id: alpha.id, enabled: true, max_enabled: 2, supported_countries: ["SE", "DE", "GB"] }, { role: "service" });
  assert.equal(r1.ok, true);
  const r2 = await rpc<{ ok: boolean; error: string }>("pa_admin_feed_update", { feed_id: beta.id, enabled: true, max_enabled: 2, supported_countries: ["SE", "DE", "GB"] }, { role: "service" });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /successfully before enabling another/);
});

test("anon role cannot call importer functions", { skip }, async () => {
  await assert.rejects(rpc("pa_import_batch", {}, { role: "anon" }), /permission denied/);
  await assert.rejects(rpc("pa_admin_overview", {}, { role: "anon" }), /permission denied/);
});

test("import alpha feed: valid rows imported, bad rows rejected with reasons", { skip }, async () => {
  const r = await importFeed(alpha, { trigger: "test", source: fixture("awin-legacy-alpha.csv") });
  assert.equal(r.status, "succeeded", r.message);
  assert.equal(r.rowsTotal, 11);
  assert.equal(r.rowsImported, 7);
  assert.equal(r.rowsRejected, 4); // bad price, no link, duplicate id, non-Awin link
  const codes = await q(`select string_agg(code, ',' order by code) from import_errors where run_id = '${r.runId}'`);
  assert.equal(codes, "duplicate_row,invalid_gtin,invalid_price,missing_image,missing_link,missing_link");
  // Description: HTML stripped, quoted comma + newline preserved as text.
  assert.equal(await q(`select description from variants where title = 'TEST Fixture Headphones' and colour = 'Black' and condition = 'new'`), `Over-ear headphones, "fixture" text with a newline`);
});

test("variants are never merged across condition, colour or size", { skip }, async () => {
  assert.equal(await q(`select count(*) from variants where gtin = '02000000000015'`), "2"); // new + refurbished
  assert.equal(await q(`select count(*) from variants where mpn = 'FB-RUN'`), "2"); // size 42 and 43
  assert.equal(await q(`select count(distinct product_id) from variants where title = 'TEST Fixture Headphones'`), "1"); // same family via parent id
});

test("second feed can be enabled after success; cross-retailer GTIN match works", { skip }, async () => {
  const ok = await rpc<{ ok: boolean }>("pa_admin_feed_update", { feed_id: beta.id, enabled: true, max_enabled: 2, supported_countries: ["SE", "DE", "GB"] }, { role: "service" });
  assert.equal(ok.ok, true);
  const r = await importFeed(beta, { trigger: "test", source: fixture("awin-legacy-beta.csv") });
  assert.equal(r.status, "succeeded", r.message);
  assert.equal(r.rowsImported, 4);
  // BETA-1 joined the black headphones (same GTIN + condition): 2 offers on one variant.
  assert.equal(await q(`select count(*) from offers o join variants v on v.id = o.variant_id where v.gtin = '02000000000015' and v.condition = 'new'`), "2");
  // BETA-3 (brand+MPN+colour+size 42) joined ALPHA-4; BETA-4 (no size) did NOT.
  assert.equal(await q(`select count(*) from offers o join variants v on v.id = o.variant_id where v.mpn = 'FB-RUN' and v.size = '42'`), "2");
  assert.equal(await q(`select count(*) from variants where mpn = 'FB-RUN'`), "3");
  // BETA-2: same GTIN as the white one but says Red -> kept separate + flagged for review.
  assert.equal(await q(`select count(*) from match_reviews where reason = 'gtin_attribute_conflict' and status = 'open'`), "1");
  assert.equal(await q(`select count(*) from offers o join variants v on v.id = o.variant_id where v.identity_key = 'gtin:02000000000022|new'`), "1");
  assert.equal(await q(`select colour from variants where identity_key like 'src:awin:9002:BETA-2'`), "Red");
});

test("product view: all offers listed, gallery images, verified total only when costs known", { skip }, async () => {
  const slug = await q(`select slug from variants where gtin = '02000000000015' and condition = 'new'`);
  const p = await rpc<import("../src/lib/types").CatalogProduct>("pa_catalog_product", { slug }, { role: "anon" });
  assert.equal(p.offers.length, 2);
  assert.ok(p.offers.every((o) => o.clickable));
  assert.deepEqual(p.images.map((i) => i.url).sort(), ["https://images.test.invalid/a1-side.jpg", "https://images.test.invalid/a1.jpg", "https://images.test.invalid/b1.jpg"]);
  assert.equal(p.siblings?.length, 1); // white sibling in the same family (refurb has no family id)
  // Complete table (every display currency) so it satisfies FxTable; only EUR/SEK/GBP/USD matter for these tests.
const fx: FxTable = { base: "EUR", rates: { ...fxSnapshot.rates, EUR: 1, SEK: 11, GBP: 0.85, USD: 1.1 }, asOf: "test", label: "test" };
  const r = rankOffers(p.offers, "GB", "GBP", fx);
  assert.equal(r.best?.offer.retailer.name, "TEST Retailer Beta");
  assert.equal(r.best?.displayTotalMinor, 9450); // 94.50 + verified free delivery
  assert.equal(r.best?.landed.status, "verified_total");
  const alphaOffer = r.offers.find((o) => o.offer.retailer.name === "TEST Retailer Alpha")!;
  assert.equal(alphaOffer.displayTotalMinor, 10498); // 99.99 + 4.99
  // Other destinations: no delivery info in the feed -> unavailable, never guessed.
  assert.equal(rankOffers(p.offers, "SE", "SEK", fx).best, null);
  // Refurbished unit: delivery cost blank -> partial, not cheapest.
  const refurb = await rpc<import("../src/lib/types").CatalogProduct>("pa_catalog_product", { slug: await q(`select slug from variants where gtin = '02000000000015' and condition = 'refurbished'`) }, { role: "anon" });
  assert.equal(rankOffers(refurb.offers, "GB", "GBP", fx).offers[0]!.landed.status, "partial_total");
  assert.equal(refurb.offers[0]!.rrp, null);
});

test("search: typo tolerance and exact GTIN", { skip }, async () => {
  const typo = await rpc<{ slug: string }[]>("pa_catalog_search", { q: "fixture hedphones" }, { role: "anon" });
  assert.ok(typo.length >= 2);
  const g = await rpc<{ gtin: string }[]>("pa_catalog_search", { q: "2000000000039" }, { role: "anon" });
  assert.equal(g.length, 1);
  assert.equal(g[0]!.gtin, "02000000000039");
  const none = await rpc<unknown[]>("pa_catalog_search", { q: "zzqxwv" }, { role: "anon" });
  assert.equal(none.length, 0);
});

test("department mapping and listing", { skip }, async () => {
  const list = await rpc<{ total: number; items: { department: string; subcategory: string }[] }>("pa_catalog_list", { department: "electronics", subcategory: "headphones" }, { role: "anon" });
  assert.ok(list.total >= 3);
  const meta = await rpc<{ departments: Record<string, number>; products: number }>("pa_catalog_meta", {}, { role: "anon" });
  assert.ok(meta.departments.electronics! >= 3 && meta.departments.sports! >= 2 && meta.departments.refurbished === 1);
});

test("re-import: removed offers deactivated, price changes recorded", { skip }, async () => {
  const { readFileSync } = await import("node:fs");
  const lines = readFileSync(path.join(root, "tests/fixtures/awin-legacy-alpha.csv"), "utf8").split("\n");
  const without2 = lines.filter((l) => !l.includes(",ALPHA-2,")).join("\n").replace(",99.99,TEST Retailer Alpha,9001,GBP,4.99,Fixturebrand,Black", ",89.99,TEST Retailer Alpha,9001,GBP,4.99,Fixturebrand,Black");
  const r = await importFeed(alpha, { trigger: "test", source: [without2] });
  assert.equal(r.status, "succeeded", r.message);
  assert.equal(r.offersDeactivated, 1);
  assert.equal(await q(`select is_active from offers where external_id = 'ALPHA-2'`), "f");
  assert.equal(await q(`select count(*) from price_observations po join offers o on o.id = po.offer_id where o.external_id = 'ALPHA-1'`), "2");
});

test("safety: an empty/broken feed never wipes the catalogue", { skip }, async () => {
  const before = await q(`select count(*) from offers where feed_id = '${alpha.id}' and is_active`);
  const header = "aw_deep_link,product_name,merchant_product_id,search_price,currency\n";
  const r = await importFeed(alpha, { trigger: "test", source: [header + ",x,ID1,abc,GBP\n"] });
  assert.equal(r.status, "failed");
  assert.equal(await q(`select count(*) from offers where feed_id = '${alpha.id}' and is_active`), before);
  const bad = await importFeed(alpha, { trigger: "test", source: ["some,other,format\n1,2,3\n"] });
  assert.equal(bad.status, "failed");
  assert.match(bad.message, /missing required columns/);
});

test("outbound redirect returns only the stored Awin link and logs a click without personal data", { skip }, async () => {
  const id = await q(`select id from offers where external_id = 'BETA-1'`);
  const r = await rpc<{ found: boolean; click_url: string; source: string }>("pa_offer_redirect", { offer_id: id, from_path: "/product/x" }, { role: "service" });
  assert.equal(r.found, true);
  assert.match(r.click_url, /^https:\/\/www\.awin1\.com\/pclick\.php\?p=2001/);
  assert.equal(await q(`select count(*) from click_events`), "1");
  const inactive = await q(`select id from offers where external_id = 'ALPHA-2'`);
  assert.equal((await rpc<{ found: boolean }>("pa_offer_redirect", { offer_id: inactive }, { role: "service" })).found, false);
});

test("admin issue lists", { skip }, async () => {
  const missing = await rpc<{ title: string }[]>("pa_admin_issues", { kind: "missing_photos" }, { role: "service" });
  assert.ok(missing.some((m) => m.title === "TEST Fixture Kettle"));
  const reviews = await rpc<unknown[]>("pa_admin_issues", { kind: "reviews" }, { role: "service" });
  assert.equal(reviews.length, 1);
  const cats = await rpc<{ source_category: string; department_slug: string | null }[]>("pa_admin_issues", { kind: "categories" }, { role: "service" });
  assert.ok(cats.find((c) => c.source_category === "Kitchen > Kettles")?.department_slug === "kitchen");
  const ov = await rpc<{ counts: Record<string, number> }>("pa_admin_overview", {}, { role: "service" });
  assert.equal(ov.counts.open_reviews, 1);
  assert.ok(ov.counts.missing_photos! >= 1);
});

test("manual category mapping overrides automatic guesses and re-tags products", { skip }, async () => {
  const id = await q(`select id from category_mappings where source_category = 'Home > Lighting'`);
  await rpc("pa_admin_category_set", { id, department_slug: "electronics", subcategory_slug: "smart-home" }, { role: "service" });
  assert.equal(await q(`select department_slug || '/' || subcategory_slug from variants where source_category = 'Home > Lighting'`), "electronics/smart-home");
});

test("price history: returns only recorded observations, oldest first, per retailer", { skip }, async () => {
  const slug = await q(`select v.slug from variants v join offers o on o.variant_id = v.id where o.external_id = 'ALPHA-1'`);
  const hist = await rpc<{ retailer: string; priceMinor: number; currency: string; observedAt: string; source: string }[]>("pa_catalog_price_history", { slug }, { role: "anon" });
  const alpha1 = hist.filter((h) => h.retailer === "TEST Retailer Alpha");
  assert.deepEqual(alpha1.map((h) => h.priceMinor), [9999, 8999], "the two imports recorded 99.99 then 89.99");
  assert.ok(alpha1.every((h) => h.currency === "GBP" && h.source === "awin"));
  assert.ok(new Date(alpha1[0]!.observedAt) <= new Date(alpha1[1]!.observedAt));
  assert.deepEqual(await rpc("pa_catalog_price_history", { slug: "no-such-product" }, { role: "anon" }), []);
});

test("local offers: only merchant/verified offers inside the radius, real distance, rejected/expired hidden", { skip }, async () => {
  const retailer = await q(`select id from retailers where name = 'TEST Retailer Alpha'`);
  // Kalmar centre ~56.663,16.357; store A ~1 km away, store B in Växjö (~100 km).
  const a = await q(`insert into stores (retailer_id, name, address_line, postal_code, city, country, lat, lng, source, verified_at, website_url)
    values ('${retailer}', 'TEST Store Kalmar', 'Storgatan 1', '392 32', 'Kalmar', 'SE', 56.6634, 16.3568, 'test-fixture', now(), 'https://example.com/kalmar') returning id`);
  const b = await q(`insert into stores (retailer_id, name, address_line, city, country, lat, lng, source, verified_at)
    values ('${retailer}', 'TEST Store Vaxjo', 'Kungsgatan 2', 'Växjö', 'SE', 56.8777, 14.8091, 'test-fixture', now()) returning id`);
  const mk = async (title: string, verification: string, endsInDays: number, store: string, availability = "in_stock") => {
    const id = await q(`insert into promotions (retailer_id, title, promo_price_minor, currency, starts_at, ends_at, scope, source, verification)
      values ('${retailer}', '${title}', 49900, 'SEK', now() - interval '1 day', now() + interval '${endsInDays} days', 'in_store', 'test-fixture', '${verification}') returning id`);
    await q(`insert into promotion_stores (promotion_id, store_id, availability, observed_at) values ('${id}', '${store}', '${availability}', now())`);
  };
  await mk("Verified Kalmar offer", "verified", 5, a);
  await mk("Pending Kalmar offer", "pending", 5, a, "unknown");
  await mk("Rejected Kalmar offer", "rejected", 5, a);
  await mk("Vaxjo offer", "verified", 5, b);
  const near = await rpc<{ title: string; status: string; distanceKm: number; availability: string; store: { address: string; lat: number; website: string | null } }[]>(
    "pa_catalog_local_offers", { lat: 56.6634, lng: 16.3568 + 0.016, radius_km: 10 }, { role: "anon" },
  );
  assert.deepEqual(near.map((o) => o.title).sort(), ["Pending Kalmar offer", "Verified Kalmar offer"]);
  assert.equal(near.find((o) => o.title === "Verified Kalmar offer")?.status, "verified");
  assert.equal(near.find((o) => o.title === "Pending Kalmar offer")?.status, "merchant");
  assert.ok(near.every((o) => o.distanceKm > 0.5 && o.distanceKm < 1.5), "distance from real coordinates (~1 km)");
  assert.equal(near[0]!.store.address, "Storgatan 1, 392 32 Kalmar");
  const wide = await rpc<{ title: string }[]>("pa_catalog_local_offers", { lat: 56.6634, lng: 16.3568, radius_km: 100 }, { role: "anon" });
  assert.ok(wide.some((o) => o.title === "Vaxjo offer"));
});
