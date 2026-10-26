/** Live catalogue adapter — reads imported retailer data from Supabase through read-only pa_catalog_* functions. */
import { fxSnapshot } from "@/data/fx";
import { rpc } from "@/lib/server/supabase-rpc";
import type { LocalOfferJson } from "@/lib/local-offers";
import type { PriceObservation } from "@/lib/price-history";
import { fxFromQuotes, type FxTable } from "@/lib/money";
import { DISPLAY_CURRENCIES, type CatalogOffer, type CatalogProduct, type RetailerRef } from "@/lib/types";
import type { CatalogMeta, CatalogRepository } from "./repository";

const REVALIDATE = 300; // seconds; imports run at most a few times a day

type Raw = Omit<CatalogProduct, "offers" | "keywords" | "art" | "source"> & { offers: (Omit<CatalogOffer, "observedDaysAgo">)[] };

const DAY = 86_400_000;

/** Fill view defaults and compute freshness at read time (never from a cached number). */
export function fromLive(raw: Raw): CatalogProduct {
  const now = Date.now();
  return {
    ...raw,
    brand: raw.brand ?? "",
    brandName: raw.brand ?? "",
    keywords: [],
    art: "",
    source: "awin",
    images: (raw.images ?? []).filter((i) => typeof i.url === "string" && i.url.startsWith("https://")),
    offers: (raw.offers ?? []).map((o) => ({
      ...o,
      // The database function predates the PriceViva rebrand; keep the SQL unchanged and fix the visible wording here.
      reference: o.reference ? { ...o.reference, evidence: o.reference.evidence.replace(/PriceAtlas/g, "PriceViva") } : undefined,
      sourceUrl: null, // outbound links are served only through /go/[offerId]
      observedDaysAgo: o.observedAt ? Math.max(0, Math.floor((now - new Date(o.observedAt).getTime()) / DAY)) : 999,
    })),
  };
}

const anon = <T>(fn: string, p: unknown) => rpc<T>(fn, p, { role: "anon", revalidate: REVALIDATE });

export const liveRepository: CatalogRepository = {
  mode: "live",
  async meta(): Promise<CatalogMeta> {
    const m = await anon<{
      departments: Record<string, number>;
      subcategories: Record<string, number>;
      products: number;
      offers: number;
      retailers: RetailerRef[];
      fx: { base: "EUR"; asOf: string | null; source: string | null; rates: Record<string, number> | null } | null;
      stores: number;
    }>("pa_catalog_meta", {});
    const ecb = m.fx?.rates && m.fx.asOf ? fxFromQuotes(m.fx.rates, m.fx.asOf, "ECB euro reference rates", DISPLAY_CURRENCIES) : null;
    const haveFx = ecb !== null;
    const fx: FxTable = ecb ?? { ...fxSnapshot, label: "Demo reference rates — ECB rates not loaded yet" };
    return {
      mode: "live",
      departmentCounts: m.departments ?? {},
      subcategoryCounts: m.subcategories ?? {},
      productCount: m.products ?? 0,
      offerCount: m.offers ?? 0,
      retailers: m.retailers ?? [],
      fx,
      fxIsReference: haveFx,
      storesAvailable: (m.stores ?? 0) > 0,
    };
  },
  async shelf({ department, limit }) {
    const r = await anon<{ items: Raw[] }>("pa_catalog_list", { department: department ?? null, limit });
    return r.items.map(fromLive);
  },
  async priceDrops(limit) {
    return (await anon<Raw[]>("pa_catalog_price_drops", { limit })).map(fromLive);
  },
  async list({ department, subcategory, page, perPage }) {
    const r = await anon<{ total: number; items: Raw[] }>("pa_catalog_list", {
      department,
      subcategory: subcategory || null,
      limit: perPage,
      offset: (page - 1) * perPage,
    });
    return { total: r.total, items: r.items.map(fromLive) };
  },
  async search(q, f) {
    const items = await anon<Raw[]>("pa_catalog_search", { q, department: f.department ?? null, condition: f.condition ?? null });
    return { items: items.map(fromLive), suggestion: null };
  },
  async product(slug) {
    const p = await anon<Raw | null>("pa_catalog_product", { slug });
    return p ? fromLive(p) : null;
  },
  async byIds(ids) {
    const uuids = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50);
    if (uuids.length === 0) return [];
    const items = await rpc<Raw[]>("pa_catalog_by_ids", { ids: uuids }, { role: "anon", revalidate: false });
    const byId = new Map(items.map((i) => [i.id, fromLive(i)]));
    return uuids.map((id) => byId.get(id)).filter((p): p is CatalogProduct => !!p);
  },
  async suggest(q) {
    if (q.trim().length < 2) return [];
    return anon("pa_catalog_suggest", { q: q.slice(0, 80) });
  },
  async related(p, limit) {
    if (!p.department) return [];
    const r = await anon<{ items: Raw[] }>("pa_catalog_list", { department: p.department, subcategory: p.subcategory || null, limit: limit + 4 });
    return r.items.map(fromLive).filter((x) => x.id !== p.id && x.productId !== p.productId).slice(0, limit);
  },
  async brands() {
    return [];
  },
  async localOffers(center, radiusKm) {
    return rpc<LocalOfferJson[]>("pa_catalog_local_offers", { lat: center.lat, lng: center.lng, radius_km: radiusKm }, { role: "anon", revalidate: 300 });
  },
  async priceHistory(p) {
    const rows = await anon<PriceObservation[]>("pa_catalog_price_history", { slug: p.slug });
    return rows.map((r) => ({ ...r, productId: p.id }));
  },
  async productsWithHistory() {
    return null; // listing needs a dedicated index; each product page shows its own recorded history
  },
};
