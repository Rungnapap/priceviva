import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/lib/importers/csv";
import { normalizeCondition, normalizeGtin, normalizeStock, parsePriceMinor } from "../src/lib/importers/normalize";
import { checkAwinHeader, isPermittedAwinLink, mapAwinRow } from "../src/lib/importers/awin/map-row";
import { fromUrlTemplate, parseFeedList, toUrlTemplate } from "../src/lib/importers/awin/feed-list";
import { parseEcbXml } from "../src/lib/importers/fx-ecb";
import { guessDepartment } from "../src/lib/importers/categories";
import { redact } from "../src/lib/server/env";

const collect = async (chunks: string[]) => {
  const out: string[][] = [];
  for await (const r of parseCsv(chunks)) out.push(r);
  return out;
};

test("CSV: quotes, escaped quotes, embedded newlines, CRLF, BOM, chunk boundaries", async () => {
  const text = '﻿a,b,c\r\n1,"x, ""y""",z\r\n2,"multi\nline",\r\n';
  const whole = await collect([text]);
  const split = await collect(text.split("")); // one character per chunk
  assert.deepEqual(whole, [["a", "b", "c"], ["1", 'x, "y"', "z"], ["2", "multi\nline", ""]]);
  assert.deepEqual(split, whole);
});

test("CSV: truncated quoted field is an error, not silent data", async () => {
  await assert.rejects(collect(['a,b\n1,"unterminated']), /inside a quoted field/);
});

test("GTIN validation", () => {
  assert.equal(normalizeGtin("2000000000015"), "02000000000015");
  assert.equal(normalizeGtin("2000000000016"), null); // bad check digit
  assert.equal(normalizeGtin("012345678905"), "00012345678905"); // UPC-A
  assert.equal(normalizeGtin("0000000000000"), null);
  assert.equal(normalizeGtin("abc"), null);
});

test("price parsing never guesses", () => {
  assert.deepEqual(parsePriceMinor("99.99"), { minor: 9999, currency: null });
  assert.deepEqual(parsePriceMinor("1,299.00"), { minor: 129900, currency: null });
  assert.deepEqual(parsePriceMinor("1 299,50"), { minor: 129950, currency: null });
  assert.deepEqual(parsePriceMinor("15.00 GBP"), { minor: 1500, currency: "GBP" });
  assert.equal(parsePriceMinor(""), null);
  assert.equal(parsePriceMinor("call us"), null);
  assert.equal(parsePriceMinor("1.2.3"), null);
});

test("condition and stock normalisation", () => {
  assert.equal(normalizeCondition(""), "new");
  assert.equal(normalizeCondition("Refurbished - Excellent"), "refurbished");
  assert.equal(normalizeCondition("pre-owned"), "used");
  assert.equal(normalizeCondition("mystery"), "invalid");
  assert.equal(normalizeStock("1"), "in_stock");
  assert.equal(normalizeStock("0"), "out_of_stock");
  assert.equal(normalizeStock(undefined, "out_ouf_stock"), "out_of_stock");
  assert.equal(normalizeStock(undefined, undefined), "unknown");
});

test("only https Awin tracking links are permitted", () => {
  assert.ok(isPermittedAwinLink("https://www.awin1.com/pclick.php?p=1"));
  assert.ok(!isPermittedAwinLink("http://www.awin1.com/pclick.php?p=1"));
  assert.ok(!isPermittedAwinLink("https://www.awin1.com.evil.test/x"));
  assert.ok(!isPermittedAwinLink("javascript:alert(1)"));
});

const ctx = { feedId: "f", source: "awin" as const, country: "GB", currency: "GBP", vatIncluded: true, retailer: { external_id: "1", name: "R", country: "GB" } };

test("Enhanced (Google-format) row mapping incl. price-with-currency and shipping string", () => {
  const header = ["id", "title", "price", "sale_price", "aw_deep_link", "image_link", "additional_image_link", "gtin", "brand", "shipping", "availability", "condition", "color", "size"];
  assert.equal(checkAwinHeader(header).scheme, "enhanced");
  const { row, issues } = mapAwinRow(
    { id: "SKU1", title: "Thing", price: "20.00 GBP", sale_price: "15.00 GBP", aw_deep_link: "https://www.awin1.com/pclick.php?p=9", image_link: "https://img.test.invalid/1.jpg",
      additional_image_link: "https://img.test.invalid/2.jpg,http://img.test.invalid/3.jpg", gtin: "2000000000022", brand: "B", shipping: "SE:::49.00 SEK,GB:::3.95 GBP", availability: "in_stock", condition: "new", color: "Red", size: "M" },
    1,
    ctx,
  );
  assert.equal(issues.length, 0);
  assert.equal(row?.price_minor, 1500);
  assert.equal(row?.rrp_minor, 2000);
  assert.equal(row?.home_shipping_minor, 395);
  assert.deepEqual(row?.images, ["https://img.test.invalid/1.jpg", "https://img.test.invalid/2.jpg"]);
  assert.equal(row?.variant_label, "Red · M");
});

test("currency mismatch rejects the row instead of mislabelling the price", () => {
  const { row, issues } = mapAwinRow({ merchant_product_id: "1", product_name: "X", search_price: "10", currency: "USD", aw_deep_link: "https://www.awin1.com/pclick.php?p=1" }, 1, ctx);
  assert.equal(row, undefined);
  assert.equal(issues[0]?.code, "currency_mismatch");
});

test("feed validation: implausible prices rejected; future/old/unreadable timestamps flagged, never trusted", () => {
  const base = { merchant_product_id: "1", product_name: "X", currency: "GBP", aw_deep_link: "https://www.awin1.com/pclick.php?p=1" };
  assert.equal(mapAwinRow({ ...base, search_price: "999999999999" }, 1, ctx).issues[0]?.code, "implausible_price");
  const future = mapAwinRow({ ...base, search_price: "10", last_updated: "2099-01-01 00:00:00" }, 2, ctx);
  assert.ok(future.issues.some((i) => i.code === "future_timestamp"));
  assert.equal(future.row?.source_updated_at, null, "a future date is not stored as freshness");
  const old = mapAwinRow({ ...base, search_price: "10", last_updated: "2020-01-01 00:00:00" }, 3, ctx);
  assert.ok(old.issues.some((i) => i.code === "old_timestamp"));
  const junk = mapAwinRow({ ...base, search_price: "10", last_updated: "yesterday-ish" }, 4, ctx);
  assert.ok(junk.issues.some((i) => i.code === "invalid_timestamp"));
});

test("feed list parsing and API-key stripping", async () => {
  const csv = [
    "Advertiser ID,Advertiser Name,Primary Region,Membership Status,Feed ID,Feed Name,Language,Vertical,Last Imported,Last Checked,No of products,URL",
    "123,Some Shop,UK,active,456,Default,en,,2026-10-23 04:00:00,2026-10-23 05:00:00,100,https://productdata.awin.com/datafeed/download/apikey/SECRETKEY123/language/en/fid/456/columns/aw_deep_link,product_name/format/csv/delimiter/%2C/compression/gzip/",
  ].join("\n");
  const feeds = [];
  for await (const f of parseFeedList([csv])) feeds.push(f);
  assert.equal(feeds.length, 1);
  assert.equal(feeds[0]!.country, "GB");
  assert.equal(feeds[0]!.currency, "GBP");
  assert.ok(!feeds[0]!.download_url_template!.includes("SECRETKEY123"));
  assert.ok(feeds[0]!.download_url_template!.includes("/apikey/{API_KEY}/"));
  assert.ok(fromUrlTemplate(feeds[0]!.download_url_template!, "K").includes("/apikey/K/"));
  assert.equal(toUrlTemplate("https://evil.test.invalid/apikey/x/"), null);
  assert.throws(() => fromUrlTemplate("https://evil.test.invalid/apikey/{API_KEY}/", "K"));
});

test("ECB XML parsing", () => {
  const xml = `<gesmes:Envelope><Cube><Cube time='2026-10-23'><Cube currency='GBP' rate='0.8712'/><Cube currency='SEK' rate='11.0425'/></Cube></Cube></gesmes:Envelope>`;
  const r = parseEcbXml(xml);
  assert.equal(r.asOf, "2026-10-23");
  assert.deepEqual(r.rates, [{ quote: "GBP", rate: 0.8712 }, { quote: "SEK", rate: 11.0425 }]);
});

test("department guesses", () => {
  assert.deepEqual(guessDepartment("Electronics > Audio > Headphones", "X", "new"), { department: "electronics", subcategory: "headphones" });
  assert.deepEqual(guessDepartment("Food > Coffee Beans", "Beans", "new"), { department: "groceries", subcategory: "drinks" });
  assert.deepEqual(guessDepartment(null, "Mystery object", "new"), { department: null, subcategory: null });
  assert.equal(guessDepartment("Phones", "Phone", "refurbished").department, "refurbished");
});
test("Swedish and Dutch clothing categories are classified correctly", () => {
  const cases = [
    ["Ullstrumpor", "fashion"],
    ["Merinoullsockor", "fashion"],
    ["Sneakersockor", "fashion"],
    ["Husstrumpor", "fashion"],
    ["Diabetes sokken", "fashion"],
    ["Trosa", "fashion"],
    ["Damunderkläder", "fashion"],
    ["Boxer shorts", "fashion"],
    ["Damleggings", "fashion"],
    ["Barntights", "baby-kids"],
    ["Barnleggings", "baby-kids"],
    ["Babystrumpor", "baby-kids"],
    ["Barnstrumpbyxor", "baby-kids"],
    ["Fotboll", "sports"],
  ] as const;

  for (const [category, expectedDepartment] of cases) {
    const result = guessDepartment(category, null, "new");
    assert.equal(
      result.department,
      expectedDepartment,
      `${category} should be ${expectedDepartment}`
    );
  }
});
test("Swedish socks are classified as Fashion", () => {
  assert.deepEqual(
    guessDepartment("Sneakersockor", "Sneaker socks", "new"),
    { department: "fashion", subcategory: null }
  );

  assert.deepEqual(
    guessDepartment("Herrstrumpor", "Men's socks", "new"),
    { department: "fashion", subcategory: null }
  );

  assert.deepEqual(
    guessDepartment("Bambustrumpor", "Bamboo socks", "new"),
    { department: "fashion", subcategory: null }
  );
});
test("redaction removes API keys from messages", () => {
  assert.equal(redact("GET https://productdata.awin.com/datafeed/download/apikey/abc123/fid/1"), "GET https://productdata.awin.com/datafeed/download/apikey/[redacted]/fid/1");
});
