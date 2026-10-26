import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, editDistance, paginate, searchProducts, suggestCorrection } from "../src/lib/search";
import { brands, products } from "../src/data/catalog";
import { departments } from "../src/data/departments";
import { cities, promotions, stores } from "../src/data/places";
import { DEFAULT_PREFS, activeArea, locationReducer, nearbyPromotions, nearestCity, promoTiming } from "../src/lib/location";

const index = buildIndex(products, brands, departments);
const names = (q: string, o = {}) => searchProducts(index, q, o).map((h) => h.product.id);

test("search by name, brand and model", () => {
  assert.ok(names("aria").includes("p01"));
  assert.ok(names("kestrel").includes("p03"));
  assert.ok(names("NV-N7").includes("p07"));
});

test("synonyms: television finds TVs, rucksack finds backpack", () => {
  assert.ok(names("television").includes("p05"));
  assert.ok(names("rucksack").includes("p28"));
});

test("typo tolerance", () => {
  assert.ok(names("hedphones").includes("p01"));
  assert.ok(names("espreso machine").includes("p16"));
  assert.equal(editDistance("tent", "tnet"), 1);
});

test("exact GTIN lookup returns only that product", () => {
  const p = products[4]!;
  assert.deepEqual(names(p.gtin), [p.id]);
});

test("no invented results: nonsense query returns nothing", () => {
  assert.deepEqual(names("zzqxwv"), []);
});

test("filters", () => {
  assert.ok(names("phone", { condition: "refurbished" }).every((id) => products.find((p) => p.id === id)?.condition === "refurbished"));
  assert.ok(names("", { department: "outdoors" }).length >= 4);
});

test("did-you-mean suggestion", () => {
  assert.equal(suggestCorrection(index, "keybaord"), "keyboard");
});

test("pagination clamps pages", () => {
  const r = paginate([1, 2, 3, 4, 5], 9, 2);
  assert.equal(r.page, 3);
  assert.deepEqual(r.items, [5]);
});

test("temporary area does not overwrite the saved area", () => {
  let s = locationReducer(DEFAULT_PREFS, { type: "setSavedArea", area: { cityId: "gothenburg", radiusKm: 10 } });
  s = locationReducer(s, { type: "setTemporaryArea", area: { cityId: "berlin", radiusKm: 25 } });
  assert.equal(activeArea(s).area?.cityId, "berlin");
  assert.equal(activeArea(s).isTemporary, true);
  assert.equal(s.savedArea?.cityId, "gothenburg");
  s = locationReducer(s, { type: "clearTemporaryArea" });
  assert.equal(activeArea(s).area?.cityId, "gothenburg");
});

test("delivery destination is independent of shopping area", () => {
  let s = locationReducer(DEFAULT_PREFS, { type: "setSavedArea", area: { cityId: "london", radiusKm: 10 } });
  s = locationReducer(s, { type: "setDeliveryDestination", country: "DE" });
  assert.equal(s.savedArea?.cityId, "london");
  assert.equal(s.deliveryDestination, "DE");
});

test("nearest supported city from a device position", () => {
  assert.equal(nearestCity({ lat: 57.7, lng: 11.95 }, cities)?.city.id, "gothenburg");
});

test("expired promotions are never returned; radius is respected", () => {
  const near = nearbyPromotions({ cityId: "stockholm", radiusKm: 50 }, cities, stores, promotions);
  assert.ok(near.every((n) => n.timing !== "expired"));
  assert.ok(!near.some((n) => n.promotion.id === "promo-05"));
  assert.ok(near.every((n) => n.km <= 50));
  assert.equal(promoTiming(promotions.find((p) => p.id === "promo-05")!), "expired");
  // Gothenburg outskirts store (~33 km) is excluded at 5 km but its promo still appears via the central store.
  const got5 = nearbyPromotions({ cityId: "gothenburg", radiusKm: 5 }, cities, stores, promotions);
  assert.ok(got5.every((n) => n.km <= 5));
});

test("no local deals in a city without demo stores in range", () => {
  // Hamburg only has a Blauwerk store; at 5 km only its promotions appear.
  const res = nearbyPromotions({ cityId: "hamburg", radiusKm: 5 }, cities, stores, promotions);
  assert.ok(res.every((n) => n.promotion.retailerId === "blauwerk"));
});
