/** Demo catalogue adapter — wraps the fictional Phase 1 data in the shared CatalogProduct view. */
import { brands, getBrand, getProduct, getRetailer, offersFor, products } from "@/data/catalog";
import { departments } from "@/data/departments";
import { fxSnapshot } from "@/data/fx";
import { buildIndex, searchProducts, suggestCorrection, type SearchIndex } from "@/lib/search";
import { bestVerifiedDiscount } from "@/lib/catalog-queries";
import type { CatalogProduct, Product } from "@/lib/types";
import type { CatalogRepository } from "./repository";

let index: SearchIndex | null = null;
const idx = () => (index ??= buildIndex(products, brands, departments));

export function toDemoView(p: Product): CatalogProduct {
  return {
    ...p,
    brandName: getBrand(p.brand)?.name ?? p.brand,
    images: [], // demo products use labeled illustrations, never photos of real products
    offers: offersFor(p.id).map((o) => {
      const r = getRetailer(o.retailerId);
      return { ...o, retailer: { id: o.retailerId, name: r?.name ?? o.retailerId, country: r?.country ?? null }, clickable: false };
    }),
    siblings: products
      .filter((x) => x.model === p.model && x.id !== p.id)
      .map((x) => ({ slug: x.slug, variant: x.variant, condition: x.condition, name: x.name })),
  };
}

const views = () => products.map(toDemoView);

export const demoRepository: CatalogRepository = {
  mode: "demo",
  async meta() {
    const departmentCounts: Record<string, number> = {};
    const subcategoryCounts: Record<string, number> = {};
    for (const p of products) {
      departmentCounts[p.department] = (departmentCounts[p.department] ?? 0) + 1;
      const k = `${p.department}/${p.subcategory}`;
      subcategoryCounts[k] = (subcategoryCounts[k] ?? 0) + 1;
    }
    const { retailers } = await import("@/data/catalog");
    return {
      mode: "demo",
      departmentCounts,
      subcategoryCounts,
      productCount: products.length,
      offerCount: products.reduce((n, p) => n + offersFor(p.id).length, 0),
      retailers: retailers.map((r) => ({ id: r.id, name: r.name, country: r.country })),
      fx: fxSnapshot,
      fxIsReference: false,
      storesAvailable: true,
    };
  },
  async shelf({ department, limit }) {
    return views().filter((p) => !department || p.department === department).slice(0, limit);
  },
  async priceDrops(limit) {
    return views().filter((p) => bestVerifiedDiscount(p) !== null).slice(0, limit);
  },
  async list({ department, subcategory, page, perPage }) {
    const all = views().filter((p) => p.department === department && (!subcategory || p.subcategory === subcategory));
    return { total: all.length, items: all.slice((page - 1) * perPage, page * perPage) };
  },
  async search(q, f) {
    const hits = searchProducts(idx(), q, { department: f.department, condition: f.condition, brand: f.brand });
    return { items: hits.map((h) => toDemoView(h.product)), suggestion: hits.length === 0 && q ? suggestCorrection(idx(), q) : null };
  },
  async product(slug) {
    const p = getProduct(slug);
    return p && p.slug === slug ? toDemoView(p) : null;
  },
  async byIds(ids) {
    return ids.map((id) => getProduct(id)).filter((p): p is Product => !!p).map(toDemoView);
  },
  async suggest(q) {
    if (q.trim().length < 2) return [];
    return searchProducts(idx(), q)
      .slice(0, 6)
      .map(({ product: p }) => ({ slug: p.slug, label: `${getBrand(p.brand)?.name ?? ""} ${p.name}`, hint: p.variant }));
  },
  async related(p, limit) {
    return views().filter((x) => x.subcategory === p.subcategory && x.id !== p.id && x.model !== p.model).slice(0, limit);
  },
  async brands() {
    return brands.map((b) => ({ slug: b.slug, name: b.name }));
  },
  async localOffers() {
    return null; // fictional catalogue: no merchant store data (demo stores are handled separately and labelled)
  },
  async priceHistory() {
    return []; // the fictional catalogue has no recorded history and none is generated
  },
  async productsWithHistory() {
    return [];
  },
};
