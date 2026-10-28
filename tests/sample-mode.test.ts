/**
 * FREE TEST MODE: DummyJSON mapping, sample CSV importer, comparison engine, fallbacks and mode switching.
 * Uses a synthetic DummyJSON-shaped fixture and an injected fetch (no network).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FxTable } from "../src/lib/money";
import { fxSnapshot } from "../src/data/fx";

const root = path.resolve(import.meta.dirname, "..");
const fixture = JSON.parse(readFileSync(path.join(root, "tests/fixtures/dummyjson-products.json"), "utf8"));
const work = mkdtempSync(path.join(tmpdir(), "pa-sample-"));
process.chdir(work); // .data/ cache and override files go to a temp dir
process.env.SAMPLE_OFFERS_CSV = path.join(root, "data/sample-offers.csv");
delete process.env.CATALOG_SOURCE;

type Loader = typeof import("../src/lib/sample/loader");
let loader: Loader;
let repo: typeof import("../src/lib/catalog/sample-repo").sampleRepository;
let rankOffers: typeof import("../src/lib/pricing").rankOffers;
// Complete table (every display currency) so it satisfies FxTable; only EUR/SEK/GBP/USD matter for these tests.
const fx: FxTable = { base: "EUR", rates: { ...fxSnapshot.rates, EUR: 1, SEK: 11, GBP: 0.85, USD: 1.1 }, asOf: "test", label: "test" };
let calls = 0;
let failNext = false;

before(async () => {
  loader = await import("../src/lib/sample/loader");
  ({ sampleRepository: repo } = await import("../src/lib/catalog/sample-repo"));
  ({ rankOffers } = await import("../src/lib/pricing"));
  loader.setSampleFetcher(async () => {
    calls++;
    if (failNext) throw new Error("network down");
    return new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } });
  });
});

test("DummyJSON products are mapped with photos, departments and sample labels", async () => {
  const c = await loader.getSampleCatalog();
  assert.equal(c.status.ok, true);
  assert.equal(c.status.source, "api");
  assert.equal(c.products.length, 20); // 22 rows, 2 invalid skipped
  assert.deepEqual(c.status.issues.filter((i) => i.code === "invalid_product" || i.code === "invalid_price").length, 2);
  const p1 = c.byId.get("dj-1")!;
  assert.equal(p1.source, "sample");
  assert.equal(p1.department, "beauty");
  assert.equal(p1.subcategory, "makeup");
  assert.equal(p1.images.length, 3); // gallery: the 3 full-size photos; the thumbnail is kept separately for cards
  assert.match(p1.thumbnailUrl ?? "", /^https:\/\/cdn\.dummyjson\.com\/.+thumbnail/);
  assert.ok(p1.images.every((i) => i.url.startsWith("https://cdn.dummyjson.com/")));
  assert.equal(p1.gtin, ""); // random sample barcodes are never treated as GTINs
  assert.ok(Object.keys(p1.specs).some((k) => k.includes("not a real GTIN")));
  assert.ok(!JSON.stringify(p1).includes("Generated review")); // reviews are not imported
  assert.ok(!JSON.stringify(p1).includes("discountPercentage"));
  // Image rules: http and foreign hosts rejected.
  assert.equal(c.byId.get("dj-5")!.images.length, 0);
  assert.ok(c.status.issues.some((i) => i.ref === "dj-5" && i.code === "missing_image"));
  assert.ok(c.status.issues.some((i) => i.ref === "dj-190" && i.code === "unmapped_category"));
});

test("sample CSV offers are imported, labelled and validated", async () => {
  const c = await loader.getSampleCatalog();
  const o = c.status.offers!;
  assert.equal(o.rows, 30);
  assert.equal(o.imported, 28);
  assert.deepEqual(o.issues.map((i) => i.code).sort(), ["unknown_product", "unlabelled_retailer"]);
  for (const p of c.products) for (const off of p.offers) {
    assert.equal(off.source, "sample");
    assert.equal(off.clickable, false);
    assert.equal(off.sourceUrl, null);
    assert.equal(off.stock, "unknown");
    assert.equal(off.reference, undefined); // no discounts
  }
});

test("comparison engine on sample offers: verified only when every cost is known", async () => {
  const p1 = (await loader.getSampleCatalog()).byId.get("dj-1")!;
  // To Sweden: Nord SEK 109 + 0 shipping (domestic) = complete; Mitte EUR 9.49 + 4.90 (EU) = complete; Isles GB unknown shipping -> partial; DummyJSON list price -> item only.
  const se = rankOffers(p1.offers, "SE", "SEK", fx);
  assert.equal(se.best?.offer.retailer.name, "Sample Shop Nord");
  assert.equal(se.best?.displayTotalMinor, 10900);
  assert.equal(se.offers.find((r) => r.offer.retailer.name === "Sample Shop Mitte")!.displayTotalMinor, Math.round(((949 + 490) / 1) * 11));
  assert.equal(se.offers.find((r) => r.offer.retailer.name === "Sample Shop Isles")!.landed.status, "item_price_only");
  assert.equal(se.offers.find((r) => r.offer.retailerId === "dummyjson")!.landed.status, "item_price_only");
  assert.equal(se.offers.find((r) => r.offer.retailerId === "dummyjson")!.tier, 2); // list price is informational, ranked after shop offers
  // To the UK: Nord does not deliver ("x"), Isles is domestic & complete.
  const gb = rankOffers(p1.offers, "GB", "GBP", fx);
  assert.equal(gb.offers.find((r) => r.offer.retailer.name === "Sample Shop Nord")!.landed.status, "unavailable");
  assert.equal(gb.best?.offer.retailer.name, "Sample Shop Isles");
  assert.equal(gb.best?.displayTotalMinor, 998); // 7.99 + 1.99
  // Mitte -> GB: shipping known, import charges blank -> partial, never ranked as cheapest
  assert.equal(gb.offers.find((r) => r.offer.retailer.name === "Sample Shop Mitte")!.landed.status, "partial_total");
  // Product 2 Isles -> SE: import estimate given -> estimated total
  const p2 = (await loader.getSampleCatalog()).byId.get("dj-2")!;
  assert.equal(rankOffers(p2.offers, "SE", "SEK", fx).offers.find((r) => r.offer.retailer.name === "Sample Shop Isles")!.landed.status, "estimated_total");
});

test("products without sample offers show only the unverified list price", async () => {
  const p = (await loader.getSampleCatalog()).byId.get("dj-121")!;
  assert.equal(p.offers.length, 1);
  assert.equal(rankOffers(p.offers, "SE", "SEK", fx).best, null);
});

test("repository: search with typo, category filter, brand list, suggestions, related", async () => {
const s = await repo.search("beauty", {});
  assert.ok(s.items.length >= 5 && s.items.every((p) => p.department === "beauty"));
  const filtered = await repo.search("", { department: "furniture" });
  assert.equal(filtered.items.length, 5);
  assert.deepEqual(await repo.brands(), [{ slug: "fixture-brand", name: "Fixture Brand" }]);
  assert.ok((await repo.suggest("lapt"))[0]!.label.includes("Laptop"));
  const p = (await repo.product("fixture-armchair-11-dj11"))!;
  assert.ok(p);
  const related = await repo.related(p, 4);
  assert.equal(related.length, 4);
  assert.ok(related.every((r) => r.department === "furniture" && r.subcategory === "sofas"));
  assert.equal((await repo.search("", { department: "home" })).items.length, 0);
  assert.equal((await repo.priceDrops(10)).length, 0);
  const meta = await repo.meta();
  assert.equal(meta.mode, "sample");
  assert.equal(meta.departmentCounts.beauty, 10);
  assert.equal(meta.retailers.length, 3);
});

test("API failure: the last good copy on disk is used, with a notice", async () => {
  failNext = true;
  const c = await loader.getSampleCatalog({ force: true });
  assert.equal(c.status.source, "disk-cache");
  assert.equal(c.products.length, 20);
  assert.match((await repo.meta()).notice ?? "", /could not be reached/);
});

test("API failure with no cached copy: falls back to the built-in fictional catalogue, clearly noted", async () => {
  rmSync(path.join(work, ".data/dummyjson-products.json"));
  const c = await loader.getSampleCatalog({ force: true });
  assert.equal(c.status.ok, false);
  const meta = await repo.meta();
  assert.match(meta.notice ?? "", /built-in fictional demo catalogue/);
  const shelf = await repo.shelf({ limit: 3 });
  assert.ok(shelf.every((p) => p.source === "demo"));
  failNext = false;
  await loader.getSampleCatalog({ force: true });
  assert.ok(calls >= 3);
});

test("mode switching: admin override beats env; live without Supabase falls back to sample", async () => {
  const { catalogMode } = await import("../src/lib/server/env");
  const { writeSourceOverride } = await import("../src/lib/server/catalog-source");
  assert.equal(catalogMode(), "sample"); // default
  writeSourceOverride("demo");
  assert.equal(catalogMode(), "demo");
  writeSourceOverride("live");
  assert.equal(catalogMode(), "sample"); // no Supabase configured
  writeFileSync(path.join(work, ".data/catalog-source.json"), "{ not json");
  await new Promise((r) => setTimeout(r, 3100)); // override cache is 3 s
  process.env.CATALOG_SOURCE = "demo";
  assert.equal(catalogMode(), "demo"); // corrupt file ignored -> env
  delete process.env.CATALOG_SOURCE;
});
