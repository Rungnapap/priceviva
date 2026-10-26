import { catalogMode } from "./env";

/**
 * Search engines may index the site only when the owner turns it on (ALLOW_INDEXING=true) AND the catalogue
 * shows real retailer data (live mode). Demo and test data are never offered to search engines.
 */
export function indexingAllowed(env: Record<string, string | undefined> = process.env, mode: string = catalogMode()): boolean {
  return env.ALLOW_INDEXING === "true" && mode === "live";
}

export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
