import type { MetadataRoute } from "next";
import { indexingAllowed, siteUrl } from "@/lib/server/seo";

// Blocked until the owner enables indexing and real retailer data is live (see lib/server/seo.ts).
export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/go/", "/auth/", "/account", "/saved", "/alerts", "/login", "/signup", "/forgot-password", "/reset-password", "/unsubscribe"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
