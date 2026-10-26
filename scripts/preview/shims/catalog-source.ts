// Sandbox preview: no admin switch file in the browser; mode comes from the injected env.
import type { CatalogMode } from "@/lib/types";
export const readSourceOverride = (): CatalogMode | null => null;
export const writeSourceOverride = () => { throw new Error("not available in preview"); };
export const envSource = (): CatalogMode => (process.env.CATALOG_SOURCE as CatalogMode) ?? "sample";
export const requestedSource = envSource;
