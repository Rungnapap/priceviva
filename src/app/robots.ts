import type { MetadataRoute } from "next";
import { indexingAllowed, siteUrl } from "@/lib/server/seo";

// Read the setting on every request (tiny file), not once at build time, so switching ALLOW_INDEXING takes effect.
export const dynamic = "force-dynamic";

// Blocked until the owner enables indexing and real retailer data is live (see lib/server/seo.ts).
export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/go/", "/auth/", "/account", "/saved", "/alerts", "/login", "/signup", "/forgot-password", "/reset-password", "/unsubscribe"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
