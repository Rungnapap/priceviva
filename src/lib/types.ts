/**
 * Core domain types for PriceAtlas.
 *
 * These mirror the future database tables (Phase 2, Supabase/PostgreSQL) so the
 * UI does not need to change when demo data is replaced with real data.
 */

export type CountryCode = "SE" | "DE" | "GB";
export type CurrencyCode = "SEK" | "EUR" | "GBP" | "USD" | "NOK" | "DKK" | "CHF" | "CAD" | "AUD" | "JPY";
/** Currencies a shopper can choose for display (converted with ECB reference rates; originals are always kept). */
export const DISPLAY_CURRENCIES: CurrencyCode[] = ["SEK", "EUR", "GBP", "USD", "NOK", "DKK", "CHF", "CAD", "AUD", "JPY"];

/** Where a record came from. "demo" records are fictional and always labeled. */
export type DataSource = "demo" | "sample" | "awin" | "ebay" | "amazon" | "direct" | "manual";

export const SUPPORTED_COUNTRIES: CountryCode[] = ["SE", "DE", "GB"];
export const SUPPORTED_CURRENCIES: CurrencyCode[] = ["SEK", "EUR", "GBP"];

export type Condition = "new" | "open_box" | "refurbished" | "used";

export interface Money {
  /** Amount in minor units (öre, cents, pence) to avoid floating-point drift. */
  minor: number;
  currency: CurrencyCode;
}

export interface Department {
  slug: string;
  name: string;
  tagline: string;
  /** Lucide icon key, resolved in the UI layer. */
  icon: string;
  /** Hue used for decorative art (0–360). */
  hue: number;
  subcategories: { slug: string; name: string }[];
  /** False = department exists in the hierarchy but has no demo products yet. */
  populated: boolean;
}

export interface Brand {
  slug: string;
  name: string;
  /** Every Phase 1 brand is invented. */
  fictional: true;
}

export interface Retailer {
  id: string;
  name: string;
  country: CountryCode;
  fictional: true;
  /** Plain-language policy summaries; demo text. */
  returnsPolicy: string;
  warranty: string;
  hasPhysicalStores: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string; // brand slug
  department: string; // department slug
  subcategory: string; // subcategory slug
  /** Exact-variant identity. Two products are only compared when these match. */
  model: string;
  variant: string;
  gtin: string; // demo GTIN — NOT a real registered barcode
  condition: Condition;
  description: string;
  specs: Record<string, string>;
  keywords: string[];
  /** Decorative art seed: which glyph to draw. */
  art: string;
  /** Pack size, used for unit pricing (groceries etc.). */
  unit?: { quantity: number; unit: "kg" | "l" | "pcs" };
  source: DataSource;
}

/** Known / estimated / unknown cost component. `null` amount means UNKNOWN — never zero. */
export interface CostComponent {
  amountMinor: number | null;
  /** verified: from retailer/provider; estimated: our labeled estimate; unknown: no data */
  basis: "verified" | "estimated" | "unknown";
  note?: string;
}

export interface DestinationTerms {
  shipping: CostComponent;
  /** Import duty + import VAT + customs handling. Not applicable within the same customs union. */
  importCharges: CostComponent;
  /**
   * True when the seller removes its own (domestic) VAT for this export
   * destination. The engine then subtracts it so VAT is never counted twice.
   */
  sellerVatRemoved?: boolean;
  deliveryDays?: [number, number];
}

export interface Offer {
  id: string;
  productId: string;
  retailerId: string;
  price: Money;
  /** True when the item price already includes VAT of the seller's country. */
  vatIncluded: boolean;
  shipFrom: CountryCode | null; // null = origin not stated by the source
  stock: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  /** Destinations this offer can be delivered to. Missing key = does not ship there. */
  destinations: Partial<Record<CountryCode, DestinationTerms>>;
  /** Optional reference price for a discount claim, with evidence text. */
  reference?: { price: Money; evidence: string };
  /** How many days before "now" this price was observed (demo clock). */
  observedDaysAgo: number;
  sourceUrl: string | null; // null for demo — we never link to invented sites
  /** Reference price only (e.g. a sample API's list price) — not a purchasable retailer offer. Never makes the best offer "uncertain". */
  informational?: boolean;
  source: DataSource;
}

export type TotalStatus =
  | "verified_total"
  | "estimated_total"
  | "partial_total"
  | "item_price_only"
  | "unavailable";

export interface City {
  id: string;
  name: string;
  country: CountryCode;
  /** City-centre reference point (public knowledge, low precision). */
  lat: number;
  lng: number;
}

export interface Store {
  id: string;
  retailerId: string;
  cityId: string;
  name: string;
  /** Fictional location offset from the city centre — demo only, not a real address. */
  lat: number;
  lng: number;
  fictional: true;
}

export interface Promotion {
  id: string;
  retailerId: string;
  storeIds: string[];
  productId: string | null;
  departmentSlug: string;
  title: string;
  promoPrice: Money;
  reference: { price: Money; evidence: string } | null;
  /** Relative to the demo clock so the prototype always has current examples. */
  startOffsetDays: number;
  endOffsetDays: number;
  scope: "in_store" | "online" | "both";
  pickup: boolean;
  terms: string;
  verification: "demo" | "verified" | "pending";
  source: DataSource;
}

// ---------------------------------------------------------------------------
// Catalogue views (what pages receive, from either the demo or the live source)
// ---------------------------------------------------------------------------

export interface ProductImage {
  url: string;
  alt: string;
  source: DataSource;
  licence?: string;
}

export interface RetailerRef {
  id: string;
  name: string;
  country: string | null;
}

export interface CatalogOffer extends Offer {
  retailer: RetailerRef;
  /** True when a permitted outbound link exists (served through /go/[offerId]). */
  clickable: boolean;
  /** When PriceAtlas last saw this offer in the source (ISO). */
  observedAt?: string;
  /** Timestamp the source itself gave for the record (ISO), if any. */
  sourceUpdatedAt?: string | null;
  /** Retailer-stated recommended/old price — shown as information only, never as a verified discount. */
  rrp?: Money | null;
  deliveryTime?: string | null;
}

export interface CatalogProduct extends Omit<Product, "brand"> {
  brand: string; // brand slug (demo) or brand name (live)
  brandName: string;
  images: ProductImage[];
  /** Small card-sized photo from the same source, when the source provides one (faster than images[0]). */
  thumbnailUrl?: string | null;
  offers: CatalogOffer[];
  siblings?: { slug: string; variant: string; condition: Condition; name: string }[];
  sourceCategory?: string | null;
  /** Model-family id (live data); variants of one family share it. */
  productId?: string;
}

/**
 * demo   = built-in fictional catalogue (works offline)
 * sample = FREE TEST MODE: products from the public DummyJSON API + sample retailer offers from a local CSV
 * live   = authorised real feeds (Awin) from Supabase
 */
export type CatalogMode = "demo" | "sample" | "live";
