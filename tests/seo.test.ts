import { test } from "node:test";
import assert from "node:assert/strict";
import { indexingAllowed, siteUrl } from "../src/lib/server/seo";
import { jsonLdScript, productDescription, productJsonLd, productTitle } from "../src/lib/product-seo";
import type { CatalogOffer, CatalogProduct } from "../src/lib/types";

test("search indexing needs both the owner's switch and live data", () => {
  assert.equal(indexingAllowed({}, "live"), false);
  assert.equal(indexingAllowed({ ALLOW_INDEXING: "true" }, "sample"), false);
  assert.equal(indexingAllowed({ ALLOW_INDEXING: "true" }, "demo"), false);
  assert.equal(indexingAllowed({ ALLOW_INDEXING: "1" }, "live"), false);
  assert.equal(indexingAllowed({ ALLOW_INDEXING: "true" }, "live"), true);
});

test("site address: explicit setting, then Vercel's production domain, never localhost on Vercel", () => {
  assert.equal(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://www.priceviva.com/" }), "https://www.priceviva.com");
  assert.equal(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "www.priceviva.com" }), "https://www.priceviva.com");
  assert.equal(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://priceviva.com", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }), "https://priceviva.com");
  assert.equal(siteUrl({}), "http://localhost:3000");
  // .env.local's localhost value copied into Vercel is ignored there
  assert.equal(siteUrl({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000", VERCEL_PROJECT_PRODUCTION_URL: "www.priceviva.com" }), "https://www.priceviva.com");
  assert.equal(siteUrl({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }), "http://localhost:3000");
});

const offer = (id: string, shop: string, minor: number, extra: Partial<CatalogOffer> = {}) =>
  ({ id, retailer: { id: shop, name: `Shop ${shop}`, country: "SE" }, price: { minor, currency: "SEK" }, stock: "in_stock", ...extra }) as CatalogOffer;
const product = (extra: Partial<CatalogProduct> = {}) =>
  ({
    id: "p1", slug: "comfort-tygbalsam", name: "Comfort Tygbalsam Sunshiny Days - 990 ml", brandName: "Comfort", variant: "", model: "",
    gtin: "08720181287476", condition: "new", description: "Shop text <script>", source: "awin",
    images: [{ url: "https://img.example/1.jpg", alt: "x" }, { url: "http://insecure.example/2.jpg", alt: "y" }],
    offers: [offer("o1", "a", 4895)], ...extra,
  }) as unknown as CatalogProduct;

test("product title names the brand once", () => {
  assert.equal(productTitle(product()), "Comfort Tygbalsam Sunshiny Days - 990 ml");
  assert.equal(productTitle(product({ name: "Tygbalsam" })), "Comfort Tygbalsam");
  assert.equal(productTitle(product({ name: "Strumpor", brandName: "", variant: "Svart · 39-42" })), "Strumpor (Svart · 39-42)");
});

test("product description is built from real offers", () => {
  assert.match(productDescription(product()), /1 offer from Shop a, SEK 48\.95/);
  const two = product({ offers: [offer("o1", "a", 5900), offer("o2", "b", 4895)] });
  assert.match(productDescription(two), /2 offers from 2 shops, from SEK 48\.95 \(Shop b\)/);
});

test("product structured data: real offers only, no ratings, nothing for demo or test data", () => {
  const ld = productJsonLd(product(), "https://www.priceviva.com/product/comfort-tygbalsam")!;
  assert.equal(ld["@type"], "Product");
  assert.deepEqual(ld.image, ["https://img.example/1.jpg"]);
  assert.equal(ld.gtin, "8720181287476");
  assert.deepEqual(ld.offers, {
    "@type": "Offer", price: "48.95", priceCurrency: "SEK", availability: "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition", seller: { "@type": "Organization", name: "Shop a" }, url: "https://www.priceviva.com/product/comfort-tygbalsam",
  });
  assert.equal("aggregateRating" in ld || "review" in ld, false);

  const many = productJsonLd(product({ offers: [offer("o1", "a", 5900), offer("o2", "b", 4895, { stock: "unknown" })] }), "u")!;
  const agg = many.offers as Record<string, unknown>;
  assert.equal(agg["@type"], "AggregateOffer");
  assert.equal(agg.lowPrice, "48.95");
  assert.equal(agg.highPrice, "59.00");
  assert.equal(agg.offerCount, 2);
  assert.equal("availability" in (agg.offers as Record<string, unknown>[])[1]!, false, "unknown stock is left out, not guessed");

  assert.equal(productJsonLd(product({ source: "demo" }), "u"), null);
  assert.equal(productJsonLd(product({ source: "sample" }), "u"), null);
  assert.equal(productJsonLd(product({ offers: [offer("o1", "a", 100, { informational: true })] }), "u"), null);
});

test("structured data cannot break out of its script tag", () => {
  assert.equal(jsonLdScript({ description: "</script><script>alert(1)</script>" }).includes("<"), false);
});
