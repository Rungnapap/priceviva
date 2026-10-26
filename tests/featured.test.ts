import assert from "node:assert/strict";
import { test } from "node:test";
import { pickFeatured } from "../src/lib/featured";
import type { CatalogProduct } from "../src/lib/types";

const mk = (id: string, department: string, shops: number, informational = false): CatalogProduct =>
  ({
    id,
    department,
    images: [{ url: "https://x/1.webp", alt: id, source: "sample" }],
    offers: [
      ...Array.from({ length: shops }, (_, i) => ({ retailer: { id: `r${i}`, name: `Shop ${i}`, country: "SE" } })),
      ...(informational ? [{ retailer: { id: "dj", name: "list", country: null }, informational: true }] : []),
    ],
  }) as unknown as CatalogProduct;

test("featured: comparable products first, departments alternate, list prices never count as shops", () => {
  const pool = [
    mk("a1", "beauty", 0, true),
    mk("b1", "beauty", 3),
    mk("b2", "beauty", 2),
    mk("h1", "home", 2),
    mk("e1", "electronics", 1),
    mk("e2", "electronics", 0, true),
  ];
  const ids = pickFeatured(pool, 5).map((p) => p.id);
  assert.deepEqual(ids.slice(0, 3).sort(), ["b1", "b2", "h1"]);
  assert.notEqual(ids[1], "b2", "departments alternate within a tier");
  assert.equal(ids[3], "e1", "single-shop products follow comparable ones");
  assert.equal(ids.length, 5);
});

test("featured: never invents products when the pool is small", () => {
  assert.equal(pickFeatured([mk("x", "home", 0)], 8).length, 1);
  assert.equal(pickFeatured([], 8).length, 0);
});
