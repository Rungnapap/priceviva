/**
 * Catalogue data access for server components and route handlers.
 * Three interchangeable sources behind one interface:
 *   - sample: FREE TEST MODE — DummyJSON sample products + sample CSV offers (default)
 *   - demo: the built-in fictional catalogue (offline fallback)
 *   - live: imported retailer data in Supabase (CATALOG_SOURCE=live + Supabase URL/anon key)
 * They are never mixed: in live mode no demo or sample product, retailer, store or promotion is shown.
 */
import type { FxTable } from "@/lib/money";
import type { CatalogMode, CatalogProduct, Condition, RetailerRef } from "@/lib/types";
import type { LocalOfferJson } from "@/lib/local-offers";
import type { PriceObservation } from "@/lib/price-history";
import { catalogMode } from "@/lib/server/env";
import { demoRepository } from "./demo-repo";
import { liveRepository } from "./live-repo";
import { sampleRepository } from "./sample-repo";

export interface CatalogMeta {
  mode: CatalogMode;
  departmentCounts: Record<string, number>;
  subcategoryCounts: Record<string, number>; // "dept/sub" -> n
  productCount: number;
  offerCount: number;
  retailers: RetailerRef[];
  fx: FxTable;
  /** True when FX came from a dated reference source (ECB); false = labeled demo rates. */
  fxIsReference: boolean;
  /** Verified physical stores exist (Local Deal Radar). */
  storesAvailable: boolean;
  /** A visible notice for visitors, e.g. "sample API unavailable, showing cached copy". */
  notice?: string | null;
}

export interface SearchFilters {
  department?: string;
  condition?: Condition;
  brand?: string;
}

export interface CatalogRepository {
  mode: CatalogMode;
  meta(): Promise<CatalogMeta>;
  shelf(opts: { department?: string; limit: number }): Promise<CatalogProduct[]>;
  priceDrops(limit: number): Promise<CatalogProduct[]>;
  list(opts: { department: string; subcategory?: string; page: number; perPage: number }): Promise<{ total: number; items: CatalogProduct[] }>;
  search(q: string, filters: SearchFilters): Promise<{ items: CatalogProduct[]; suggestion: string | null }>;
  product(slug: string): Promise<CatalogProduct | null>;
  byIds(ids: string[]): Promise<CatalogProduct[]>;
  suggest(q: string): Promise<{ slug: string; label: string; hint: string }[]>;
  related(p: CatalogProduct, limit: number): Promise<CatalogProduct[]>;
  brands(): Promise<{ slug: string; name: string }[]>;
  /**
   * Merchant-supplied / verified local offers within the radius, with real coordinates.
   * null = this mode has no merchant data source (demo and test mode).
   */
  localOffers(center: { lat: number; lng: number }, radiusKm: number): Promise<LocalOfferJson[] | null>;
  /** Recorded price observations for a product (never generated). */
  priceHistory(p: CatalogProduct): Promise<PriceObservation[]>;
  /** Products that already have a chartable history; null = not listable in this mode (open a product page). */
  productsWithHistory(limit: number): Promise<CatalogProduct[] | null>;
}

export function getRepository(): CatalogRepository {
  const mode = catalogMode();
  return mode === "live" ? liveRepository : mode === "sample" ? sampleRepository : demoRepository;
}
