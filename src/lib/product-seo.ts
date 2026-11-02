/**
 * What search engines see for a product page: title, description and schema.org Product data.
 * Built only from real retailer data (live mode). Never ratings, reviews or invented discounts (brief rule 5);
 * demo and test products get no structured data at all (rule 6).
 */
import type { CatalogOffer, CatalogProduct } from "./types";

const AVAILABILITY: Record<CatalogOffer["stock"], string | null> = {
  in_stock: "https://schema.org/InStock",
  low_stock: "https://schema.org/LimitedAvailability",
  out_of_stock: "https://schema.org/OutOfStock",
  unknown: null,
};

const major = (minor: number) => (minor / 100).toFixed(2);

/** Purchasable retailer offers (not reference prices). */
const realOffers = (p: CatalogProduct) => p.offers.filter((o) => !o.informational);

/** "Comfort Tygbalsam" — the brand once, even when the shop already starts the name with it. */
export function productTitle(p: CatalogProduct): string {
  const brand = p.brandName.trim();
  const name = p.name.trim();
  const withBrand = brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name;
  return `${withBrand}${p.variant ? ` (${p.variant})` : ""}`.trim();
}

/**
 * Our own description (the shop's text is on the shop's site already, so copying it would be duplicate content):
 * "Compare prices for X: 2 offers from 2 shops, from SEK 48.95 (Bazta SE). Prices from retailer feeds."
 */
export function productDescription(p: CatalogProduct): string {
  const offers = realOffers(p);
  const title = productTitle(p);
  if (offers.length === 0) return `${title} on PriceViva.`;
  const cheapest = [...offers].sort((a, b) => a.price.minor - b.price.minor)[0]!;
  const shops = new Set(offers.map((o) => o.retailer.id)).size;
  const count = shops > 1 ? `${offers.length} offers from ${shops} shops` : `${offers.length === 1 ? "1 offer" : `${offers.length} offers`} from ${cheapest.retailer.name}`;
  const from = `${shops > 1 ? "from " : ""}${cheapest.price.currency} ${major(cheapest.price.minor)}${shops > 1 ? ` (${cheapest.retailer.name})` : ""}`;
  return `Compare prices for ${title}: ${count}, ${from}. Delivered cost to your country, prices from retailer feeds.`.slice(0, 300);
}

/** schema.org Product + Offer/AggregateOffer for one product page. null when there is nothing real to describe. */
export function productJsonLd(p: CatalogProduct, pageUrl: string): Record<string, unknown> | null {
  if (p.source === "demo" || p.source === "sample") return null;
  const offers = realOffers(p);
  if (offers.length === 0) return null;

  const offerLd = (o: CatalogOffer) => ({
    "@type": "Offer",
    price: major(o.price.minor),
    priceCurrency: o.price.currency,
    ...(AVAILABILITY[o.stock] ? { availability: AVAILABILITY[o.stock] } : {}),
    itemCondition: p.condition === "new" ? "https://schema.org/NewCondition" : p.condition === "used" ? "https://schema.org/UsedCondition" : "https://schema.org/RefurbishedCondition",
    seller: { "@type": "Organization", name: o.retailer.name },
    url: pageUrl,
  });

  // An AggregateOffer needs one currency; with mixed currencies, list the offers individually.
  const currencies = new Set(offers.map((o) => o.price.currency));
  const prices = offers.map((o) => o.price.minor);
  const offersLd =
    offers.length === 1
      ? offerLd(offers[0]!)
      : currencies.size === 1
      ? {
          "@type": "AggregateOffer",
          priceCurrency: offers[0]!.price.currency,
          lowPrice: major(Math.min(...prices)),
          highPrice: major(Math.max(...prices)),
          offerCount: offers.length,
          offers: offers.map(offerLd),
        }
      : offers.map(offerLd);

  const gtin = p.gtin ? p.gtin.replace(/^0+(?=\d{8,13}$)/, "") : "";
  const images = p.images.map((i) => i.url).filter((u) => u.startsWith("https://")).slice(0, 3);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productTitle(p),
    url: pageUrl,
    ...(images.length ? { image: images } : {}),
    ...(p.description ? { description: p.description.slice(0, 500) } : {}),
    ...(p.brandName ? { brand: { "@type": "Brand", name: p.brandName } } : {}),
    ...(p.model ? { mpn: p.model } : {}),
    ...(/^\d{8,14}$/.test(gtin) ? { gtin } : {}),
    offers: offersLd,
  };
}

/** JSON for a <script type="application/ld+json"> tag; "<" is escaped so product text can never close the tag. */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
