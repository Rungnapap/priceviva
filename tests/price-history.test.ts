import assert from "node:assert/strict";
import { test } from "node:test";
import { recordObservations, summarizeHistory, type PriceObservation } from "../src/lib/price-history";
import type { CatalogProduct } from "../src/lib/types";

const product = (price: number, informational = false): CatalogProduct =>
  ({
    id: "dj-1",
    offers: [
      { id: "dj-1-sample-nord", price: { minor: price, currency: "SEK" }, shipFrom: "SE", destinations: { SE: { shipping: { amountMinor: 0, basis: "verified" }, importCharges: { amountMinor: 0, basis: "verified" } } }, retailer: { id: "nord", name: "Sample Shop Nord", country: "SE" } },
      { id: "dj-1-list", price: { minor: 999, currency: "USD" }, shipFrom: null, destinations: {}, informational: true, retailer: { id: "dj", name: "list", country: null } },
    ].filter((o) => !informational || !("informational" in o)),
  }) as unknown as CatalogProduct;

test("history: records real prices only (never reference list prices), with time, shop, currency and source", () => {
  const t0 = new Date("2026-10-20T10:00:00Z");
  const rows = recordObservations([], [product(10900)], t0, "sample");
  assert.equal(rows.length, 1);
  assert.deepEqual(
    { ...rows[0] },
    { productId: "dj-1", offerId: "dj-1-sample-nord", retailer: "Sample Shop Nord", retailerCountry: "SE", observedAt: t0.toISOString(), priceMinor: 10900, currency: "SEK", shippingMinor: 0, source: "sample" },
  );
});

test("history: unchanged prices are not re-recorded within 20 h; changes and daily checks are", () => {
  const t0 = new Date("2026-10-20T10:00:00Z");
  let rows: PriceObservation[] = recordObservations([], [product(10900)], t0, "sample");
  const same = recordObservations(rows, [product(10900)], new Date(t0.getTime() + 2 * 3_600_000), "sample");
  assert.equal(same, rows, "returns the same array when nothing new was observed");
  rows = recordObservations(rows, [product(9900)], new Date(t0.getTime() + 3 * 3_600_000), "sample");
  rows = recordObservations(rows, [product(9900)], new Date(t0.getTime() + 30 * 3_600_000), "sample");
  assert.deepEqual(rows.map((r) => r.priceMinor), [10900, 9900, 9900]);
});

test("history summary: one observation is 'insufficient'; two an hour apart can be charted; ranges reflect real data", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const one = recordObservations([], [product(10900)], new Date("2026-10-25T10:00:00Z"), "sample");
  assert.equal(summarizeHistory(one, "all", now).sufficient, false);
  const two = recordObservations(one, [product(9900)], new Date("2026-10-25T11:30:00Z"), "sample");
  const s = summarizeHistory(two, "all", now);
  assert.equal(s.sufficient, true);
  assert.equal(s.series.length, 1);
  assert.deepEqual(s.series[0]!.points.map((p) => p.priceMinor), [10900, 9900]);
  assert.ok(s.ranges.includes("30d") && s.ranges.includes("all"));
  assert.equal(summarizeHistory([], "all", now).observationCount, 0);
});
