/**
 * Which catalogue the site shows.
 * Priority: admin switch (saved in .data/catalog-source.json) > CATALOG_SOURCE env var > "sample".
 * "live" is only honoured when Supabase is configured; otherwise the site falls back to "sample".
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CatalogMode } from "@/lib/types";

const MODES: CatalogMode[] = ["demo", "sample", "live"];
// turbopackIgnore: a run-time file, not a build input (keeps Next.js from tracing the whole project).
const file = () => path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "catalog-source.json");

let cache: { value: CatalogMode | null; at: number } | null = null;

export function readSourceOverride(): CatalogMode | null {
  if (cache && Date.now() - cache.at < 3000) return cache.value;
  let value: CatalogMode | null = null;
  try {
    const j = JSON.parse(readFileSync(file(), "utf8")) as { source?: string };
    if (MODES.includes(j.source as CatalogMode)) value = j.source as CatalogMode;
  } catch {
    /* no override */
  }
  cache = { value, at: Date.now() };
  return value;
}

/** Save the admin's choice. Throws on read-only hosting (e.g. serverless) — use the env var there. */
export function writeSourceOverride(source: CatalogMode | null) {
  mkdirSync(path.dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify({ source, savedAt: new Date().toISOString() }, null, 2));
  cache = null;
}

export function envSource(): CatalogMode {
  const v = process.env.CATALOG_SOURCE?.trim();
  return MODES.includes(v as CatalogMode) ? (v as CatalogMode) : "sample";
}

export function requestedSource(): CatalogMode {
  return readSourceOverride() ?? envSource();
}
