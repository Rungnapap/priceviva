/**
 * Price history: ONLY prices that were actually observed, with when, where and from which source.
 *
 * - live:   every Awin import writes a row to `price_observations` (supabase); read via pa_catalog_price_history.
 * - sample: test mode records the sample-offer CSV prices each time the sample catalogue is (re)loaded,
 *           into .data/price-observations.json. These are real observations of DEMONSTRATION offers and are
 *           always labelled as such. Change a price in data/sample-offers.csv to see a real change appear.
 * - demo:   the fictional catalogue has no history; nothing is generated.
 *
 * Charts show the retailer's ITEM price as recorded (plus shipping where the source stated it). They are not
 * delivered totals, because import charges and FX at the time were not recorded.
 */
import type { CatalogProduct, CurrencyCode } from "./types";

export type ObservationSource = "awin" | "sample";

export interface PriceObservation {
  productId?: string;
  offerId: string;
  retailer: string;
  retailerCountry?: string | null;
  observedAt: string; // ISO
  priceMinor: number;
  currency: CurrencyCode;
  shippingMinor: number | null;
  source: ObservationSource;
}

const MAX_PER_OFFER = 2000;
/** Unchanged prices are recorded at most once per this interval (keeps the file small, still shows "still the same"). */
export const SAME_PRICE_INTERVAL_MS = 20 * 3_600_000;

/**
 * Append observations for the current offers of the given products.
 * A new row is added when the price/shipping changed, or the last row for that offer is older than 20 h.
 * Pure: returns the new list (tests use this directly).
 */
export function recordObservations(existing: PriceObservation[], products: CatalogProduct[], now: Date, source: ObservationSource): PriceObservation[] {
  const last = new Map<string, PriceObservation>();
  for (const o of existing) {
    const prev = last.get(o.offerId);
    if (!prev || prev.observedAt < o.observedAt) last.set(o.offerId, o);
  }
  const added: PriceObservation[] = [];
  for (const p of products) {
    for (const o of p.offers) {
      if (o.informational || o.price.minor <= 0) continue; // reference list prices are not shop offers
      // Shipping as stated for the retailer's home country, when stated (destination-specific costs are not recorded).
      const home = o.shipFrom ? o.destinations[o.shipFrom] : undefined;
      const shipping = home && home.shipping.basis !== "unknown" ? home.shipping.amountMinor : null;
      const prev = last.get(o.id);
      const changed = !prev || prev.priceMinor !== o.price.minor || prev.currency !== o.price.currency || prev.shippingMinor !== shipping;
      const stale = prev && now.getTime() - new Date(prev.observedAt).getTime() >= SAME_PRICE_INTERVAL_MS;
      if (changed || stale) {
        added.push({
          productId: p.id,
          offerId: o.id,
          retailer: o.retailer.name,
          retailerCountry: o.retailer.country,
          observedAt: now.toISOString(),
          priceMinor: o.price.minor,
          currency: o.price.currency,
          shippingMinor: shipping,
          source,
        });
      }
    }
  }
  if (added.length === 0) return existing;
  const all = [...existing, ...added];
  // Cap per offer (oldest dropped first).
  const count = new Map<string, number>();
  const keep: PriceObservation[] = [];
  for (let i = all.length - 1; i >= 0; i--) {
    const o = all[i]!;
    const n = (count.get(o.offerId) ?? 0) + 1;
    count.set(o.offerId, n);
    if (n <= MAX_PER_OFFER) keep.push(o);
  }
  return keep.reverse();
}

export interface HistorySeries {
  offerId: string;
  retailer: string;
  currency: CurrencyCode;
  points: { t: number; priceMinor: number; shippingMinor: number | null }[];
}

export type HistoryRange = "30d" | "90d" | "1y" | "all";
export const RANGE_DAYS: Record<HistoryRange, number> = { "30d": 30, "90d": 90, "1y": 365, all: Number.POSITIVE_INFINITY };

export interface HistorySummary {
  series: HistorySeries[];
  /** Enough to draw a meaningful line: ≥2 observations of one offer at least 1 hour apart. */
  sufficient: boolean;
  firstAt: string | null;
  lastAt: string | null;
  observationCount: number;
  /** Ranges that contain more than one observation time. */
  ranges: HistoryRange[];
  source: ObservationSource | null;
}

export function summarizeHistory(obs: PriceObservation[], range: HistoryRange = "all", now = new Date()): HistorySummary {
  const from = range === "all" ? 0 : now.getTime() - RANGE_DAYS[range] * 86_400_000;
  const inRange = obs.filter((o) => new Date(o.observedAt).getTime() >= from);
  const byOffer = new Map<string, HistorySeries>();
  for (const o of [...inRange].sort((a, b) => a.observedAt.localeCompare(b.observedAt))) {
    const s = byOffer.get(o.offerId) ?? { offerId: o.offerId, retailer: o.retailer, currency: o.currency, points: [] };
    s.points.push({ t: new Date(o.observedAt).getTime(), priceMinor: o.priceMinor, shippingMinor: o.shippingMinor });
    byOffer.set(o.offerId, s);
  }
  const series = [...byOffer.values()];
  const spanOk = (s: HistorySeries) => s.points.length >= 2 && s.points[s.points.length - 1]!.t - s.points[0]!.t >= 3_600_000;
  const times = obs.map((o) => new Date(o.observedAt).getTime());
  const ranges = (Object.keys(RANGE_DAYS) as HistoryRange[]).filter((r) => {
    const f = r === "all" ? 0 : now.getTime() - RANGE_DAYS[r] * 86_400_000;
    return new Set(times.filter((t) => t >= f)).size > 1;
  });
  const sorted = [...inRange].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  return {
    series,
    sufficient: series.some(spanOk),
    firstAt: sorted[0]?.observedAt ?? null,
    lastAt: sorted[sorted.length - 1]?.observedAt ?? null,
    observationCount: inRange.length,
    ranges,
    source: obs[0]?.source ?? null,
  };
}
