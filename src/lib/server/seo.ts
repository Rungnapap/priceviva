import { catalogMode } from "./env";

/**
 * Search engines may index the site only when the owner turns it on (ALLOW_INDEXING=true) AND the catalogue
 * shows real retailer data (live mode). Demo and test data are never offered to search engines.
 */
export function indexingAllowed(env: Record<string, string | undefined> = process.env, mode: string = catalogMode()): boolean {
  return env.ALLOW_INDEXING === "true" && mode === "live";
}

/**
 * The public address used in the sitemap, canonical links and share previews.
 * NEXT_PUBLIC_SITE_URL wins; on Vercel the production domain (set by Vercel automatically) is the fallback,
 * so search engines are never given "localhost" addresses.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/\/+$/, "");
  // A localhost value copied from .env.local into the hosting settings must not reach search engines.
  const isLocal = !!explicit && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(explicit);
  if (explicit && !(isLocal && vercel)) return explicit;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
