/**
 * Keeping a signed-in visitor's favourites and price alerts in their account (pure logic; the browser part is
 * src/components/account-sync.tsx). The browser list stays the working copy, so every existing page keeps
 * working unchanged; changes are sent to Supabase as small diffs and the account's answer becomes the new copy.
 */
import type { PriceAlert } from "./alerts";
import type { CountryCode, CurrencyCode } from "./types";

/** Alert as stored in the account (no browser-only check results). */
export interface AccountAlert {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  targetMinor: number;
  currency: CurrencyCode;
  destination: CountryCode;
  paused: boolean;
  emailEnabled: boolean;
}

export interface Snapshot {
  saved: string[];
  alerts: AccountAlert[];
}

export interface SyncPayload {
  saved_add: string[];
  saved_remove: string[];
  alerts_upsert: AccountAlert[];
  alerts_remove: string[];
}

export function toAccountAlert(a: PriceAlert): AccountAlert {
  return {
    id: a.id,
    productId: a.productId,
    productName: a.productName.slice(0, 200) || a.productSlug,
    productSlug: a.productSlug,
    targetMinor: a.targetMinor,
    currency: a.currency,
    destination: a.destination,
    paused: a.paused,
    emailEnabled: a.emailEnabled ?? true,
  };
}

/** Server answer → browser alert (check results start empty; the browser fills them in). */
export function fromAccountAlert(a: AccountAlert & { createdAt?: string }): PriceAlert {
  return {
    ...a,
    createdAt: a.createdAt ?? new Date().toISOString(),
    lastNotifiedMinor: null,
    lastNotifiedAt: null,
    lastCheckedAt: null,
    lastBestMinor: null,
  };
}

const same = (a: AccountAlert, b: AccountAlert) =>
  a.productId === b.productId &&
  a.productName === b.productName &&
  a.productSlug === b.productSlug &&
  a.targetMinor === b.targetMinor &&
  a.currency === b.currency &&
  a.destination === b.destination &&
  a.paused === b.paused &&
  a.emailEnabled === b.emailEnabled;

/** What changed in the browser since the last copy confirmed by the account. */
export function diff(prev: Snapshot, next: Snapshot): SyncPayload {
  const prevSaved = new Set(prev.saved);
  const nextSaved = new Set(next.saved);
  const prevAlerts = new Map(prev.alerts.map((a) => [a.id, a]));
  const nextIds = new Set(next.alerts.map((a) => a.id));
  return {
    saved_add: next.saved.filter((id) => !prevSaved.has(id)),
    saved_remove: prev.saved.filter((id) => !nextSaved.has(id)),
    alerts_upsert: next.alerts.filter((a) => {
      const p = prevAlerts.get(a.id);
      return !p || !same(p, a);
    }),
    alerts_remove: prev.alerts.filter((a) => !nextIds.has(a.id)).map((a) => a.id),
  };
}

export const isEmpty = (p: SyncPayload) => !p.saved_add.length && !p.saved_remove.length && !p.alerts_upsert.length && !p.alerts_remove.length;

/**
 * First sync after signing in. When this browser's lists belong to nobody (a guest) or to this same account, they
 * are added to the account — nothing a guest saved is lost. When they belong to a DIFFERENT account (shared
 * computer), they are not copied: that person's data stays theirs, and the browser shows this account's data.
 * On a conflict (same product and country), the alert already in the account wins.
 */
export function firstSync(local: Snapshot, owner: string | null, userId: string, server: Snapshot): SyncPayload {
  const empty: SyncPayload = { saved_add: [], saved_remove: [], alerts_upsert: [], alerts_remove: [] };
  if (owner !== null && owner !== userId) return empty;
  const serverSaved = new Set(server.saved);
  const serverIds = new Set(server.alerts.map((a) => a.id));
  const serverKeys = new Set(server.alerts.map((a) => `${a.productId}|${a.destination}`));
  return {
    ...empty,
    saved_add: local.saved.filter((id) => !serverSaved.has(id)).slice(0, 200),
    alerts_upsert: local.alerts.filter((a) => !serverIds.has(a.id) && !serverKeys.has(`${a.productId}|${a.destination}`)).slice(0, 50),
  };
}
