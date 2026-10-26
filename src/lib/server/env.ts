/**
 * Server-side configuration. Secrets are read ONLY here, at request/run time, and never
 * passed to client components. Nothing in this file may be imported by a "use client" module.
 */
import type { CatalogMode } from "@/lib/types";
import { requestedSource } from "./catalog-source";

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const serverEnv = {
  /** What the admin switch / CATALOG_SOURCE asks for (before checking that it is usable). */
  get catalogSource(): CatalogMode {
    return requestedSource();
  },
  get supabaseUrl() {
    return read("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/+$/, "");
  },
  get supabaseAnonKey() {
    return read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceKey() {
    return read("SUPABASE_SERVICE_ROLE_KEY");
  },
  get awinApiKey() {
    return read("AWIN_DATAFEED_API_KEY");
  },
  get awinPublisherId() {
    return read("AWIN_PUBLISHER_ID");
  },
  get cronSecret() {
    return read("CRON_SECRET");
  },
  get adminPasswordHash() {
    return read("ADMIN_PASSWORD_HASH");
  },
  get adminSessionSecret() {
    return read("ADMIN_SESSION_SECRET");
  },
  get maxEnabledFeeds() {
    const n = Number(read("AWIN_MAX_ENABLED_FEEDS") ?? "1");
    return Number.isInteger(n) && n >= 1 && n <= 50 ? n : 1;
  },
  get maxRowsPerFeed() {
    const n = Number(read("IMPORT_MAX_ROWS_PER_FEED") ?? "50000");
    return Number.isInteger(n) && n >= 1 ? n : 50000;
  },
};

/** "live" only when requested AND the database is configured; otherwise the labelled sample/demo source. */
export function catalogMode(): CatalogMode {
  const want = serverEnv.catalogSource;
  if (want === "live") return serverEnv.supabaseUrl && serverEnv.supabaseAnonKey ? "live" : "sample";
  return want;
}

export function configStatus() {
  return {
    catalogSourceRequested: serverEnv.catalogSource,
    catalogMode: catalogMode(),
    supabaseUrl: !!serverEnv.supabaseUrl,
    supabaseAnonKey: !!serverEnv.supabaseAnonKey,
    supabaseServiceKey: !!serverEnv.supabaseServiceKey,
    awinApiKey: !!serverEnv.awinApiKey,
    awinPublisherId: !!serverEnv.awinPublisherId,
    cronSecret: !!serverEnv.cronSecret,
    adminConfigured: !!serverEnv.adminPasswordHash && !!serverEnv.adminSessionSecret,
    maxEnabledFeeds: serverEnv.maxEnabledFeeds,
    maxRowsPerFeed: serverEnv.maxRowsPerFeed,
  };
}

/** Remove anything that looks like a credential before a message is logged or shown. */
export function redact(text: string): string {
  let out = text.replace(/apikey\/[^/\s?"']+/gi, "apikey/[redacted]");
  // Supabase access/refresh tokens and keys (JWT, sb_secret_/sb_publishable_) never appear in messages.
  out = out.replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]+/g, "[token]").replace(/sb_(secret|publishable)_[\w-]+/g, "[key]");
  for (const secret of [serverEnv.awinApiKey, serverEnv.supabaseServiceKey, serverEnv.supabaseAnonKey, serverEnv.cronSecret]) {
    if (secret && secret.length >= 8) out = out.split(secret).join("[redacted]");
  }
  return out;
}
