/**
 * Landed-cost engine ("what will this cost me, delivered?").
 *
 * Plain-English rules:
 *  1. Unknown charges are NEVER treated as zero. If a cost is unknown, the total is unknown.
 *  2. A zero that the seller has confirmed (e.g. free shipping) IS a real zero.
 *  3. Seller VAT that is refunded on export is removed once, so VAT is never counted twice.
 *  4. Only complete totals (verified or estimated) can be ranked as "cheapest".
 *  5. Stale prices (older than STALE_AFTER_DAYS) are flagged and never shown as the current best.
 */
import type { CostComponent, CountryCode, CurrencyCode, Offer, TotalStatus } from "./types";
import { convertMinor, type FxTable } from "./money";
import { STANDARD_VAT, removeVat } from "./tax";

export const STALE_AFTER_DAYS = 7;

export interface LandedCost {
  offerId: string;
  status: TotalStatus;
  /** Offer currency. */
  currency: CurrencyCode;
  listedPriceMinor: number;
  /** Item price after removing seller VAT for export (equals listed price otherwise). */
  itemMinor: number;
  sellerVatRemovedMinor: number;
  shipping: CostComponent | null;
  importCharges: CostComponent | null;
  /** Complete total — only set for verified_total / estimated_total. */
  totalMinor: number | null;
  /** Sum of the parts we do know (used for display with "+ unknown"). */
  knownSubtotalMinor: number;
  unknownParts: ("shipping" | "import charges")[];
  stale: boolean;
  deliveryDays?: [number, number];
  reason?: string;
}

export function computeLandedCost(offer: Offer, destination: CountryCode): LandedCost {
  const base = {
    offerId: offer.id,
    currency: offer.price.currency,
    listedPriceMinor: offer.price.minor,
    stale: offer.observedDaysAgo > STALE_AFTER_DAYS,
  };
  const terms = offer.destinations[destination];

  if (!terms) {
    return { ...base, status: "unavailable", itemMinor: offer.price.minor, sellerVatRemovedMinor: 0, shipping: null, importCharges: null,
      totalMinor: null, knownSubtotalMinor: offer.price.minor, unknownParts: [], reason: "No delivery to this destination stated by the retailer" };
  }
  if (offer.stock === "out_of_stock") {
    return { ...base, status: "unavailable", itemMinor: offer.price.minor, sellerVatRemovedMinor: 0, shipping: terms.shipping, importCharges: terms.importCharges,
      totalMinor: null, knownSubtotalMinor: offer.price.minor, unknownParts: [], reason: "Out of stock", deliveryDays: terms.deliveryDays };
  }

  let itemMinor = offer.price.minor;
  let sellerVatRemovedMinor = 0;
  if (terms.sellerVatRemoved && offer.vatIncluded) {
    itemMinor = offer.shipFrom ? removeVat(offer.price.minor, STANDARD_VAT[offer.shipFrom]) : offer.price.minor;
    sellerVatRemovedMinor = offer.price.minor - itemMinor;
  }

  const parts: [("shipping" | "import charges"), CostComponent][] = [
    ["shipping", terms.shipping],
    ["import charges", terms.importCharges],
  ];
  const unknownParts = parts.filter(([, c]) => c.basis === "unknown" || c.amountMinor === null).map(([n]) => n);
  const knownSubtotalMinor = itemMinor + parts.reduce((sum, [, c]) => sum + (c.amountMinor ?? 0), 0);

  let status: TotalStatus;
  if (unknownParts.length === parts.length) status = "item_price_only";
  else if (unknownParts.length > 0) status = "partial_total";
  else if (parts.some(([, c]) => c.basis === "estimated")) status = "estimated_total";
  else status = "verified_total";

  const complete = status === "verified_total" || status === "estimated_total";

  return {
    ...base,
    status,
    itemMinor,
    sellerVatRemovedMinor,
    shipping: terms.shipping,
    importCharges: terms.importCharges,
    totalMinor: complete ? knownSubtotalMinor : null,
    knownSubtotalMinor,
    unknownParts,
    deliveryDays: terms.deliveryDays,
  };
}

export interface RankedOffer<O extends Offer = Offer> {
  offer: O;
  landed: LandedCost;
  /** Converted into the display currency (null where the total is not complete). */
  displayTotalMinor: number | null;
  displayKnownMinor: number;
  displayCurrency: CurrencyCode;
  /** 0 = complete & fresh, 1 = incomplete & fresh, 2 = stale or informational-only, 3 = unavailable */
  tier: 0 | 1 | 2 | 3;
}

export interface Ranking<O extends Offer = Offer> {
  offers: RankedOffer<O>[];
  /** Cheapest complete, fresh total — or null when none can be determined. */
  best: RankedOffer<O> | null;
  /** True when an incomplete offer's known part is already below the best total, so it *might* be cheaper. */
  bestIsUncertain: boolean;
}

export function rankOffers<O extends Offer>(offers: O[], destination: CountryCode, displayCurrency: CurrencyCode, fx: FxTable): Ranking<O> {
  const ranked: RankedOffer<O>[] = offers.map((offer) => {
    const landed = computeLandedCost(offer, destination);
    const conv = (m: number) => convertMinor(m, landed.currency, displayCurrency, fx);
    const complete = landed.totalMinor !== null;
    const tier: RankedOffer<O>["tier"] =
      landed.status === "unavailable" ? 3 : landed.stale || offer.informational ? 2 : complete ? 0 : 1;
    return {
      offer,
      landed,
      displayTotalMinor: complete ? conv(landed.totalMinor as number) : null,
      displayKnownMinor: conv(landed.knownSubtotalMinor),
      displayCurrency,
      tier,
    };
  });

  ranked.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const av = a.displayTotalMinor ?? a.displayKnownMinor;
    const bv = b.displayTotalMinor ?? b.displayKnownMinor;
    if (av !== bv) return av - bv;
    // Prefer verified over estimated at equal price.
    return (a.landed.status === "verified_total" ? 0 : 1) - (b.landed.status === "verified_total" ? 0 : 1);
  });

  const best = ranked.find((r) => r.tier === 0) ?? null;
  const bestIsUncertain =
    best !== null && ranked.some((r) => r.tier === 1 && r.displayKnownMinor < (best.displayTotalMinor as number));

  return { offers: ranked, best, bestIsUncertain };
}

export const STATUS_LABEL: Record<TotalStatus, string> = {
  verified_total: "Verified delivered total",
  estimated_total: "Estimated delivered total",
  partial_total: "Partial total — some costs unknown",
  item_price_only: "Item price only — delivery costs unknown",
  unavailable: "Unavailable",
};
