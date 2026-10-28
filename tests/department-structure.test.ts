import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { departments } from "../src/data/departments";
import { shopCategories, groupForDepartment, shopCategoryHref } from "../src/data/shop-categories";
import { catalogCategory, categoryFilter, legacyDepartmentRedirect, legacySearchRedirect } from "../src/lib/catalog-categories";
import { catalogSitemapPaths } from "../src/lib/catalog-sitemap";
import { guessDepartment } from "../src/lib/importers/categories";
import { mapDummyProduct, type DummyProduct } from "../src/lib/sample/dummyjson";
import { compareGroup } from "../src/lib/catalog-queries";
import { demoRepository } from "../src/lib/catalog/demo-repo";
import { makeT, categoryLabel } from "../src/i18n";

const cases = [
  [null, "Sofa", "furniture", "sofas"],
  ["Furniture", "Fixture Armchair", "furniture", "sofas"],
  [null, "Gaming chair", "furniture", "chairs"],
  [null, "Kontorsstol", "furniture", "chairs"],
  [null, "Dining table", "furniture", "tables"],
  [null, "Skrivbord", "furniture", "tables"],
  [null, "Bed frame", "furniture", "beds"],
  [null, "Mattress", "furniture", "beds"],
  [null, "Wardrobe", "furniture", "storage"],
  [null, "Bookcase", "furniture", "storage"],
  [null, "Möbler", "furniture", null],
  [null, "Bed sheets", "home", "textiles"],
  [null, "Chair cushion", "home", "textiles"],
  [null, "Storage boxes", "home", "storage"],
  [null, "Lamp", "home", "lighting"],
  [null, "Desk lamp", "home", "lighting"],
  [null, "Table runner", "home", "textiles"],
  [null, "Garden chair", "garden", null],
  [null, "Patio table", "garden", null],
  [null, "Camping chair", "outdoors", "camping"],
  [null, "Baby cot", "baby-kids", null],
  [null, "Dog bed", "pets", null],
  [null, "Toy furniture", "toys", null],
  [null, "Köksredskap", "kitchen", "kitchen-accessories"],
] as const;
for (const [path, title, department, subcategory] of cases) {
  test(`department boundary: ${title}`, () => {
    assert.deepEqual(guessDepartment(path, title, "new"), { department, subcategory });
  });
}

test("all department and navigation references are valid and unique", () => {
  assert.equal(departments.length, 24);
  assert.equal(new Set(departments.map(d => d.slug)).size, departments.length);
  assert.equal(new Set(shopCategories.map(c => c.slug)).size, shopCategories.length);
  for (const d of departments) assert.equal(new Set(d.subcategories.map(s => s.slug)).size, d.subcategories.length);
  for (const c of shopCategories) for (const slug of c.departments) assert.ok(departments.some(d => d.slug === slug));
  assert.ok(!departments.find(d => d.slug === "home")!.subcategories.some(s => s.slug === "furniture"));
  assert.deepEqual(shopCategories.find(c => c.slug === "furniture")!.departments, ["furniture"]);
  assert.deepEqual(shopCategories.find(c => c.slug === "home-living")!.departments, ["home"]);
  assert.equal(groupForDepartment("furniture")?.slug, "furniture");
});

test("legacy category aliases preserve comparisons and untouched category decisions", () => {
  assert.deepEqual(catalogCategory("home", "furniture"), { department: "furniture", subcategory: "" });
  assert.deepEqual(catalogCategory("home", "storage"), { department: "home", subcategory: "storage" });
  assert.equal(categoryFilter("home/furniture"), "furniture");
  assert.equal(compareGroup({ department: "home", subcategory: "furniture" }), compareGroup({ department: "furniture", subcategory: "" }));
});

test("legacy links redirect permanently to Furniture without losing pagination or search filters", () => {
  assert.equal(legacyDepartmentRedirect("home", { sub: "furniture", page: "2" }), "/departments/furniture?page=2");
  assert.equal(legacyDepartmentRedirect("home", { sub: "storage" }), null);
  assert.equal(legacyDepartmentRedirect("furniture", {}), null);
  const target = legacySearchRedirect({ dept: "home/furniture", q: "wood chair", cond: "new", min: "10", page: "3" })!;
  const parsed = new URL(target, "https://example.invalid");
  assert.equal(parsed.searchParams.get("dept"), "furniture");
  assert.equal(parsed.searchParams.get("q"), "wood chair");
  assert.equal(parsed.searchParams.get("cond"), "new");
  assert.equal(parsed.searchParams.get("min"), "10");
  assert.equal(parsed.searchParams.get("page"), "3");
});

test("existing sample furniture moves without changing product, offer or SEO identities", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/dummyjson-products.json", import.meta.url), "utf8")) as { products: DummyProduct[] };
  const furniture = fixture.products.filter(p => p.category === "furniture");
  assert.equal(furniture.length, 5);
  for (const raw of furniture) {
    const mapped = mapDummyProduct(raw, "2026-10-28T00:00:00Z").product;
    assert.equal(mapped.department, "furniture");
    assert.equal(mapped.subcategory, "sofas");
    assert.equal(mapped.id, `dj-${raw.id}`);
    assert.ok(mapped.slug.endsWith(`-dj${raw.id}`));
    assert.equal(mapped.offers[0]!.id, `dj-${raw.id}-list`);
    assert.equal(mapped.sourceCategory, "furniture");
  }
});

test("SEO exposes canonical populated landings, not retired or empty departments", () => {
  const paths = catalogSitemapPaths({ furniture: 5, home: 3 });
  assert.ok(paths.includes("/departments/furniture"));
  assert.ok(!paths.includes("/shop/furniture"));
  assert.equal(shopCategoryHref("furniture"), "/departments/furniture");
  assert.equal(paths.filter(p => p === "/departments/furniture").length, 1);
  assert.ok(paths.includes("/shop/home-living"));
  assert.ok(!paths.some(p => p.includes("sub=furniture") || p.includes("/phones")));
  assert.deepEqual(catalogSitemapPaths({}), []);
});

test("the new navigation entry is translated in every supported locale", () => {
  for (const locale of ["en", "sv", "de", "th"] as const) {
    const t = makeT(locale);
    assert.notEqual(categoryLabel(t, "furniture", "FALLBACK"), "FALLBACK");
    assert.notEqual(t("catBlurb.furniture"), "catBlurb.furniture");
  }
});

test("shared storage slugs do not mix furniture with home organizers in related products", async () => {
  const home = await demoRepository.shelf({ department: "home", limit: 20 });
  const storage = home.find(p => p.subcategory === "storage")!;
  assert.ok(storage);
  const furniture = { ...storage, id: "TEST furniture", model: "TEST wardrobe", department: "furniture" };
  assert.deepEqual(await demoRepository.related(furniture, 4), []);
  assert.notEqual(compareGroup(furniture), compareGroup(storage));
});
