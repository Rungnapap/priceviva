import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLandedCost, rankOffers } from "../src/lib/pricing";
import { convertMinor, discountPercent, type FxTable } from "../src/lib/money";
import type { Offer } from "../src/lib/types";
import { offers, offersFor, products } from "../src/data/catalog";
import { fxSnapshot } from "../src/data/fx";

const fx: FxTable = { base: "EUR", rates: { ...fxSnapshot.rates, EUR: 1, SEK: 11.2, GBP: 0.86, USD: 1.08 }, asOf: "test", label: "test" };

function offer(partial: Partial<Offer>): Offer {
  return {
    id: "o",
    productId: "p",
    retailerId: "r",
    price: { minor: 10000, currency: "EUR" },
    vatIncluded: true,
    shipFrom: "DE",
    stock: "in_stock",
    destinations: {},
    observedDaysAgo: 0,
    sourceUrl: null,
    source: "demo",
    ...partial,
  };
}

test("verified zero-cost shipping is a real zero and yields verified_total", () => {
  const o = offer({ destinations: { DE: { shipping: { amountMinor: 0, basis: "verified" }, importCharges: { amountMinor: 0, basis: "verified" } } } });
  const l = computeLandedCost(o, "DE");
  assert.equal(l.status, "verified_total");
  assert.equal(l.totalMinor, 10000);
});

test("unknown shipping is never treated as zero", () => {
  const o = offer({ destinations: { SE: { shipping: { amountMinor: null, basis: "unknown" }, importCharges: { amountMinor: 0, basis: "verified" } } } });
  const l = computeLandedCost(o, "SE");
  assert.equal(l.status, "partial_total");
  assert.equal(l.totalMinor, null);
  assert.deepEqual(l.unknownParts, ["shipping"]);
});

test("all delivery costs unknown => item_price_only", () => {
  const o = offer({ destinations: { SE: { shipping: { amountMinor: null, basis: "unknown" }, importCharges: { amountMinor: null, basis: "unknown" } } } });
  assert.equal(computeLandedCost(o, "SE").status, "item_price_only");
});

test("estimated component => estimated_total", () => {
  const o = offer({ destinations: { GB: { shipping: { amountMinor: 500, basis: "verified" }, importCharges: { amountMinor: 2000, basis: "estimated" } } } });
  const l = computeLandedCost(o, "GB");
  assert.equal(l.status, "estimated_total");
  assert.equal(l.totalMinor, 12500);
});

test("no delivery to destination or out of stock => unavailable", () => {
  assert.equal(computeLandedCost(offer({}), "GB").status, "unavailable");
  const oos = offer({ stock: "out_of_stock", destinations: { DE: { shipping: { amountMinor: 0, basis: "verified" }, importCharges: { amountMinor: 0, basis: "verified" } } } });
  assert.equal(computeLandedCost(oos, "DE").status, "unavailable");
});

test("seller VAT removed on export is not double-counted", () => {
  // €119 incl. 19% DE VAT => €100 net
  const o = offer({
    price: { minor: 11900, currency: "EUR" },
    destinations: { GB: { shipping: { amountMinor: 0, basis: "verified" }, importCharges: { amountMinor: 2000, basis: "verified" }, sellerVatRemoved: true } },
  });
  const l = computeLandedCost(o, "GB");
  assert.equal(l.itemMinor, 10000);
  assert.equal(l.sellerVatRemovedMinor, 1900);
  assert.equal(l.totalMinor, 12000);
});

test("FX conversion and rounding", () => {
  assert.equal(convertMinor(10000, "EUR", "SEK", fx), 112000);
  assert.equal(convertMinor(112000, "SEK", "EUR", fx), 10000);
  assert.equal(convertMinor(1, "SEK", "EUR", fx), 0); // 0.089 cent rounds to 0
  assert.equal(convertMinor(999, "GBP", "SEK", fx), Math.round((999 / 0.86) * 11.2));
  assert.equal(convertMinor(500, "GBP", "GBP", fx), 500);
});

test("discount only when reference is higher and same currency", () => {
  assert.equal(discountPercent({ minor: 80, currency: "EUR" }, { minor: 100, currency: "EUR" }), 20);
  assert.equal(discountPercent({ minor: 100, currency: "EUR" }, { minor: 100, currency: "EUR" }), null);
  assert.equal(discountPercent({ minor: 80, currency: "EUR" }, { minor: 1000, currency: "SEK" }), null);
  assert.equal(discountPercent({ minor: 80, currency: "EUR" }, undefined), null);
});

test("ranking never puts a partial total ahead as the definitive best", () => {
  const cheapPartial = offer({ id: "partial", price: { minor: 1000, currency: "EUR" },
    destinations: { SE: { shipping: { amountMinor: null, basis: "unknown" }, importCharges: { amountMinor: 0, basis: "verified" } } } });
  const verified = offer({ id: "verified", price: { minor: 5000, currency: "EUR" },
    destinations: { SE: { shipping: { amountMinor: 0, basis: "verified" }, importCharges: { amountMinor: 0, basis: "verified" } } } });
  const r = rankOffers([cheapPartial, verified], "SE", "EUR", fx);
  assert.equal(r.best?.offer.id, "verified");
  assert.equal(r.bestIsUncertain, true);
  assert.equal(r.offers[0]?.offer.id, "verified");
});

test("stale offers are never the current best", () => {
  const stale = offer({ id: "stale", price: { minor: 100, currency: "EUR" }, observedDaysAgo: 30,
    destinations: { DE: { shipping: { amountMinor: 0, basis: "verified" }, importCharges: { amountMinor: 0, basis: "verified" } } } });
  const fresh = offer({ id: "fresh", price: { minor: 9000, currency: "EUR" },
    destinations: { DE: { shipping: { amountMinor: 0, basis: "verified" }, importCharges: { amountMinor: 0, basis: "verified" } } } });
  const r = rankOffers([stale, fresh], "DE", "EUR", fx);
  assert.equal(r.best?.offer.id, "fresh");
});

test("demo catalog integrity: 20–50 products, all labeled demo, valid GTINs, every offer has a known product", () => {
  assert.ok(products.length >= 20 && products.length <= 50);
  assert.ok(products.every((p) => p.source === "demo"));
  assert.ok(offers.every((o) => o.source === "demo" && o.sourceUrl === null));
  assert.equal(new Set(products.map((p) => p.gtin)).size, products.length);
  assert.equal(new Set(products.map((p) => p.slug)).size, products.length);
  for (const p of products) {
    assert.match(p.gtin, /^2\d{12}$/);
    const digits = p.gtin.split("").map(Number);
    const sum = digits.slice(0, 12).reduce((s, d, i) => s + d * (i % 2 === 0 ? 1 : 3), 0);
    assert.equal((10 - (sum % 10)) % 10, digits[12]);
  }
  for (const o of offers) assert.ok(products.some((p) => p.id === o.productId));
});

test("variants of the same model are separate products with separate offers", () => {
  const variants = products.filter((p) => p.model === "NV-N7");
  assert.ok(variants.length >= 3);
  assert.equal(new Set(variants.map((p) => `${p.variant}|${p.condition}`)).size, variants.length);
  for (const v of variants) assert.ok(offersFor(v.id).every((o) => o.productId === v.id));
});

test("every demo product can be priced for every destination without throwing", () => {
  for (const p of products) for (const d of ["SE", "DE", "GB"] as const) rankOffers(offersFor(p.id), d, "SEK", fxSnapshot);
});
