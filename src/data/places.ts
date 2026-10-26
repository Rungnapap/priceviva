/**
 * Cities, FICTIONAL demo stores and FICTIONAL demo promotions for Local Deal Radar.
 *
 * - City centre coordinates are low-precision public reference points.
 * - Store coordinates are invented offsets from the city centre. They are NOT real
 *   addresses and are labeled "fictional demo store" everywhere in the UI.
 * - Promotion dates are relative to "now" so the prototype always shows a mix of
 *   active, upcoming and expired examples. Expired ones must never be shown as current.
 */
import type { City, Promotion, Store } from "@/lib/types";

export const cities: City[] = [
  { id: "stockholm", name: "Stockholm", country: "SE", lat: 59.3293, lng: 18.0686 },
  { id: "gothenburg", name: "Gothenburg", country: "SE", lat: 57.7089, lng: 11.9746 },
  { id: "malmo", name: "Malmö", country: "SE", lat: 55.605, lng: 13.0038 },
  { id: "berlin", name: "Berlin", country: "DE", lat: 52.52, lng: 13.405 },
  { id: "munich", name: "Munich", country: "DE", lat: 48.1351, lng: 11.582 },
  { id: "hamburg", name: "Hamburg", country: "DE", lat: 53.5511, lng: 9.9937 },
  { id: "london", name: "London", country: "GB", lat: 51.5072, lng: -0.1276 },
  { id: "manchester", name: "Manchester", country: "GB", lat: 53.4808, lng: -2.2426 },
];

export const getCity = (id: string) => cities.find((c) => c.id === id);

// Offsets in degrees; roughly 0.01° lat ≈ 1.1 km.
function near(cityId: string, dLat: number, dLng: number): { cityId: string; lat: number; lng: number } {
  const c = getCity(cityId);
  if (!c) throw new Error(`Unknown city ${cityId}`);
  return { cityId, lat: c.lat + dLat, lng: c.lng + dLng };
}

export const stores: Store[] = [
  { id: "s-nordhem-sto-1", retailerId: "nordhem", name: "Nordhem Elektronik — City (demo)", ...near("stockholm", 0.006, 0.01), fictional: true },
  { id: "s-nordhem-sto-2", retailerId: "nordhem", name: "Nordhem Elektronik — North (demo)", ...near("stockholm", 0.11, -0.04), fictional: true },
  { id: "s-nordhem-got-1", retailerId: "nordhem", name: "Nordhem Elektronik — Harbour (demo)", ...near("gothenburg", -0.01, 0.02), fictional: true },
  { id: "s-nordhem-mal-1", retailerId: "nordhem", name: "Nordhem Elektronik — Centrum (demo)", ...near("malmo", 0.004, 0.006), fictional: true },
  { id: "s-fjallbod-sto-1", retailerId: "fjallbod", name: "Fjällbod Outdoor — Söder (demo)", ...near("stockholm", -0.02, 0.015), fictional: true },
  { id: "s-fjallbod-got-1", retailerId: "fjallbod", name: "Fjällbod Outdoor — West (demo)", ...near("gothenburg", 0.03, -0.09), fictional: true },
  { id: "s-kvarn-sto-1", retailerId: "kvarnbacken", name: "Kvarnbacken Livs — Östermalm (demo)", ...near("stockholm", 0.008, 0.02), fictional: true },
  { id: "s-kvarn-got-1", retailerId: "kvarnbacken", name: "Kvarnbacken Livs — Centrum (demo)", ...near("gothenburg", 0.002, -0.004), fictional: true },
  { id: "s-kvarn-got-2", retailerId: "kvarnbacken", name: "Kvarnbacken Livs — Outskirts (demo)", ...near("gothenburg", -0.28, 0.2), fictional: true },
  { id: "s-blauwerk-ber-1", retailerId: "blauwerk", name: "Blauwerk Technik — Mitte (demo)", ...near("berlin", 0.003, -0.005), fictional: true },
  { id: "s-blauwerk-mun-1", retailerId: "blauwerk", name: "Blauwerk Technik — Altstadt (demo)", ...near("munich", 0.002, 0.004), fictional: true },
  { id: "s-blauwerk-ham-1", retailerId: "blauwerk", name: "Blauwerk Technik — Hafen (demo)", ...near("hamburg", -0.006, 0.01), fictional: true },
  { id: "s-alpen-mun-1", retailerId: "alpenpfad", name: "Alpenpfad Sport — Süd (demo)", ...near("munich", -0.04, 0.01), fictional: true },
  { id: "s-alpen-ber-1", retailerId: "alpenpfad", name: "Alpenpfad Sport — Ost (demo)", ...near("berlin", 0.01, 0.07), fictional: true },
  { id: "s-thames-lon-1", retailerId: "thamesgate", name: "Thamesgate Electricals — Riverside (demo)", ...near("london", -0.004, 0.01), fictional: true },
  { id: "s-thames-lon-2", retailerId: "thamesgate", name: "Thamesgate Electricals — North (demo)", ...near("london", 0.12, -0.05), fictional: true },
  { id: "s-thames-man-1", retailerId: "thamesgate", name: "Thamesgate Electricals — Central (demo)", ...near("manchester", 0.003, 0.002), fictional: true },
];

export const getStore = (id: string) => stores.find((s) => s.id === id);

const DEMO_TERMS = "Demo promotion for prototype testing only. Not a real offer.";

export const promotions: Promotion[] = [
  { id: "promo-01", retailerId: "nordhem", storeIds: ["s-nordhem-sto-1", "s-nordhem-sto-2", "s-nordhem-got-1", "s-nordhem-mal-1"], productId: "p01", departmentSlug: "electronics",
    title: "Aria ANC headphones weekend price", promoPrice: { minor: 169000, currency: "SEK" }, reference: { price: { minor: 199000, currency: "SEK" }, evidence: "Demo reference: regular shelf price for the previous 30 days." },
    startOffsetDays: -1, endOffsetDays: 2, scope: "both", pickup: true, terms: DEMO_TERMS, verification: "demo", source: "demo" },
  { id: "promo-02", retailerId: "kvarnbacken", storeIds: ["s-kvarn-sto-1", "s-kvarn-got-1", "s-kvarn-got-2"], productId: "p31", departmentSlug: "groceries",
    title: "Pantrygold coffee beans 1 kg", promoPrice: { minor: 15900, currency: "SEK" }, reference: { price: { minor: 18900, currency: "SEK" }, evidence: "Demo reference: lowest price in the previous 30 days." },
    startOffsetDays: -3, endOffsetDays: 4, scope: "in_store", pickup: false, terms: DEMO_TERMS, verification: "demo", source: "demo" },
  { id: "promo-03", retailerId: "fjallbod", storeIds: ["s-fjallbod-sto-1", "s-fjallbod-got-1"], productId: "p27", departmentSlug: "outdoors",
    title: "Ridge 2-person tent end-of-season", promoPrice: { minor: 249000, currency: "SEK" }, reference: { price: { minor: 299000, currency: "SEK" }, evidence: "Demo reference: regular price for the previous 30 days." },
    startOffsetDays: -5, endOffsetDays: 9, scope: "both", pickup: true, terms: DEMO_TERMS, verification: "demo", source: "demo" },
  { id: "promo-04", retailerId: "nordhem", storeIds: ["s-nordhem-got-1"], productId: null, departmentSlug: "computers-gaming",
    title: "Gaming accessories — 15% off at checkout", promoPrice: { minor: 0, currency: "SEK" }, reference: null,
    startOffsetDays: 3, endOffsetDays: 10, scope: "in_store", pickup: false, terms: `${DEMO_TERMS} Percentage applies to selected accessories only.`, verification: "demo", source: "demo" },
  { id: "promo-05", retailerId: "nordhem", storeIds: ["s-nordhem-sto-1"], productId: "p05", departmentSlug: "electronics",
    title: "Vista 55\" TV clearance (EXPIRED example)", promoPrice: { minor: 699000, currency: "SEK" }, reference: { price: { minor: 799000, currency: "SEK" }, evidence: "Demo reference." },
    startOffsetDays: -14, endOffsetDays: -2, scope: "in_store", pickup: false, terms: DEMO_TERMS, verification: "demo", source: "demo" },
  { id: "promo-06", retailerId: "blauwerk", storeIds: ["s-blauwerk-ber-1", "s-blauwerk-mun-1", "s-blauwerk-ham-1"], productId: "p12", departmentSlug: "computers-gaming",
    title: "27\" QHD monitor in-store price", promoPrice: { minor: 22900, currency: "EUR" }, reference: { price: { minor: 25900, currency: "EUR" }, evidence: "Demo reference: lowest price in the previous 30 days." },
    startOffsetDays: -2, endOffsetDays: 5, scope: "in_store", pickup: true, terms: DEMO_TERMS, verification: "demo", source: "demo" },
  { id: "promo-07", retailerId: "alpenpfad", storeIds: ["s-alpen-mun-1", "s-alpen-ber-1"], productId: "p24", departmentSlug: "sports",
    title: "Stride running shoes", promoPrice: { minor: 10900, currency: "EUR" }, reference: { price: { minor: 12900, currency: "EUR" }, evidence: "Demo reference." },
    startOffsetDays: 0, endOffsetDays: 6, scope: "both", pickup: true, terms: DEMO_TERMS, verification: "demo", source: "demo" },
  { id: "promo-08", retailerId: "thamesgate", storeIds: ["s-thames-lon-1", "s-thames-lon-2", "s-thames-man-1"], productId: "p19", departmentSlug: "kitchen",
    title: "AirCrisp air fryer bundle price", promoPrice: { minor: 7900, currency: "GBP" }, reference: { price: { minor: 8900, currency: "GBP" }, evidence: "Demo reference." },
    startOffsetDays: -1, endOffsetDays: 3, scope: "both", pickup: true, terms: DEMO_TERMS, verification: "demo", source: "demo" },
  { id: "promo-09", retailerId: "thamesgate", storeIds: ["s-thames-lon-1"], productId: "p13", departmentSlug: "computers-gaming",
    title: "Strike controller in-store only", promoPrice: { minor: 3999, currency: "GBP" }, reference: null,
    startOffsetDays: -2, endOffsetDays: 1, scope: "in_store", pickup: false, terms: `${DEMO_TERMS} No reference price available, so no discount percentage is shown.`, verification: "demo", source: "demo" },
];
