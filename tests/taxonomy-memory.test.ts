import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { memoryCatalog } from "./helpers/memory-catalog";

let db: PGlite;
let furniture: string, lamp: string, furnitureSlug: string;
before(async () => {
  db = await memoryCatalog();
  const family = (await db.query<{ id: string }>("insert into public.products(family_key,name,department_slug,subcategory_slug) values ('TEST-FURN','TEST furniture','home','furniture') returning id")).rows[0]!.id;
  furniture = (await db.query<{ id: string }>("insert into public.variants(product_id,identity_key,slug,title,gtin,department_slug,subcategory_slug) values ($1,'TEST-FURN','test-furniture','TEST wooden armchair','02000000000015','home','furniture') returning id", [family])).rows[0]!.id;
  lamp = (await db.query<{ id: string }>("insert into public.variants(product_id,identity_key,slug,title,department_slug,subcategory_slug) values ($1,'TEST-LAMP','test-lamp','TEST reading lamp','home','lighting') returning id", [family])).rows[0]!.id;
  furnitureSlug = "test-furniture";
  const retailer = (await db.query<{ id: string }>("insert into public.retailers(source,external_id,name) values ('awin','TEST','TEST') returning id")).rows[0]!.id;
  for (const [variant, external] of [[furniture, "FURN"], [lamp, "LAMP"]]) {
    await db.query("insert into public.offers(variant_id,retailer_id,source,external_id,price_minor,currency) values ($1,$2,'awin',$3,10000,'SEK')", [variant, retailer, external]);
  }
  await db.exec("insert into public.category_mappings(source,source_category,department_slug,subcategory_slug,manual) values ('awin','TEST Legacy Furniture','home','furniture',true)");
  await db.query("select public.pa_refresh_search_doc($1)", [furniture]);
  await db.query("select public.pa_refresh_search_doc($1)", [lamp]);
});
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
async function rpc<T>(name: string, payload: unknown) {
  return (await db.query<{ result: T }>(`select public.${name}($1::jsonb) as result`, [JSON.stringify(payload)])).rows[0]!.result;
}

test("legacy furniture is returned under Furniture by lists, product details and saved IDs", async () => {
  const list = await rpc<{ total: number; items: { id: string; department: string; subcategory: string }[] }>("pa_catalog_list", { department: "furniture" });
  assert.equal(list.total, 1);
  assert.equal(list.items[0]!.id, furniture);
  assert.equal(list.items[0]!.department, "furniture");
  assert.equal(list.items[0]!.subcategory, "");
  const detail = await rpc<{ id: string; slug: string; department: string }>("pa_catalog_product", { slug: furnitureSlug });
  assert.equal(detail.id, furniture);
  assert.equal(detail.slug, furnitureSlug);
  assert.equal(detail.department, "furniture");
  const saved = await rpc<{ department: string }[]>("pa_catalog_by_ids", { ids: [furniture] });
  assert.equal(saved[0]!.department, "furniture");
});

test("Home lists and counts exclude furniture; legacy filters still resolve to it", async () => {
  const home = await rpc<{ total: number; items: { id: string }[] }>("pa_catalog_list", { department: "home" });
  assert.equal(home.total, 1);
  assert.equal(home.items[0]!.id, lamp);
  const legacy = await rpc<{ total: number; items: { id: string }[] }>("pa_catalog_list", { department: "home", subcategory: "furniture" });
  assert.equal(legacy.total, 1);
  assert.equal(legacy.items[0]!.id, furniture);
  const meta = await rpc<{ departments: Record<string, number>; subcategories: Record<string, number> }>("pa_catalog_meta", {});
  assert.equal(meta.departments.furniture, 1);
  assert.equal(meta.departments.home, 1);
  assert.equal(meta.subcategories["home/furniture"], undefined);
  assert.equal(meta.subcategories["home/lighting"], 1);
});

test("search and exact GTIN obey canonical department, legacy alias and condition filters", async () => {
  for (const q of ["wooden armchair", "02000000000015", ""]) {
    const furnitureHits = await rpc<{ id: string }[]>("pa_catalog_search", { q, department: "furniture" });
    assert.deepEqual(furnitureHits.map(p => p.id), [furniture]);
    const old = await rpc<{ id: string }[]>("pa_catalog_search", { q, department: "home", subcategory: "furniture" });
    assert.deepEqual(old.map(p => p.id), [furniture]);
    const home = await rpc<{ id: string }[]>("pa_catalog_search", { q, department: "home" });
    assert.ok(!home.some(p => p.id === furniture));
  }
  assert.deepEqual(await rpc("pa_catalog_search", { q: "02000000000015", department: "furniture", condition: "used" }), []);
});

test("new Furniture subcategory filters work alongside unmoved legacy records", async () => {
  await db.query("update public.variants set department_slug='furniture',subcategory_slug='chairs' where id=$1", [furniture]);
  const listed = await rpc<{ total: number }>("pa_catalog_list", { department: "furniture", subcategory: "chairs" });
  assert.equal(listed.total, 1);
  assert.equal((await rpc<{ total: number }>("pa_catalog_list", { department: "furniture", subcategory: "beds" })).total, 0);
  assert.equal((await rpc<{ subcategories: Record<string, number> }>("pa_catalog_meta", {})).subcategories["furniture/chairs"], 1);
});

test("read compatibility does not rewrite products, manual mappings, offers or prices", async () => {
  await rpc("pa_catalog_list", { department: "furniture" });
  await rpc("pa_catalog_meta", {});
  const raw = (await db.query<{ department_slug: string; subcategory_slug: string }>("select department_slug,subcategory_slug from public.variants where id=$1", [furniture])).rows[0]!;
  assert.deepEqual(raw, { department_slug: "home", subcategory_slug: "furniture" });
  const manual = (await db.query<{ manual: boolean; department_slug: string; subcategory_slug: string }>("select manual,department_slug,subcategory_slug from public.category_mappings where source_category='TEST Legacy Furniture'")).rows[0]!;
  assert.deepEqual(manual, { manual: true, department_slug: "home", subcategory_slug: "furniture" });
  assert.equal(Number((await db.query<{ n: number }>("select count(*) as n from public.offers")).rows[0]!.n), 2);
});

test("public catalog reads retain grants and private alias helper stays private", async () => {
  await db.exec("set local role anon");
  assert.equal((await rpc<{ total: number }>("pa_catalog_list", { department: "furniture" })).total, 1);
  assert.equal((await rpc<{ departments: Record<string, number> }>("pa_catalog_meta", {})).departments.furniture, 1);
  await assert.rejects(db.query("select public.pa_catalog_category('home','furniture')"), /permission denied/);
});
