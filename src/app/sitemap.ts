import type { MetadataRoute } from "next";
import { departments } from "@/data/departments";
import { shopCategories } from "@/data/shop-categories";
import { getRepository } from "@/lib/catalog/repository";
import { indexingAllowed, siteUrl } from "@/lib/server/seo";

// Rebuilt at most every 6 hours; imports run once a day.
export const revalidate = 21600;

const PAGE = 5000;
// One sitemap file may list at most 50,000 addresses.
const MAX_PRODUCTS = 45_000;

/**
 * Public pages, category pages that have products, and every product with an active offer. Empty while indexing
 * is not allowed. Search results, comparisons and account pages are left out on purpose (endless or private URLs).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!indexingAllowed()) return [];
  const base = siteUrl();
  const repo = getRepository();
  const meta = await repo.meta().catch(() => null);
  const hasProducts = (slug: string) => (meta?.departmentCounts[slug] ?? 0) > 0;

  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    ...["/departments", "/about", "/contact", "/privacy"].map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...shopCategories
      .filter((c) => !meta || c.departments.some(hasProducts))
      .map((c) => ({ url: `${base}/shop/${c.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...departments
      .filter((d) => !meta || hasProducts(d.slug))
      .map((d) => ({ url: `${base}/departments/${d.slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
  ];

  // Products, read in pages. If the database is slow or the sitemap function is missing, the sitemap still
  // lists the pages above (search engines retry later) instead of failing.
  const products: string[] = [];
  try {
    let after: string | null = null;
    while (products.length < MAX_PRODUCTS) {
      const slugs: string[] | null = await repo.productSlugs(after, PAGE);
      if (!slugs || slugs.length === 0) break;
      products.push(...slugs);
      if (slugs.length < PAGE) break;
      after = slugs[slugs.length - 1]!;
    }
  } catch {
    /* keep what was read */
  }

  return [
    ...pages,
    ...products.slice(0, MAX_PRODUCTS).map((slug) => ({ url: `${base}/product/${encodeURIComponent(slug)}`, changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}
