import { departments } from "@/data/departments";
import { shopCategories, shopCategoryHref } from "@/data/shop-categories";

/** Avoid offering empty catalog landing pages to search engines. No product URLs change. */
export function catalogSitemapPaths(counts: Readonly<Record<string, number>>): string[] {
  return [...new Set([
    ...shopCategories.filter(c => c.departments.some(d => (counts[d] ?? 0) > 0)).map(c => shopCategoryHref(c.slug)),
    ...departments.filter(d => (counts[d.slug] ?? 0) > 0).map(d => `/departments/${d.slug}`),
  ])];
}
