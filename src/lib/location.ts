/**
 * Location model.
 *
 * Three DIFFERENT concepts are kept apart everywhere (state, storage, UI):
 *  - shoppingArea:          where the user wants to browse local deals (any real place + radius).
 *                           Two kinds: the SAVED default area (this browser) and a TEMPORARY browsing area (this tab).
 *  - deliveryDestination:   the country goods are shipped to (drives landed cost). Never changed by the area.
 *  - device location:       only requested when the user taps "Use my location". It is rounded to ~1 km, shown as a
 *                           SUGGESTION ("Detected: Kalmar") and used only after the user confirms. A detected or
 *                           searched place is never silently replaced by a different city.
 */
import type { City, CountryCode, Promotion, Store } from "./types";

export const RADIUS_OPTIONS_KM = [5, 10, 25, 50, 100] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS_KM)[number];

export interface AreaPlace {
  /** What the user chose, e.g. "Kalmar" or "392 32 Kalmar". Shown everywhere as-is. */
  label: string;
  lat: number;
  lng: number;
  /** ISO country of the place when known (informational; never changes the delivery country). */
  country?: string | null;
  /** search = typed city/postcode, device = confirmed "Use my location", city = quick pick. */
  source?: "search" | "device" | "city";
}

export interface ShoppingArea {
  /**
   * Legacy key of a built-in quick-pick city (v0.5 and earlier stored only this). Empty for any other place.
   * Never used to substitute a different location.
   */
  cityId: string;
  radiusKm: RadiusKm;
  /** The chosen place. New areas always have one; old saved areas without one fall back to the quick-pick city. */
  place?: AreaPlace | null;
}

/** Build an area from a chosen place. */
export function areaFromPlace(place: AreaPlace, radiusKm: RadiusKm, cities: City[]): ShoppingArea {
  // Only remember a quick-pick city id when the place IS that city (within 3 km), never the "nearest" one.
  const same = cities.find((c) => c.name.toLowerCase() === place.label.toLowerCase() && distanceKm(c, place) < 3);
  return { cityId: same?.id ?? "", radiusKm, place: { ...place, lat: roundCoord(place.lat), lng: roundCoord(place.lng) } };
}

/** Centre point of an area: the searched place if any, else the city centre. */
export function areaCenter(area: ShoppingArea, cities: City[]): { lat: number; lng: number; label: string } | null {
  if (area.place) return area.place;
  const c = cities.find((x) => x.id === area.cityId);
  return c ? { lat: c.lat, lng: c.lng, label: c.name } : null;
}

/** Short human label for an area: the searched place, else the city name. */
export function areaName(area: ShoppingArea, cities: City[]): string | null {
  return area.place?.label ?? cities.find((c) => c.id === area.cityId)?.name ?? null;
}

export const roundCoord = (v: number) => Math.round(v * 1000) / 1000;

export interface LocationPrefs {
  /** The guest's chosen default area (persisted in this browser). */
  savedArea: ShoppingArea | null;
  /** A temporary browsing area; overrides savedArea for this session without changing it. */
  temporaryArea: ShoppingArea | null;
  deliveryDestination: CountryCode;
}

export const DEFAULT_PREFS: LocationPrefs = {
  savedArea: null,
  temporaryArea: null,
  deliveryDestination: "SE",
};

export function activeArea(p: LocationPrefs): { area: ShoppingArea | null; isTemporary: boolean } {
  if (p.temporaryArea) return { area: p.temporaryArea, isTemporary: true };
  return { area: p.savedArea, isTemporary: false };
}

/** Pure reducer so the rules can be unit-tested without a browser. */
export type LocationAction =
  | { type: "setSavedArea"; area: ShoppingArea }
  | { type: "setTemporaryArea"; area: ShoppingArea }
  | { type: "clearTemporaryArea" }
  | { type: "setRadius"; radiusKm: RadiusKm }
  | { type: "setDeliveryDestination"; country: CountryCode }
  | { type: "reset" };

export function locationReducer(state: LocationPrefs, action: LocationAction): LocationPrefs {
  switch (action.type) {
    case "setSavedArea":
      // Choosing a new default ends any temporary browsing.
      return { ...state, savedArea: action.area, temporaryArea: null };
    case "setTemporaryArea":
      return { ...state, temporaryArea: action.area }; // savedArea deliberately untouched
    case "clearTemporaryArea":
      return { ...state, temporaryArea: null };
    case "setRadius": {
      if (state.temporaryArea) return { ...state, temporaryArea: { ...state.temporaryArea, radiusKm: action.radiusKm } };
      if (state.savedArea) return { ...state, savedArea: { ...state.savedArea, radiusKm: action.radiusKm } };
      return state;
    }
    case "setDeliveryDestination":
      return { ...state, deliveryDestination: action.country }; // never touches shopping areas
    case "reset":
      return DEFAULT_PREFS;
  }
}

const R_EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Map a device position to the nearest *supported* city. Coordinates are discarded afterwards. */
export function nearestCity(pos: { lat: number; lng: number }, cities: City[]): { city: City; km: number } | null {
  let best: { city: City; km: number } | null = null;
  for (const c of cities) {
    const km = distanceKm(pos, c);
    if (!best || km < best.km) best = { city: c, km };
  }
  return best;
}

export type PromoTiming = "active" | "upcoming" | "expired";

export function promoTiming(p: Promotion): PromoTiming {
  if (p.endOffsetDays < 0) return "expired";
  if (p.startOffsetDays > 0) return "upcoming";
  return "active";
}

/** Concrete dates for a relative demo promotion. */
export function promoDates(p: Promotion, now: Date): { start: Date; end: Date } {
  const day = 86_400_000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return {
    start: new Date(startOfToday + p.startOffsetDays * day),
    end: new Date(startOfToday + p.endOffsetDays * day + day - 1),
  };
}

export interface NearbyPromotion {
  promotion: Promotion;
  timing: PromoTiming;
  /** Nearest participating store inside the radius. */
  store: Store;
  km: number;
}

/**
 * Promotions with at least one participating store within the radius of the area's city centre.
 * Expired promotions are excluded — they are never presented as current.
 */
export function nearbyPromotions(
  area: ShoppingArea,
  cities: City[],
  stores: Store[],
  promotions: Promotion[],
): NearbyPromotion[] {
  const center = areaCenter(area, cities);
  if (!center) return [];
  const out: NearbyPromotion[] = [];
  for (const p of promotions) {
    const timing = promoTiming(p);
    if (timing === "expired") continue;
    let best: { store: Store; km: number } | null = null;
    for (const sid of p.storeIds) {
      const s = stores.find((x) => x.id === sid);
      if (!s) continue;
      const km = distanceKm(center, s);
      if (km <= area.radiusKm && (!best || km < best.km)) best = { store: s, km };
    }
    if (best) out.push({ promotion: p, timing, ...best });
  }
  return out.sort((a, b) => (a.timing === b.timing ? a.km - b.km : a.timing === "active" ? -1 : 1));
}
