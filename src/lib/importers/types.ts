import type { Condition, CostComponent, DestinationTerms } from "@/lib/types";
import type { StockStatus } from "./normalize";

/** Provider-neutral row sent to the database (pa_import_batch). Every importer produces these. */
export interface NormalizedRow {
  external_id: string;
  title: string;
  family_name: string;
  brand: string | null;
  mpn: string | null;
  gtin: string | null; // 14 digits, check digit verified
  condition: Condition;
  colour: string | null;
  size: string | null;
  /** Missing from older clients; SQL must continue accepting those rows. */
  pack_quantity?: number | null;
  pack_quantity_uncertain?: boolean;
  variant_label: string;
  description: string | null;
  category: string | null;
  department_slug: string | null;
  subcategory_slug: string | null;
  specs: Record<string, string>;
  keywords: string;
  parent_id: string | null;
  price_minor: number;
  currency: string;
  rrp_minor: number | null;
  vat_included: boolean;
  ship_from: string | null;
  stock: StockStatus;
  product_url: string | null; // retailer's own page (not used for outbound links)
  click_url: string; // permitted outbound (affiliate-tracked) link
  images: string[]; // https only, de-duplicated
  destinations: Record<string, DestinationTerms>;
  home_shipping_minor: number | null;
  delivery_time: string | null;
  source_updated_at: string | null;
}

export interface RowIssue {
  row: number;
  external_id?: string;
  severity: "error" | "warning";
  code: string;
  message: string;
  raw?: Record<string, string>;
}

export interface FeedContext {
  feedId: string;
  source: "awin";
  country: string; // feed's home market, e.g. "GB"
  currency: string; // expected currency
  vatIncluded: boolean;
  retailer: { external_id: string; name: string; country: string; website_domain?: string | null };
}

export const KNOWN_ZERO: CostComponent = { amountMinor: 0, basis: "verified", note: "Domestic delivery — no import charges." };
