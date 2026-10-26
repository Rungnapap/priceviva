/**
 * Local Deal Radar view model.
 *
 * The UI only ever renders `LocalOfferView`s. Each one says where its data came from (`status`), and every
 * field that the source does not supply is `null` / "unknown" and shown as such — never filled in.
 * Today the only source is the fictional demo data (src/data/places.ts). Verified merchant imports
 * (supabase `stores`, `promotions`, `promotion_stores`; see docs/LOCAL_DATA.md) map onto the same shape.
 */
import { getProduct, getRetailer } from "@/data/catalog";
import { groupForDepartment } from "@/data/shop-categories";
import { areaCenter, nearbyPromotions, promoDates, type ShoppingArea } from "./location";
import { normalize } from "./search";
import type { City, Money, Promotion, Store } from "./types";

/** verified = checked by PriceViva against the merchant; merchant = supplied by the merchant, not yet checked; demo = fictional. */
export type LocalDataStatus = "verified" | "merchant" | "demo";
export type Availability = "in_stock" | "limited" | "out_of_stock" | "unknown";

export interface LocalStoreView {
  id: string;
  retailerName: string;
  name: string;
  /** Street address — null when the source has none (all demo stores). */
  address: string | null;
  city: string | null;
  /** Real map position. Null for demo stores: their positions are invented and must not be pinned on a real map. */
  lat: number | null;
  lng: number | null;
  website: string | null;
  status: LocalDataStatus;
}

export interface LocalOfferView {
  id: string;
  store: LocalStoreView;
  title: string;
  productName: string | null;
  productSlug: string | null;
  departmentSlug: string | null;
  price: Money | null;
  reference: { price: Money; evidence: string } | null;
  validFrom: Date;
  validTo: Date;
  timing: "active" | "upcoming";
  availability: Availability;
  scope: "in_store" | "online" | "both";
  pickup: boolean;
  terms: string | null;
  /** Distance from the area centre in km. For demo stores this is computed from invented positions. */
  distanceKm: number | null;
  status: LocalDataStatus;
  /** When the data was last confirmed by its source (ISO); null when unknown. */
  updatedAt: string | null;
}

/** Wire format (dates as ISO strings), as returned by the database function and /api/local-offers. */
export type LocalOfferJson = Omit<LocalOfferView, "validFrom" | "validTo"> & { validFrom: string; validTo: string };

export const fromLocalJson = (o: LocalOfferJson): LocalOfferView => ({ ...o, validFrom: new Date(o.validFrom), validTo: new Date(o.validTo) });

/** Demo adapter: the fictional stores/promotions, in range of the area, as views. */
export function demoLocalOffers(area: ShoppingArea, cities: City[], stores: Store[], promotions: Promotion[], now: Date): LocalOfferView[] {
  return nearbyPromotions(area, cities, stores, promotions).map((n) => {
    const p = n.promotion;
    const product = p.productId ? getProduct(p.productId) : undefined;
    const { start, end } = promoDates(p, now);
    const city = cities.find((c) => c.id === n.store.cityId);
    return {
      id: `${p.id}@${n.store.id}`,
      store: {
        id: n.store.id,
        retailerName: getRetailer(p.retailerId)?.name ?? "Unknown retailer",
        name: n.store.name,
        address: null,
        city: city?.name ?? null,
        lat: null,
        lng: null,
        website: null,
        status: "demo",
      },
      title: p.title,
      productName: product ? product.name : null,
      productSlug: product ? product.slug : null,
      departmentSlug: p.departmentSlug,
      price: p.promoPrice.minor > 0 ? p.promoPrice : null,
      reference: p.reference,
      validFrom: start,
      validTo: end,
      timing: n.timing === "upcoming" ? "upcoming" : "active",
      availability: "unknown",
      scope: p.scope,
      pickup: p.pickup,
      terms: p.terms,
      distanceKm: n.km,
      status: "demo",
      updatedAt: null,
    };
  });
}

export type LocalSort = "distance" | "ending" | "relevance";

/** Words that describe "nearby" rather than the product ("running shoes near me"). */
const NEARBY_WORDS = /\b(near me|nearby|close to me|around me|near|local|in store|in-store)\b/g;

export function productQueryTerms(q: string): string[] {
  return normalize(q.replace(/[^\p{L}\p{N}\s-]/gu, " ").toLowerCase().replace(NEARBY_WORDS, " "))
    .split(" ")
    .filter((t) => t.length >= 2);
}

function score(o: LocalOfferView, terms: string[]): number {
  if (terms.length === 0) return 1;
  const hay = normalize([o.title, o.productName ?? "", o.store.retailerName, o.departmentSlug ?? "", groupForDepartment(o.departmentSlug ?? "")?.name ?? ""].join(" "));
  let s = 0;
  for (const t of terms) {
    // Simple stemming so "shoes" finds "shoe" and "headphone" finds "headphones".
    const stem = t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t;
    if (hay.includes(stem)) s += hay.includes(` ${stem}`) || hay.startsWith(stem) ? 2 : 1;
    else return 0; // every term must match: never pad results with unrelated offers
  }
  return s;
}

export function filterLocalOffers(
  list: LocalOfferView[],
  opts: { query?: string; group?: string; sort?: LocalSort },
): LocalOfferView[] {
  const terms = productQueryTerms(opts.query ?? "");
  const scored = list
    .filter((o) => !opts.group || groupForDepartment(o.departmentSlug ?? "")?.slug === opts.group)
    .map((o) => ({ o, s: score(o, terms) }))
    .filter((x) => x.s > 0);
  const sort = opts.sort ?? (terms.length ? "relevance" : "distance");
  const dist = (o: LocalOfferView) => o.distanceKm ?? Number.POSITIVE_INFINITY;
  scored.sort((a, b) => {
    if (sort === "relevance" && b.s !== a.s) return b.s - a.s;
    if (sort === "ending") return a.o.validTo.getTime() - b.o.validTo.getTime();
    return dist(a.o) - dist(b.o);
  });
  return scored.map((x) => x.o);
}

export { areaCenter };
