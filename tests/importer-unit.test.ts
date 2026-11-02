import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/lib/importers/csv";
import { normalizeCondition, normalizeGtin, normalizeStock, parsePriceMinor } from "../src/lib/importers/normalize";
import { checkAwinHeader, isPermittedAwinLink, mapAwinRow } from "../src/lib/importers/awin/map-row";
import { fromUrlTemplate, parseFeedList, toUrlTemplate } from "../src/lib/importers/awin/feed-list";
import { parseEcbXml } from "../src/lib/importers/fx-ecb";
import { guessDepartment, isAdultProduct } from "../src/lib/importers/categories";
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
  assert.deepEqual(guessDepartment({ path: "Electronics > Audio > Headphones", title: "X" }), { department: "electronics", subcategory: "headphones" });
  assert.deepEqual(guessDepartment({ path: "Food > Coffee Beans", title: "Beans" }), { department: "groceries", subcategory: "drinks" });
  assert.deepEqual(guessDepartment({ title: "Mystery object" }), { department: null, subcategory: null });
  assert.equal(guessDepartment({ path: "Phones", title: "Phone", condition: "refurbished" }).department, "refurbished");
});

// Real category paths from the live Awin feeds (Nov 2026) that were misfiled by the old English keyword rules.
test("Swedish category paths go to the right department", () => {
  const cases: [string, string, string | null][] = [
    // "tv" used to match "tvätt"/"tvål" because \b treats ä as a word break
    ["Kök & hem > Hushåll > Rengör, stryk & torka > Klädtvätt > Tvättmedel > SUMMER DEALS", "groceries", "cleaning"],
    ["Man > Kvinna > Personlig vård > Personlig vård > Parfymer & dofter > Eau de parfum > Arabiska Parfymer", "beauty", "fragrances"],
    ["Kvinna > Personlig vård > Hårstyling > Hårborstar >", "beauty", null],
    ["Man > Kvinna > Personlig vård > Personlig vård > Tandvård > Tandvård > Tandkräm > Tandkräm >", "health", null],
    ["Barn > Baby- & barnprodukter > Aktivitet & lek > Leksaker > Figurer & actionhjältar > Djur & tillbehör >", "toys", null],
    // a dog toy is a pet product, not a toy
    ["Kök & hem > Hushåll > Husdjurstillbehör > Leksak", "pets", null],
    ["Kök & hem > Hushåll > Husdjurstillbehör > Resa", "pets", null],
    // "Auto & cykel" is a shared car-and-bike section
    ["Kök & hem > Hushåll > Auto & cykel > Rengöring > Auto >", "automotive", null],
    ["Kök & hem > Hushåll > Auto & cykel > Cykel >", "outdoors", "cycling"],
    // watches are filed under "Klockor & Smartwatches"; doorbells are "Dörrklockor"
    ["Man > Accessoarer > Analoga klockor > Klockor > Klockor & Smartwatches >", "jewelry-watches", "watches"],
    ["Kök & hem > Hushåll > Hem säkerhet > Dörrklockor >", "electronics", "smart-home"],
    // "flaskor" (bottles) contains "skor" (shoes)
    ["Man > Kvinna > Sport & fritid > Sport & fritid > Träningsutrustning > Sportflaskor", "sports", "fitness"],
    ["Elektronik > Mobil & surfplatta tillbehör > Skal, skärmskydd & hållare > Mobilskal > iPhone 13/13 Pro Max >", "phones", "cases"],
    ["Elektronik > Spelkonsol > Playstation > Tillbehör", "computers-gaming", "gaming"],
    ["Kök & hem > Kök > Knivar, skärbrädor & tillbehör > Knivar > Köksredskap >", "kitchen", "kitchen-accessories"],
    ["Kök & hem > Hushåll > Jul > Julbelysning", "home", "lighting"],
    ["Kök & hem > Hushåll > Verktyg & trädgårdsredskap > Verktyg & hobby > Handverktyg >", "diy-tools", null],
    ["Kök & hem > Hushåll > Verktyg & trädgårdsredskap > Trädgård redskap >", "garden", null],
  ];
  for (const [path, department, subcategory] of cases) {
    assert.deepEqual(guessDepartment({ path, title: "x" }), { department, subcategory }, path);
  }
});

test("Awin categories and product types are used when the shop path says nothing", () => {
  // Strumpor-online: the shop category is a campaign, Awin's own category is reliable.
  assert.deepEqual(guessDepartment({ categoryName: "Men's Socks", merchantCategory: "Sista storlekarna", title: "Enfärgade strumpor" }), { department: "fashion", subcategory: "mens" });
  assert.deepEqual(guessDepartment({ categoryName: "Children's Clothing", merchantCategory: "Barn", title: "Barnstrumpbyxor" }), { department: "baby-kids", subcategory: null });
  // Children's socks filed as "Men's Socks" by the shop
  assert.equal(guessDepartment({ categoryName: "Men's Socks", title: "Halkfria bomullsstrumpor för barn - 23-26" }).department, "baby-kids");
  // Deluxehomeartshop: only a product type
  assert.deepEqual(guessDepartment({ productType: "LED Blockljus", title: "LED Blockljus Ø 7,5 x 15 cm" }), { department: "home", subcategory: "lighting" });
  assert.deepEqual(guessDepartment({ productType: "LED Kegelljus", title: "Cone Light" }), { department: "home", subcategory: "lighting" });
});

test("product names are used only when a row has no category data", () => {
  // Brand and colour words in names must not decide the category when the shop gave one.
  assert.equal(guessDepartment({ path: "Kvinna > Personlig vård > Hårstyling > Hårborstar", title: "Olivia Garden NanoThermic Rundborste" }).department, "beauty");
  assert.equal(guessDepartment({ path: "Kvinna > Personlig vård > Parfym & dofter > Deodorant", title: "Elizabeth Arden Green Tea Deodorant" }).department, "beauty");
  assert.deepEqual(guessDepartment({ path: "Kök & hem > Hushåll > Annat", title: "Garden hose" }), { department: null, subcategory: null });
  // No category data at all: the name is all there is.
  assert.equal(guessDepartment({ title: "Barnstrumpbyxor i bomull" }).department, "baby-kids");
});

test("adult products are recognised (they are not imported)", () => {
  assert.equal(isAdultProduct({ path: "Kvinna > Personlig vård > Intim > Vuxen leksaker till kvinnor > Stimulans >", title: "Bullet" }), true);
  assert.equal(isAdultProduct({ path: "Man > Personlig vård > Intim > Vuxenleksaker för män > SUMMER DEALS >", title: "x" }), true);
  assert.equal(isAdultProduct({ path: "Man > Kvinna > Personlig vård > Personlig vård > Intim > Kräm, gel & olja > Intim > Glidmedel, gel & olja", title: "x" }), true);
  assert.equal(isAdultProduct({ title: "Durex Fetherlite Tunna Kondomer - 3 st" }), true);
  // Not adult: bikini trimmers, intimate-hygiene soap, toy handcuffs
  assert.equal(isAdultProduct({ path: "Kvinna > Personlig vård > Rakning & hårborttagning > Intim > Rakhyvlar >", title: "LadyShape Bikiniformningsverktyg" }), false);
  assert.equal(isAdultProduct({ path: "Kvinna > Personlig vård > Hygien > Bodyshampoo & shower gel > Intim tvål & cleanser >", title: "Sebamed Intim Tvål" }), false);
  assert.equal(isAdultProduct({ path: "Barn > Baby- & barnprodukter > Aktivitet & lek > Leksaker > Leksaksvapen >", title: "Wicke Western Sheriff Handbojor" }), false);
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
    const result = guessDepartment({ merchantCategory: category });
    assert.equal(
      result.department,
      expectedDepartment,
      `${category} should be ${expectedDepartment}`
    );
  }
});
test("Swedish socks are classified as Fashion", () => {
  assert.deepEqual(
    guessDepartment({ merchantCategory: "Sneakersockor", title: "Sneaker socks" }),
    { department: "fashion", subcategory: null }
  );

  assert.deepEqual(
    guessDepartment({ merchantCategory: "Herrstrumpor", title: "Men's socks" }),
    { department: "fashion", subcategory: null }
  );

  assert.deepEqual(
    guessDepartment({ merchantCategory: "Bambustrumpor", title: "Bamboo socks" }),
    { department: "fashion", subcategory: null }
  );
});
test("redaction removes API keys from messages", () => {
  assert.equal(redact("GET https://productdata.awin.com/datafeed/download/apikey/abc123/fid/1"), "GET https://productdata.awin.com/datafeed/download/apikey/[redacted]/fid/1");
});
