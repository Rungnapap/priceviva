import assert from "node:assert/strict";
import { test } from "node:test";
import { cities, promotions, stores } from "../src/data/places";
import { demoLocalOffers, filterLocalOffers, productQueryTerms } from "../src/lib/local-offers";
import { areaCenter } from "../src/lib/location";

const now = new Date("2026-10-25T12:00:00Z");

test("local offers: demo stores are never given real map positions or invented addresses", () => {
  const list = demoLocalOffers({ cityId: "stockholm", radiusKm: 50 }, cities, stores, promotions, now);
  assert.ok(list.length > 0);
  for (const o of list) {
    assert.equal(o.status, "demo");
    assert.equal(o.store.lat, null);
    assert.equal(o.store.address, null);
    assert.equal(o.store.website, null);
    assert.equal(o.availability, "unknown");
  }
});

test("local offers: 'running shoes near me' finds the shoe deal and nothing unrelated", () => {
  assert.deepEqual(productQueryTerms("Running shoes near me!"), ["running", "shoes"]);
  const list = demoLocalOffers({ cityId: "berlin", radiusKm: 25 }, cities, stores, promotions, now);
  const hits = filterLocalOffers(list, { query: "running shoes near me" });
  assert.ok(hits.length >= 1 && hits.every((o) => /running shoes/i.test(o.title)));
  assert.equal(filterLocalOffers(list, { query: "garden hose" }).length, 0, "no match -> empty, never padded");
  const sthlm = demoLocalOffers({ cityId: "stockholm", radiusKm: 50 }, cities, stores, promotions, now);
  assert.equal(filterLocalOffers(sthlm, { query: "running shoes" }).length, 0, "the shoe deal is in Berlin/Munich only");
});

test("local offers: sort by distance or end date; category filter uses shopper groups", () => {
  const list = demoLocalOffers({ cityId: "stockholm", radiusKm: 50 }, cities, stores, promotions, now);
  const byDist = filterLocalOffers(list, { sort: "distance" }).map((o) => o.distanceKm ?? 0);
  assert.deepEqual(byDist, [...byDist].sort((a, b) => a - b));
  const byEnd = filterLocalOffers(list, { sort: "ending" }).map((o) => o.validTo.getTime());
  assert.deepEqual(byEnd, [...byEnd].sort((a, b) => a - b));
  const electronics = filterLocalOffers(list, { group: "electronics" });
  assert.ok(electronics.every((o) => ["electronics", "phones", "computers-gaming"].includes(o.departmentSlug ?? "")));
});

test("areas: a searched place becomes the centre; otherwise the city centre", () => {
  const place = { label: "Södermalm", lat: 59.312, lng: 18.075 };
  assert.deepEqual(areaCenter({ cityId: "stockholm", radiusKm: 5, place }, cities), place);
  assert.equal(areaCenter({ cityId: "stockholm", radiusKm: 5 }, cities)?.label, "Stockholm");
});

test("Kalmar stays Kalmar: a searched or detected place is never replaced by a quick-pick city", async () => {
  const { areaFromPlace, areaName } = await import("../src/lib/location");
  const kalmar = { label: "Kalmar", lat: 56.6634, lng: 16.3568, country: "SE", source: "search" as const };
  const a = areaFromPlace(kalmar, 25, cities);
  assert.equal(a.cityId, "", "Kalmar is not a quick-pick city, so no city id (and certainly not Malmö)");
  assert.equal(areaName(a, cities), "Kalmar");
  assert.deepEqual(areaCenter(a, cities), { ...kalmar, lat: 56.663, lng: 16.357 });
  // No demo stores near Kalmar: the demo list is empty instead of showing Malmö offers.
  assert.equal(demoLocalOffers(a, cities, stores, promotions, now).length, 0);
  // Choosing the quick-pick city itself keeps its id.
  const sthlm = areaFromPlace({ label: "Stockholm", lat: 59.3293, lng: 18.0686, source: "city" }, 10, cities);
  assert.equal(sthlm.cityId, "stockholm");
  // A device position near Malmö but labelled by the geocoder as "Lund" stays Lund.
  const lund = areaFromPlace({ label: "Lund", lat: 55.70, lng: 13.19, source: "device" }, 10, cities);
  assert.equal(lund.cityId, "");
  assert.equal(areaName(lund, cities), "Lund");
});
