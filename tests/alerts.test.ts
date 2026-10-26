import assert from "node:assert/strict";
import { test } from "node:test";
import { fxSnapshot } from "../src/data/fx";
import { evaluateAlert, parseAmountToMinor, type PriceAlert } from "../src/lib/alerts";
import type { CatalogProduct } from "../src/lib/types";

const offer = (id: string, sek: number, shipping: number | null, source = "awin") => ({
  id,
  productId: "p1",
  retailerId: id,
  retailer: { id, name: `Shop ${id}`, country: "SE" },
  price: { minor: sek, currency: "SEK" },
  vatIncluded: true,
  shipFrom: "SE",
  stock: "in_stock",
  observedDaysAgo: 0,
  sourceUrl: null,
  clickable: false,
  source,
  destinations: { SE: { shipping: shipping === null ? { amountMinor: null, basis: "unknown" } : { amountMinor: shipping, basis: "verified" }, importCharges: { amountMinor: 0, basis: "verified" } } },
});
const product = (offers: unknown[]) => ({ id: "p1", slug: "p1", name: "Thing", brandName: "Brand", offers, condition: "new" }) as unknown as CatalogProduct;
const alert: PriceAlert = {
  id: "a1", productId: "p1", productName: "Brand Thing", productSlug: "p1", targetMinor: 100000, currency: "SEK", destination: "SE",
  createdAt: "2026-10-25T00:00:00Z", paused: false, lastNotifiedMinor: null, lastNotifiedAt: null, lastCheckedAt: null, lastBestMinor: null,
};

test("alerts: fire once when the complete delivered total reaches the target, never twice for the same price", () => {
  const p = product([offer("a", 95000, 0)]);
  const first = evaluateAlert(alert, p, fxSnapshot);
  assert.ok(first.notification);
  assert.equal(first.notification!.priceMinor, 95000);
  assert.equal(first.notification!.demo, false);
  const again = evaluateAlert(first.alert, p, fxSnapshot);
  assert.equal(again.notification, null, "no duplicate notification");
  const lower = evaluateAlert(again.alert, product([offer("a", 90000, 0)]), fxSnapshot);
  assert.ok(lower.notification, "a further drop notifies again");
});

test("alerts: unknown shipping never triggers; paused alerts never notify; rising above target re-arms", () => {
  assert.equal(evaluateAlert(alert, product([offer("a", 50000, null)]), fxSnapshot).notification, null);
  assert.equal(evaluateAlert({ ...alert, paused: true }, product([offer("a", 50000, 0)]), fxSnapshot).notification, null);
  const fired = evaluateAlert(alert, product([offer("a", 95000, 0)]), fxSnapshot).alert;
  const above = evaluateAlert(fired, product([offer("a", 120000, 0)]), fxSnapshot).alert;
  assert.equal(above.lastNotifiedMinor, null);
  assert.ok(evaluateAlert(above, product([offer("a", 95000, 0)]), fxSnapshot).notification);
});

test("alerts: demonstration offers are labelled; other currencies are converted", () => {
  assert.equal(evaluateAlert(alert, product([offer("a", 95000, 0, "sample")]), fxSnapshot).notification?.demo, true);
  const eur = evaluateAlert({ ...alert, currency: "EUR", targetMinor: 10000 }, product([offer("a", 100000, 0)]), fxSnapshot);
  assert.equal(eur.bestMinor, Math.round(100000 / 11.2)); // 1000 SEK ≈ 89.29 EUR with the demo table
  assert.ok(eur.notification);
});

test("alerts: target price input parsing", () => {
  assert.equal(parseAmountToMinor("1 290"), 129000);
  assert.equal(parseAmountToMinor("1290,50"), 129050);
  assert.equal(parseAmountToMinor("1,290.5"), 129050);
  assert.equal(parseAmountToMinor("abc"), null);
  assert.equal(parseAmountToMinor("0"), null);
});

test("target price input: accepts common formats, rejects negative, zero and garbled values", () => {
  assert.equal(parseAmountToMinor("1 290"), 129000);
  assert.equal(parseAmountToMinor("1290,50"), 129050);
  assert.equal(parseAmountToMinor("1,290.5"), 129050);
  assert.equal(parseAmountToMinor("SEK 999"), 99900);
  assert.equal(parseAmountToMinor("-50"), null);
  assert.equal(parseAmountToMinor("0"), null);
  assert.equal(parseAmountToMinor("12a3"), null);
  assert.equal(parseAmountToMinor(""), null);
});
