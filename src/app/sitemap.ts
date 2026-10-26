import type { MetadataRoute } from "next";
import { shopCategories } from "@/data/shop-categories";
import { indexingAllowed, siteUrl } from "@/lib/server/seo";

/** Public pages only; empty while indexing is not allowed. Product pages are added once real feeds are live. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexingAllowed()) return [];
  const base = siteUrl();
  const pages = ["/", "/compare", "/deals", "/search", "/departments", "/price-history", "/stores", "/about", "/privacy", "/contact"];
  return [...pages, ...shopCategories.map((c) => `/shop/${c.slug}`)].map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const }));
}
