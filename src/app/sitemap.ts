import type { MetadataRoute } from "next";
import { catalogSitemapPaths } from "@/lib/catalog-sitemap";
import { getRepository } from "@/lib/catalog/repository";
import { indexingAllowed, siteUrl } from "@/lib/server/seo";

/** Public pages only; empty while indexing is not allowed. Product pages are added once real feeds are live. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!indexingAllowed()) return [];
  const base = siteUrl();
  const pages = ["/", "/compare", "/deals", "/search", "/departments", "/price-history", "/stores", "/about", "/privacy", "/contact"];
  const counts = await getRepository().meta().then(m => m.departmentCounts).catch(() => ({}));
  return [...pages, ...catalogSitemapPaths(counts)].map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const }));
}
