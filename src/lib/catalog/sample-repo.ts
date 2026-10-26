/**
 * FREE TEST MODE repository: DummyJSON sample products + sample CSV offers.
 * Falls back to the built-in fictional catalogue (with a visible notice) if DummyJSON cannot be loaded.
 */
import { departments } from "@/data/departments";
import { fxSnapshot } from "@/data/fx";
import { fetchEcbRates } from "@/lib/importers/fx-ecb";
import { readObservations } from "@/lib/sample/io";
import { summarizeHistory, type PriceObservation } from "@/lib/price-history";
import { fxFromQuotes, type FxTable } from "@/lib/money";
import { buildIndex, searchProducts, suggestCorrection, type SearchIndex } from "@/lib/search";
import { getSampleCatalog, type SampleCatalog } from "@/lib/sample/loader";
import { DISPLAY_CURRENCIES, type Brand, type CatalogProduct, type Product } from "@/lib/types";
import { demoRepository } from "./demo-repo";
import type { CatalogMeta, CatalogRepository } from "./repository";

let indexFor: { catalog: SampleCatalog; index: SearchIndex; brands: Brand[] } | null = null;

function brandsOf(products: CatalogProduct[]): Brand[] {
  const m = new Map<string, Brand>();
  for (const p of products) if (p.brand && p.brandName) m.set(p.brand, { slug: p.brand, name: p.brandName, fictional: true });
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function load(): Promise<{ catalog: SampleCatalog; index: SearchIndex; brands: Brand[] } | null> {
  const catalog = await getSampleCatalog();
  if (!catalog.status.ok) return null;
  if (!indexFor || indexFor.catalog !== catalog) {
    const brands = brandsOf(catalog.products);
    indexFor = { catalog, brands, index: buildIndex(catalog.products as unknown as Product[], brands, departments) };
  }
  return indexFor;
}

// ECB reference rates are public; cache for 12 h, fall back to labelled demo rates.
let fxCache: { fx: FxTable; ok: boolean; at: number } | null = null;
async function sampleFx(): Promise<{ fx: FxTable; ok: boolean }> {
  if (fxCache && Date.now() - fxCache.at < 12 * 3_600_000) return fxCache;
  try {
    const ecb = await fetchEcbRates();
    const fx = fxFromQuotes(Object.fromEntries(ecb.rates.map((x) => [x.quote, x.rate])), ecb.asOf, "ECB euro reference rates", DISPLAY_CURRENCIES);
    if (!fx) throw new Error("missing rates");
    fxCache = { fx, ok: true, at: Date.now() };
  } catch {
    fxCache = { fx: fxSnapshot, ok: false, at: Date.now() - 11 * 3_600_000 }; // retry within the hour
  }
  return fxCache;
}

const fallbackNotice = (err: string | null) =>
  `Sample product API unavailable (${err ?? "unknown error"}). Showing the built-in fictional demo catalogue instead.`;

export const sampleRepository: CatalogRepository = {
  mode: "sample",
  async meta(): Promise<CatalogMeta> {
    const [l, fx] = await Promise.all([load(), sampleFx()]);
    if (!l) {
      const catalog = await getSampleCatalog();
      const m = await demoRepository.meta();
      return { ...m, mode: "sample", notice: fallbackNotice(catalog.status.error) };
    }
    const departmentCounts: Record<string, number> = {};
    const subcategoryCounts: Record<string, number> = {};
    const retailers = new Map<string, { id: string; name: string; country: string | null }>();
    let offerCount = 0;
    for (const p of l.catalog.products) {
      if (p.department) departmentCounts[p.department] = (departmentCounts[p.department] ?? 0) + 1;
      if (p.subcategory) subcategoryCounts[`${p.department}/${p.subcategory}`] = (subcategoryCounts[`${p.department}/${p.subcategory}`] ?? 0) + 1;
      for (const o of p.offers) {
        offerCount++;
        if (o.retailerId !== "dummyjson") retailers.set(o.retailer.id, o.retailer);
      }
    }
    const st = l.catalog.status;
    return {
      mode: "sample",
      departmentCounts,
      subcategoryCounts,
      productCount: l.catalog.products.length,
      offerCount,
      retailers: [...retailers.values()],
      fx: fx.fx,
      fxIsReference: fx.ok,
      storesAvailable: true, // fictional demo stores (labelled) keep the Local Deal Radar testable
      notice: st.source === "disk-cache" ? `DummyJSON could not be reached; showing the copy saved ${st.fetchedAt ? new Date(st.fetchedAt).toUTCString() : "earlier"}.` : null,
    };
  },
  async shelf({ department, limit }) {
    const l = await load();
    if (!l) return demoRepository.shelf({ department, limit });
    return l.catalog.products.filter((p) => !department || p.department === department).slice(0, limit);
  },
  async priceDrops(limit) {
    const l = await load();
    if (!l) return demoRepository.priceDrops(limit);
    return []; // DummyJSON "discountPercentage" is generated sample data, never shown as a real discount
  },
  async list({ department, subcategory, page, perPage }) {
    const l = await load();
    if (!l) return demoRepository.list({ department, subcategory, page, perPage });
    const all = l.catalog.products.filter((p) => p.department === department && (!subcategory || p.subcategory === subcategory));
    return { total: all.length, items: all.slice((page - 1) * perPage, page * perPage) };
  },
  async search(q, f) {
    const l = await load();
    if (!l) return demoRepository.search(q, f);
    const hits = searchProducts(l.index, q, { department: f.department, condition: f.condition, brand: f.brand });
    return {
      items: hits.map((h) => l.catalog.byId.get(h.product.id)!).filter(Boolean),
      suggestion: hits.length === 0 && q ? suggestCorrection(l.index, q) : null,
    };
  },
  async product(slug) {
    const l = await load();
    if (!l) return demoRepository.product(slug);
    return l.catalog.bySlug.get(slug) ?? null;
  },
  async byIds(ids) {
    const l = await load();
    if (!l) return demoRepository.byIds(ids);
    return ids.map((id) => l.catalog.byId.get(id)).filter((p): p is CatalogProduct => !!p);
  },
  async suggest(q) {
    const l = await load();
    if (!l) return demoRepository.suggest(q);
    if (q.trim().length < 2) return [];
    return searchProducts(l.index, q)
      .slice(0, 6)
      .map(({ product: p }) => {
        const v = l.catalog.byId.get(p.id)!;
        return { slug: v.slug, label: `${v.brandName ? `${v.brandName} ` : ""}${v.name}`, hint: departments.find((d) => d.slug === v.department)?.name ?? "" };
      });
  },
  async related(p, limit) {
    const l = await load();
    if (!l) return demoRepository.related(p, limit);
    const same = l.catalog.products.filter((x) => x.id !== p.id && x.subcategory === p.subcategory && x.department === p.department);
    return same.slice(0, limit);
  },
  async localOffers() {
    return null; // test mode has no merchant store data; the radar offers the labelled demo stores separately
  },
  async priceHistory(p) {
    const ids = new Set(p.offers.map((o) => o.id));
    return ((await readObservations()) as PriceObservation[]).filter((o) => ids.has(o.offerId));
  },
  async productsWithHistory(limit) {
    const l = await load();
    if (!l) return [];
    const obs = (await readObservations()) as PriceObservation[];
    const ids = [...new Set(obs.map((o) => o.productId).filter((x): x is string => !!x))];
    return ids
      .map((id) => l.catalog.byId.get(id))
      .filter((p): p is CatalogProduct => !!p && summarizeHistory(obs.filter((o) => o.productId === p.id)).sufficient)
      .slice(0, limit);
  },
  async brands() {
    const l = await load();
    if (!l) return demoRepository.brands();
    return l.brands.map((b) => ({ slug: b.slug, name: b.name }));
  },
};
