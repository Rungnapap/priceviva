/**
 * Moving browser data between devices today, and into an account later.
 *
 * Guests keep favourites, the comparison list and price alerts in their browser. "Export" writes them to a JSON
 * file; "Import" merges such a file into this browser. When accounts exist (Supabase Auth — see
 * docs/ACCOUNTS.md), the same `mergeImport` runs once on first sign-in to move browser data into the account,
 * so nothing a guest saved is lost. Imported files are untrusted: everything is validated and capped.
 */
import { z } from "zod";
import { MAX_ALERTS, alertSchema, type PriceAlert } from "./alerts";

export const EXPORT_FORMAT = "priceviva-export";
export const EXPORT_VERSION = 1;
export const MAX_FAVOURITES = 200;
export const MAX_IMPORT_BYTES = 512 * 1024;

const id = z.string().min(1).max(64);

export interface PortableData {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  favourites: string[];
  alerts: PriceAlert[];
  preferences: { deliveryDestination: string; currency: string; theme: string };
}

export function exportSnapshot(
  s: { saved: string[]; alerts: PriceAlert[]; currency: string; theme: string; location: { deliveryDestination: string } },
  now = new Date(),
): PortableData {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    favourites: [...s.saved],
    alerts: s.alerts.map((a) => ({ ...a })),
    preferences: { deliveryDestination: s.location.deliveryDestination, currency: s.currency, theme: s.theme },
  };
}

// v1 files, plus the older v0.5 export (`{ exportedAt, saved, alerts?, location, ... }`).
const v1 = z.object({ format: z.literal(EXPORT_FORMAT), version: z.literal(1), favourites: z.array(z.unknown()), alerts: z.array(z.unknown()).optional() });
const legacy = z.object({ exportedAt: z.string(), saved: z.array(z.unknown()), alerts: z.array(z.unknown()).optional() });

export type ImportResult =
  | { ok: true; saved: string[]; alerts: PriceAlert[]; addedFavourites: number; addedAlerts: number; skipped: number }
  | { ok: false; error: "too_large" | "not_json" | "unknown_format" };

/** Merges an exported file into existing data. Existing items win; nothing is deleted. */
export function mergeImport(text: string, existing: { saved: string[]; alerts: PriceAlert[] }): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: "too_large" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "not_json" };
  }
  const a = v1.safeParse(raw);
  const b = a.success ? null : legacy.safeParse(raw);
  if (!a.success && !b?.success) return { ok: false, error: "unknown_format" };
  const favIn = a.success ? a.data.favourites : b!.success ? b!.data.saved : [];
  const alertsIn = (a.success ? a.data.alerts : b!.success ? b!.data.alerts : undefined) ?? [];

  let skipped = 0;
  const saved = [...existing.saved];
  let addedFavourites = 0;
  for (const f of favIn) {
    const p = id.safeParse(f);
    if (!p.success) { skipped++; continue; }
    if (saved.includes(p.data)) continue;
    if (saved.length >= MAX_FAVOURITES) { skipped++; continue; }
    saved.push(p.data);
    addedFavourites++;
  }

  const alerts = [...existing.alerts];
  let addedAlerts = 0;
  for (const x of alertsIn) {
    const p = alertSchema.safeParse(x);
    if (!p.success) { skipped++; continue; }
    if (alerts.some((e) => e.id === p.data.id || (e.productId === p.data.productId && e.destination === p.data.destination))) continue;
    if (alerts.length >= MAX_ALERTS) { skipped++; continue; }
    // Re-arm: an imported alert notifies again on this device rather than assuming it already did.
    alerts.push({ ...p.data, lastNotifiedMinor: null, lastNotifiedAt: null, lastCheckedAt: null, lastBestMinor: null });
    addedAlerts++;
  }
  return { ok: true, saved, alerts, addedFavourites, addedAlerts, skipped };
}
