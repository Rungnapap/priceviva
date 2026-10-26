import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { cleanQuery, geocode, labelFor, resetGeocoder, reverseGeocode } from "../src/lib/server/geocode";

const kalmar = { display_name: "Kalmar, Kalmar kommun, Kalmar län, Sverige", name: "Kalmar", addresstype: "city", lat: "56.66340", lon: "16.35680", address: { city: "Kalmar", country_code: "se" } };
const postcode = { display_name: "392 32, Kalmar, Kalmar kommun, Kalmar län, Sverige", name: "392 32", addresstype: "postcode", lat: "56.66", lon: "16.36", address: { postcode: "392 32", city: "Kalmar", country_code: "se" } };
const france = { display_name: "Somewhere, France", name: "Somewhere", lat: "48.8", lon: "2.3", address: { country_code: "fr" } };

const fakeFetch = (rows: unknown, seen: { url?: string; ua?: string } = {}) =>
  (async (url: string, init?: RequestInit) => {
    seen.url = url;
    seen.ua = (init?.headers as Record<string, string>)["User-Agent"];
    return new Response(JSON.stringify(rows), { status: 200 });
  }) as unknown as typeof fetch;

beforeEach(() => resetGeocoder());

test("geocode: validates input and never calls upstream for junk", async () => {
  assert.equal(cleanQuery(" a "), null);
  assert.equal(cleanQuery("x".repeat(81)), null);
  assert.equal(cleanQuery("11 8\u000025"), "11 8 25");
  let called = false;
  const r = await geocode("a", "ip", { fetch: (async () => { called = true; return new Response("[]"); }) as unknown as typeof fetch });
  assert.equal(r.status, "invalid");
  assert.equal(called, false);
});

test("geocode: Kalmar is found as Kalmar (no substitution), postcodes get a readable label, other countries filtered", async () => {
  const seen: { url?: string; ua?: string } = {};
  const r = await geocode("Kalmar", "ip", { fetch: fakeFetch([kalmar, postcode, france], seen), now: () => 10_000, env: { GEOCODER_CONTACT: "ops@example.com" } });
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.deepEqual(r.results.map((x) => x.label), ["Kalmar", "392 32 Kalmar"]);
  assert.deepEqual([r.results[0]!.lat, r.results[0]!.lng, r.results[0]!.country], [56.663, 16.357, "SE"]);
  assert.match(seen.url ?? "", /countrycodes=se,de,gb,no,dk,fi/);
  assert.match(seen.ua ?? "", /PriceViva.*ops@example\.com/);
  assert.equal(labelFor(postcode), "392 32 Kalmar");
});

test("reverse geocode: position is rounded to ~1 km before it is sent, and kept as the centre", async () => {
  const seen: { url?: string } = {};
  const r = await reverseGeocode(56.661234, 16.361987, "ip", { fetch: fakeFetch(kalmar, seen), now: () => 20_000, env: {} });
  assert.match(seen.url ?? "", /lat=56\.66&lon=16\.36(&|$)/);
  assert.equal(r.status === "ok" && r.results[0]!.label, "Kalmar");
  assert.deepEqual(r.status === "ok" && [r.results[0]!.lat, r.results[0]!.lng], [56.66, 16.36]);
  assert.equal((await reverseGeocode(999, 0, "ip")).status, "invalid");
});

test("geocode: caches, spaces upstream calls and rate-limits each visitor", async () => {
  let t = 100_000;
  const deps = { fetch: fakeFetch([kalmar]), now: () => t, env: {} };
  assert.equal((await geocode("Berlin Mitte", "ip1", deps)).status, "ok");
  const cached = await geocode("berlin mitte", "ip1", deps);
  assert.equal(cached.status === "ok" && cached.cached, true);
  assert.equal((await geocode("Hamburg", "ip1", deps)).status, "rate_limited", "second upstream call within 1.1 s is refused");
  for (let i = 0; i < 20; i++) {
    t += 2_000;
    await geocode(`place ${i}`, "ip2", deps);
  }
  t += 2_000;
  assert.equal((await geocode("one more", "ip2", deps)).status, "rate_limited", "21st lookup within a minute is refused");
});

test("geocode: upstream failure and kill switch give honest states", async () => {
  const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
  assert.equal((await geocode("Malmö", "ip", { fetch: down, now: () => 5_000, env: {} })).status, "unavailable");
  assert.equal((await geocode("Malmö", "ip", { env: { GEOCODER: "off" } })).status, "disabled");
});

test("municipalities keep their own name (e.g. Mönsterås kommun), and a village shows its municipality in the detail", () => {
  const kommun = { name: "Mönsterås kommun", addresstype: "municipality", display_name: "Mönsterås kommun, Kalmar län, Sverige", lat: "57.04", lon: "16.44", address: { municipality: "Mönsterås kommun", county: "Kalmar län", country_code: "se" } };
  assert.equal(labelFor(kommun), "Mönsterås kommun");
  const village = { name: "Timmernabben", addresstype: "village", display_name: "Timmernabben, Mönsterås kommun, Kalmar län, Sverige", lat: "56.97", lon: "16.44", address: { village: "Timmernabben", municipality: "Mönsterås kommun", country_code: "se" } };
  assert.equal(labelFor(village), "Timmernabben");
});
