import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { memoryCatalog } from "./helpers/memory-catalog";
import { mapAwinRow } from "../src/lib/importers/awin/map-row";
import type { NormalizedRow } from "../src/lib/importers/types";

let db: PGlite;
let feed: string;
let run: string;
const ctx = { feedId: "test", source: "awin" as const, country: "SE", currency: "SEK", vatIncluded: true, retailer: { external_id: "A", name: "TEST A", country: "SE" } };
const row = (changes: Partial<NormalizedRow> = {}): NormalizedRow => ({
  ...mapAwinRow({ merchant_product_id: "item", product_name: "TEST item", search_price: "100", aw_deep_link: "https://www.awin1.com/pclick.php?p=test", stock_status: "in_stock" }, 1, ctx).row!,
  ...changes,
});
async function batch(rows: NormalizedRow[], retailer = "A") {
  return db.query("select public.pa_import_batch($1::jsonb) as result", [JSON.stringify({ run_id: run, feed_id: feed, source: "awin", retailer: { external_id: retailer, name: `TEST ${retailer}`, country: "SE" }, rows })]);
}
async function offer(retailer = "A", external = "item") {
  const result = await db.query<{ id: string; variant_id: string; condition: string; identity_key: string; pack_quantity: number | null; department_slug: string | null; subcategory_slug: string | null; manual_category_mapping_id: string | null }>(`
    select o.id,o.variant_id,v.condition,v.identity_key,v.pack_quantity,v.department_slug,v.subcategory_slug,v.manual_category_mapping_id
    from public.offers o join public.retailers r on r.id=o.retailer_id join public.variants v on v.id=o.variant_id
    where r.external_id=$1 and o.external_id=$2`, [retailer, external]);
  assert.equal(result.rows.length, 1);
  return result.rows[0]!;
}
async function count(table: "variants" | "offers" | "price_observations" | "match_reviews") {
  return Number((await db.query<{ n: number }>(`select count(*) as n from public.${table}`)).rows[0]!.n);
}

before(async () => {
  db = await memoryCatalog();
  feed = (await db.query<{ id: string }>("insert into public.feeds(provider,external_feed_id,country,currency) values ('awin','TEST','SE','SEK') returning id")).rows[0]!.id;
  run = (await db.query<{ id: string }>("insert into public.import_runs(feed_id,trigger) values ($1,'test') returning id", [feed])).rows[0]!.id;
});
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

test("fallback identities separate all four conditions and preserve offer/history IDs", async () => {
  await batch([row()]);
  const first = await offer();
  for (const condition of ["used", "refurbished", "open_box"] as const) {
    await batch([row({ condition })]);
    const current = await offer();
    assert.equal(current.condition, condition);
    assert.equal(current.id, first.id);
    assert.notEqual(current.variant_id, first.variant_id);
  }
  await batch([row()]);
  assert.equal((await offer()).variant_id, first.variant_id);
  assert.equal(await count("variants"), 4);
  assert.equal(await count("offers"), 1);
  assert.equal(await count("price_observations"), 5);
});

test("legacy fallback is reused for the same condition but cannot carry a used offer into new", async () => {
  await batch([row({ condition: "used" })]);
  const old = await offer();
  await db.query("update public.variants set identity_key='src:awin:A:item' where id=$1", [old.variant_id]);
  await batch([row({ condition: "used" })]);
  assert.equal((await offer()).variant_id, old.variant_id);
  await batch([row()]);
  assert.notEqual((await offer()).variant_id, old.variant_id);
  assert.equal((await offer()).condition, "new");
  assert.equal(await count("variants"), 2);
});

test("known MPN pack counts match across retailers, differing and unknown packs stay separate", async () => {
  const model = { brand: "TEST", mpn: "CREAM", colour: "White", size: "M" };
  await batch([row({ ...model, pack_quantity: 1 })]);
  await batch([row({ ...model, pack_quantity: 2 })], "B");
  await batch([row({ ...model, pack_quantity: 1 })], "C");
  await batch([row({ ...model, pack_quantity: null })], "D");
  assert.equal((await offer("A")).variant_id, (await offer("C")).variant_id);
  assert.notEqual((await offer("A")).variant_id, (await offer("B")).variant_id);
  assert.notEqual((await offer("A")).variant_id, (await offer("D")).variant_id);
  assert.equal(await count("variants"), 3);
  for (const retailer of ["A", "B", "C", "D"]) {
    const pack = retailer === "B" ? 2 : retailer === "D" ? null : 1;
    await batch([row({ ...model, pack_quantity: pack })], retailer);
  }
  assert.equal(await count("variants"), 3);
  assert.equal(await count("offers"), 4);
  assert.equal(await count("price_observations"), 4);
});

test("legacy clients omitting new fields keep the existing unknown-pack MPN match", async () => {
  const legacy = row({ brand: "TEST", mpn: "LEGACY" });
  delete legacy.pack_quantity;
  delete legacy.pack_quantity_uncertain;
  await batch([legacy]);
  const first = await offer();
  await batch([legacy], "B");
  assert.equal((await offer("B")).variant_id, first.variant_id);
  assert.equal(first.identity_key, "mpn:test|legacy|||new");
});

test("uncertain quantities never merge across retailers, including when a GTIN is present", async () => {
  const ambiguous = row({ brand: "TEST", mpn: "PACK", gtin: "02000000000015", pack_quantity: null, pack_quantity_uncertain: true });
  await batch([ambiguous]);
  await batch([ambiguous], "B");
  assert.notEqual((await offer()).variant_id, (await offer("B")).variant_id);
  await batch([ambiguous]);
  assert.equal(await count("variants"), 2);
});

test("same GTIN with contradictory pack quantities splits and creates one open review on reimport", async () => {
  const gtin = "02000000000015";
  await batch([row({ gtin, pack_quantity: 1 })]);
  await batch([row({ gtin, pack_quantity: 2 })], "B");
  const conflicting = await offer("B");
  assert.notEqual((await offer()).variant_id, conflicting.variant_id);
  await batch([row({ gtin, pack_quantity: 2 })], "B");
  assert.equal((await offer("B")).variant_id, conflicting.variant_id);
  assert.equal(await count("match_reviews"), 1);
  assert.equal(await count("variants"), 2);
});

test("GTIN size/color conflicts and fallback condition changes stay separated", async () => {
  const gtin = "02000000000015";
  await batch([row({ gtin, size: "M", colour: "Black" })]);
  await batch([row({ gtin, size: "L", colour: "White" })], "B");
  const separate = await offer("B");
  assert.notEqual((await offer()).variant_id, separate.variant_id);
  await batch([row({ gtin, size: "L", colour: "Red" })], "B");
  assert.notEqual((await offer("B")).variant_id, separate.variant_id);
  await batch([row({ gtin, size: "L", colour: "White", condition: "used" })], "B");
  assert.equal((await offer("B")).condition, "used");
});

test("identical GTIN matches across retailers and conditions never merge", async () => {
  const gtin = "02000000000015";
  await batch([row({ gtin })]);
  await batch([row({ gtin })], "B");
  assert.equal((await offer()).variant_id, (await offer("B")).variant_id);
  await batch([row({ gtin, condition: "used" })], "C");
  assert.notEqual((await offer()).variant_id, (await offer("C")).variant_id);
});

test("MPN sizes and colors are separate even when pack counts agree", async () => {
  const model = { brand: "TEST", mpn: "SHIRT", pack_quantity: 2 };
  await batch([row({ ...model, size: "M", colour: "Red" })]);
  await batch([row({ ...model, size: "L", colour: "Red" })], "B");
  await batch([row({ ...model, size: "M", colour: "Blue" })], "C");
  assert.equal(await count("variants"), 3);
});

test("manual mapping survives another retailer's automatic category and reimports", async () => {
  const mapping = (await db.query<{ id: string }>("insert into public.category_mappings(source,source_category,department_slug,subcategory_slug,manual) values ('awin','TEST Beauty','beauty','skin-care',true) returning id")).rows[0]!.id;
  const gtin = "02000000000015";
  await batch([row({ gtin, category: "TEST Beauty", department_slug: "kitchen", subcategory_slug: "cookware" })]);
  await batch([row({ gtin, category: "TEST Kitchen", department_slug: "kitchen", subcategory_slug: "small-appliances" })], "B");
  assert.equal((await offer()).department_slug, "beauty");
  assert.equal((await offer()).subcategory_slug, "skin-care");
  assert.equal((await offer()).manual_category_mapping_id, mapping);
  const manual = (await db.query<{ manual: boolean; department_slug: string }>("select manual,department_slug from public.category_mappings where id=$1", [mapping])).rows[0]!;
  assert.deepEqual(manual, { manual: true, department_slug: "beauty" });
  await batch([row({ gtin, category: "TEST Kitchen", department_slug: "kitchen" })], "B");
  assert.equal((await offer()).department_slug, "beauty");
});

test("manual mapping takes authority when the automatic retailer was imported first", async () => {
  const gtin = "02000000000015";
  await batch([row({ gtin, category: "TEST Kitchen", department_slug: "kitchen" })]);
  await db.exec("insert into public.category_mappings(source,source_category,department_slug,subcategory_slug,manual) values ('awin','TEST Beauty','beauty','makeup',true)");
  await batch([row({ gtin, category: "TEST Beauty", department_slug: "kitchen" })], "B");
  assert.equal((await offer()).department_slug, "beauty");
  await batch([row({ gtin, category: "TEST Kitchen", department_slug: "kitchen" })]);
  assert.equal((await offer()).department_slug, "beauty");
});

test("legacy manual mapping is recovered even before a provenance pointer exists", async () => {
  const gtin = "02000000000015";
  await batch([row({ gtin, category: "TEST Original", department_slug: "beauty" })]);
  await db.exec("insert into public.category_mappings(source,source_category,department_slug,subcategory_slug,manual) values ('awin','TEST Original','beauty','skin-care',true) on conflict (source,source_category) do update set manual=true,department_slug='beauty',subcategory_slug='skin-care'");
  await batch([row({ gtin, category: "TEST Other", department_slug: "kitchen" })], "B");
  assert.equal((await offer()).department_slug, "beauty");
  assert.equal((await offer()).subcategory_slug, "skin-care");
});

test("a null manual mapping remains authoritative", async () => {
  await db.exec("insert into public.category_mappings(source,source_category,manual) values ('awin','TEST Manual Unknown',true)");
  await batch([row({ gtin: "02000000000015", category: "TEST Manual Unknown", department_slug: "kitchen" })]);
  await batch([row({ gtin: "02000000000015", category: "TEST Other", department_slug: "beauty" })], "B");
  assert.equal((await offer()).department_slug, null);
});

test("server-only matching function remains inaccessible to anon", async () => {
  await db.exec("set local role anon");
  await assert.rejects(batch([row()]), /permission denied/);
});

test("admin mapping uses the later retailer's category and persists through the original retailer's reimport", async () => {
  const gtin = "02000000000015";
  await batch([row({ gtin, category: "TEST Original", department_slug: "kitchen" })]);
  await batch([row({ gtin, category: "TEST Later", department_slug: "kitchen" })], "B");
  const mapping = (await db.query<{ id: string }>("select id from public.category_mappings where source_category='TEST Later'")).rows[0]!.id;
  await db.query("select public.pa_admin_category_set($1::jsonb)", [JSON.stringify({ id: mapping, department_slug: "beauty", subcategory_slug: "makeup" })]);
  assert.equal((await offer()).department_slug, "beauty");
  await batch([row({ gtin, category: "TEST Original", department_slug: "kitchen" })]);
  assert.equal((await offer()).department_slug, "beauty");
  assert.equal((await offer()).manual_category_mapping_id, mapping);
  assert.equal((await db.query<{ department_slug: string }>("select p.department_slug from public.products p join public.variants v on v.product_id=p.id where v.id=$1", [(await offer()).variant_id])).rows[0]!.department_slug, "beauty");
});

test("manual category setter does not retag a different provider using the same category text", async () => {
  await batch([row({ category: "TEST Shared Text", department_slug: "kitchen" })]);
  await batch([row({ category: "TEST Shared Text", department_slug: "kitchen" })], "B");
  const direct = await offer("B");
  await db.query("update public.offers set source='direct' where id=$1", [direct.id]);
  await db.exec("update public.retailers set source='direct' where external_id='B'");
  const mapping = (await db.query<{ id: string }>("select id from public.category_mappings where source='awin' and source_category='TEST Shared Text'")).rows[0]!.id;
  await db.query("select public.pa_admin_category_set($1::jsonb)", [JSON.stringify({ id: mapping, department_slug: "beauty", subcategory_slug: "skin-care" })]);
  assert.equal((await offer()).department_slug, "beauty");
  assert.equal((await offer("B")).department_slug, "kitchen");
});

test("same-listing fallback pack changes separate variants without deleting history", async () => {
  await batch([row({ pack_quantity: 1 })]);
  const single = await offer();
  await batch([row({ pack_quantity: 2, price_minor: 15000 })]);
  const double = await offer();
  assert.notEqual(single.variant_id, double.variant_id);
  assert.equal(single.id, double.id);
  await batch([row({ pack_quantity: 1, price_minor: 10000 })]);
  assert.equal((await offer()).variant_id, single.variant_id);
  assert.equal(await count("variants"), 2);
  assert.equal(await count("offers"), 1);
  assert.equal(await count("price_observations"), 3);
});

test("Awin CSV imports carry pack evidence through the real orchestrator and SQL without duplicates", async () => {
  const { importFeed } = await import("../src/lib/importers/run");
  const source = [
    "merchant_product_id,product_name,search_price,aw_deep_link,brand_name,mpn,multipack,currency",
    "CSV1,TEST Cream 1-pack,100,https://www.awin1.com/pclick.php?p=1,TEST,CREAM,1,SEK",
    "CSV2,TEST Cream 2-pack,180,https://www.awin1.com/pclick.php?p=2,TEST,CREAM,2,SEK",
    "CSV3,TEST Cream 2-pack,180,https://www.awin1.com/pclick.php?p=3,TEST,CREAM,1,SEK",
  ].join("\n");
  const sink: import("../src/lib/importers/run").ImportSink = {
    start: async () => ({ started: true, run_id: run, active_offers: await count("offers") }),
    batch: async p => db.query("select public.pa_import_batch($1::jsonb)", [JSON.stringify(p)]),
    logErrors: async (runId, errors) => db.query("select public.pa_import_log_errors($1::jsonb)", [JSON.stringify({ run_id: runId, errors })]),
    finish: async p => (await db.query<{ result: { offers_deactivated: number } }>("select public.pa_import_finish($1::jsonb) as result", [JSON.stringify(p)])).rows[0]!.result,
  };
  const feedRecord: import("../src/lib/importers/run").FeedRecord = {
    id: feed, provider: "awin", external_feed_id: "TEST", advertiser_id: "A", advertiser_name: "TEST A", name: "TEST", country: "SE", currency: "SEK", vat_included: true, enabled: true, download_url_template: null, provider_last_imported_at: null, last_success_at: null, refresh_hours: 24,
  };
  for (let i = 0; i < 2; i++) {
    const result = await importFeed(feedRecord, { trigger: "test", source: [source], sink });
    assert.equal(result.status, "succeeded", result.message);
    assert.equal(result.rowsImported, 3);
    assert.equal(result.rowsRejected, 0);
  }
  assert.equal(await count("variants"), 3);
  assert.equal(await count("offers"), 3);
  assert.equal(await count("price_observations"), 3);
  assert.equal((await offer("A", "CSV1")).pack_quantity, 1);
  assert.equal((await offer("A", "CSV2")).pack_quantity, 2);
  assert.equal((await offer("A", "CSV3")).pack_quantity, null);
});

test("condition/pack changes retain original historical context instead of contaminating the new variant", async () => {
  await batch([row({ pack_quantity: 1 })]);
  const single = await offer();
  // Model pre-migration observations, which intentionally have no variant context yet.
  await db.exec("update public.price_observations set variant_id=null");
  await batch([row({ pack_quantity: 2, price_minor: 15000 })]);
  const double = await offer();
  const originalHistory = (await db.query<{ history: { priceMinor: number }[] }>("select public.pa_catalog_price_history($1::jsonb) as history", [JSON.stringify({ id: single.variant_id })])).rows[0]!.history;
  const newHistory = (await db.query<{ history: { priceMinor: number }[] }>("select public.pa_catalog_price_history($1::jsonb) as history", [JSON.stringify({ id: double.variant_id })])).rows[0]!.history;
  assert.deepEqual(originalHistory.map(p => p.priceMinor), [10000]);
  assert.deepEqual(newHistory.map(p => p.priceMinor), [15000]);
  assert.equal(await count("price_observations"), 2);
  assert.equal((await db.query<{ n: number }>("select count(*) as n from public.price_observations where variant_id=$1", [single.variant_id])).rows[0]!.n, 1);
});

test("attribute/pack enrichment refreshes displayed labels and the search document", async () => {
  const gtin = "02000000000015";
  await batch([row({ gtin })]);
  await batch([row({ gtin, colour: "Emerald", size: "XL", pack_quantity: 2 })], "B");
  const v = (await db.query<{ variant_label: string; indexed: boolean }>("select variant_label,search_doc @@ to_tsquery('simple','emerald & xl') as indexed from public.variants where id=$1", [(await offer()).variant_id])).rows[0]!;
  assert.equal(v.variant_label, "Emerald · XL · 2-pack");
  assert.equal(v.indexed, true);
});

test("an incoming manual null clears automatic variant and parent categories and stays authoritative", async () => {
  const gtin = "02000000000015";
  await batch([row({ gtin, category: "TEST Auto", department_slug: "kitchen", subcategory_slug: "cookware" })]);
  await db.exec("insert into public.category_mappings(source,source_category,manual) values ('awin','TEST Clear',true)");
  await batch([row({ gtin, category: "TEST Clear", department_slug: "beauty" })], "B");
  assert.equal((await offer()).department_slug, null);
  const parent = (await db.query<{ department_slug: string | null }>("select p.department_slug from public.products p join public.variants v on v.product_id=p.id where v.id=$1", [(await offer()).variant_id])).rows[0]!;
  assert.equal(parent.department_slug, null);
  await batch([row({ gtin, category: "TEST Auto", department_slug: "kitchen" })]);
  assert.equal((await offer()).department_slug, null);
});
