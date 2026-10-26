/**
 * Loads the FREE TEST MODE catalogue: DummyJSON products + sample offers from the local CSV.
 * - Fetched automatically on first use and refreshed every SAMPLE_REFRESH_HOURS (default 6).
 * - If DummyJSON is unreachable, the last good copy on disk (.data/) is used; if there is none,
 *   status.ok is false and the site falls back to the built-in fictional catalogue with a notice.
 */
import { DUMMYJSON_PRODUCTS_URL, mapDummyProduct, parseDummyResponse, type SampleIssue } from "./dummyjson";
import { readDummyCache, readObservations, readSampleOffersCsv, writeDummyCache, writeObservations } from "./io";
import { recordObservations, type PriceObservation } from "@/lib/price-history";
import { importSampleOffers, type SampleOfferImport } from "./sample-offers";
import type { CatalogProduct } from "@/lib/types";

export interface SampleStatus {
  ok: boolean;
  source: "api" | "disk-cache" | "none";
  fetchedAt: string | null;
  productCount: number;
  error: string | null;
  issues: SampleIssue[];
  offers: Omit<SampleOfferImport, "offersByProduct"> | null;
  csvFound: boolean;
}

export interface SampleCatalog {
  products: CatalogProduct[];
  bySlug: Map<string, CatalogProduct>;
  byId: Map<string, CatalogProduct>;
  status: SampleStatus;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher = (url, init) => fetch(url, init);
/** Tests can inject a fake fetch. */
export function setSampleFetcher(f: Fetcher | null) {
  fetcher = f ?? ((url, init) => fetch(url, init));
  state = null;
}

let state: { catalog: SampleCatalog; loadedAt: number } | null = null;
let inflight: Promise<SampleCatalog> | null = null;

const ttlMs = () => {
  const h = Number(process.env.SAMPLE_REFRESH_HOURS ?? "6");
  return (Number.isFinite(h) && h > 0 ? h : 6) * 3_600_000;
};

async function build(): Promise<SampleCatalog> {
  let json: unknown = null;
  let source: SampleStatus["source"] = "none";
  let fetchedAt: string | null = null;
  let error: string | null = null;

  try {
    const res = await fetcher(DUMMYJSON_PRODUCTS_URL, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`DummyJSON answered HTTP ${res.status}`);
    json = await res.json();
    parseDummyResponse(json); // validate before caching
    source = "api";
    fetchedAt = new Date().toISOString();
    await writeDummyCache(json);
  } catch (e) {
    error = `Could not fetch sample products from DummyJSON: ${(e as Error).message}`;
    const cached = await readDummyCache();
    if (cached) {
      json = cached.json;
      source = "disk-cache";
      fetchedAt = cached.savedAt;
    }
  }

  if (!json) {
    return { products: [], bySlug: new Map(), byId: new Map(), status: { ok: false, source, fetchedAt, productCount: 0, error, issues: [], offers: null, csvFound: false } };
  }

  const { products: raw, issues } = parseDummyResponse(json);
  const products: CatalogProduct[] = [];
  for (const d of raw) {
    const m = mapDummyProduct(d, fetchedAt ?? new Date().toISOString());
    issues.push(...m.issues);
    products.push(m.product);
  }

  const csv = await readSampleOffersCsv();
  let offers: SampleStatus["offers"] = null;
  if (csv) {
    const imp = await importSampleOffers(csv, new Set(products.map((p) => p.id)), fetchedAt ?? new Date().toISOString());
    for (const p of products) {
      const extra = imp.offersByProduct.get(p.id);
      if (extra) p.offers = [...extra, ...p.offers];
    }
    const { offersByProduct: _unused, ...rest } = imp;
    void _unused;
    offers = rest;
  }

  // Record what the sample offers cost right now (real observations of demonstration data — see price-history.ts).
  if (csv) {
    try {
      const before = (await readObservations()) as PriceObservation[];
      const after = recordObservations(before, products, new Date(), "sample");
      if (after !== before) await writeObservations(after);
    } catch {
      /* history is optional */
    }
  }

  return {
    products,
    bySlug: new Map(products.map((p) => [p.slug, p])),
    byId: new Map(products.map((p) => [p.id, p])),
    status: { ok: true, source, fetchedAt, productCount: products.length, error, issues, offers, csvFound: csv !== null },
  };
}

export async function getSampleCatalog(opts: { force?: boolean } = {}): Promise<SampleCatalog> {
  const fresh = state && Date.now() - state.loadedAt < (state.catalog.status.source === "api" ? ttlMs() : 5 * 60_000);
  if (!opts.force && fresh && state) return state.catalog;
  inflight ??= build()
    .then((catalog) => {
      state = { catalog, loadedAt: Date.now() };
      return catalog;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
