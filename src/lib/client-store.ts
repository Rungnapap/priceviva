"use client";

/**
 * Browser-side preferences store (Phase 1: guest-only, persisted in localStorage).
 *
 * Uses useSyncExternalStore so server HTML renders with defaults and the browser
 * swaps in saved preferences after hydration — no hydration mismatches.
 * Phase 4 adds a signed-in source of truth (Supabase, row-level security) and
 * restores the *saved* area after login; the temporary area stays session-only.
 */
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { DEFAULT_PREFS, RADIUS_OPTIONS_KM, locationReducer, type LocationAction, type LocationPrefs, type RadiusKm } from "./location";
import type { CurrencyCode } from "./types";
import { mergeImport, type ImportResult } from "./portable-data";
import { MAX_ALERTS, MAX_NOTIFICATIONS, alertSchema, type AlertNotification, type PriceAlert } from "./alerts";

export type ThemeChoice = "system" | "light" | "dark";

export interface ClientState {
  location: LocationPrefs;
  currency: CurrencyCode;
  theme: ThemeChoice;
  saved: string[]; // product ids
  compare: string[]; // product ids (max 3)
  compareGroup: string | null; // department/subcategory of the current comparison
  alerts: PriceAlert[];
  notifications: AlertNotification[];
  /** Show a pop-up (toast) when an alert fires. */
  alertPopups: boolean;
  /**
   * Account id whose favourites and alerts are in this browser (null = a guest's own data). Used so one person's
   * data never shows up for, or gets copied into, someone else's account on a shared computer.
   */
  owner: string | null;
}

export const DEFAULT_STATE: ClientState = {
  location: DEFAULT_PREFS,
  currency: "SEK",
  theme: "system",
  saved: [],
  compare: [],
  compareGroup: null,
  alerts: [],
  notifications: [],
  alertPopups: true,
  owner: null,
};

const STORAGE_KEY = "priceatlas:v1";
const SESSION_KEY = "priceatlas:temp-area:v1";

// --- validation: never trust what is in storage --------------------------------
const country = z.enum(["SE", "DE", "GB"]);
const area = z.object({
  cityId: z.string().max(40),
  radiusKm: z.custom<RadiusKm>((v) => RADIUS_OPTIONS_KM.includes(v as RadiusKm)),
  place: z
    .object({
      label: z.string().min(1).max(120),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      country: z.string().max(2).nullable().optional().catch(null),
      source: z.enum(["search", "device", "city"]).optional().catch(undefined),
    })
    .nullable()
    .optional()
    .catch(null),
});
const currencyCode = z.enum(["SEK", "EUR", "GBP", "USD", "NOK", "DKK", "CHF", "CAD", "AUD", "JPY"]);
const notificationSchema = z.object({
  id: z.string().max(80),
  alertId: z.string().max(40),
  productName: z.string().max(200),
  productSlug: z.string().max(200),
  at: z.string().max(40),
  priceMinor: z.number(),
  currency: currencyCode,
  targetMinor: z.number(),
  retailer: z.string().max(200),
  demo: z.boolean(),
  read: z.boolean(),
});
const persisted = z.object({
  savedArea: area.nullable().catch(null),
  deliveryDestination: country.catch("SE"),
  currency: z.enum(["SEK", "EUR", "GBP", "USD", "NOK", "DKK", "CHF", "CAD", "AUD", "JPY"]).catch("SEK"),
  theme: z.enum(["system", "light", "dark"]).catch("system"),
  // Ids: short demo ids ("p01") or database UUIDs.
  saved: z.array(z.string().max(64)).max(200).catch([]),
  compare: z.array(z.string().max(64)).max(3).catch([]),
  compareGroup: z.string().max(120).nullable().catch(null),
  alerts: z.array(alertSchema).max(MAX_ALERTS).catch([]),
  notifications: z.array(notificationSchema).max(MAX_NOTIFICATIONS).catch([]),
  alertPopups: z.boolean().catch(true),
  owner: z.string().uuid().nullable().catch(null).optional(),
});

function load(): ClientState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const tmpRaw = window.sessionStorage.getItem(SESSION_KEY);
    const p = raw ? persisted.parse(JSON.parse(raw)) : null;
    const tmp = tmpRaw ? area.nullable().catch(null).parse(JSON.parse(tmpRaw)) : null;
    if (!p) return { ...DEFAULT_STATE, location: { ...DEFAULT_PREFS, temporaryArea: tmp } };
    return {
      location: { savedArea: p.savedArea, temporaryArea: tmp, deliveryDestination: p.deliveryDestination },
      currency: p.currency,
      theme: p.theme,
      saved: p.saved,
      compare: p.compare,
      compareGroup: p.compare.length ? (p.compareGroup ?? null) : null,
      alerts: p.alerts ?? [],
      notifications: p.notifications ?? [],
      alertPopups: p.alertPopups ?? true,
      owner: p.owner ?? null,
    };
  } catch {
    return DEFAULT_STATE; // storage blocked (private mode etc.) — app still works
  }
}

function persist(s: ClientState) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        savedArea: s.location.savedArea,
        deliveryDestination: s.location.deliveryDestination,
        currency: s.currency,
        theme: s.theme,
        saved: s.saved,
        compare: s.compare,
        compareGroup: s.compareGroup,
        alerts: s.alerts,
        notifications: s.notifications,
        alertPopups: s.alertPopups,
        owner: s.owner,
      }),
    );
    // Temporary area is per-tab session only, so it can never overwrite the saved default.
    if (s.location.temporaryArea) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s.location.temporaryArea));
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function applyTheme(theme: ThemeChoice) {
  if (typeof document === "undefined") return;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

// --- tiny external store --------------------------------------------------------
let state: ClientState | null = null;
const listeners = new Set<() => void>();

function get(): ClientState {
  if (state === null) {
    state = load();
    applyTheme(state.theme);
  }
  return state;
}

function set(next: ClientState) {
  state = next;
  persist(next);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      state = load();
      listeners.forEach((x) => x());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Non-React access for the account sync (src/components/account-sync.tsx). */
export const getClientState = (): ClientState => get();
export function subscribeClientState(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useClientState(): ClientState {
  return useSyncExternalStore(subscribe, get, () => DEFAULT_STATE);
}

/** True after hydration (lets UI avoid flashing defaults as if they were the user's choice). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export const actions = {
  location(action: LocationAction) {
    const s = get();
    set({ ...s, location: locationReducer(s.location, action) });
  },
  setCurrency(currency: CurrencyCode) {
    set({ ...get(), currency });
  },
  setTheme(theme: ThemeChoice) {
    set({ ...get(), theme });
    applyTheme(theme);
  },
  toggleSaved(id: string) {
    const s = get();
    set({ ...s, saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [...s.saved, id] });
  },
  /** Returns an error code ("type" = different product type, "max" = list full) instead of silently doing something unexpected. */
  toggleCompare(id: string, group: string): "type" | "max" | null {
    const s = get();
    if (s.compare.includes(id)) {
      const compare = s.compare.filter((x) => x !== id);
      set({ ...s, compare, compareGroup: compare.length ? s.compareGroup : null });
      return null;
    }
    if (s.compare.length > 0 && s.compareGroup && s.compareGroup !== group)
      return "type";
    if (s.compare.length >= 3) return "max";
    set({ ...s, compare: [...s.compare, id], compareGroup: group });
    return null;
  },
  removeFromCompare(id: string) {
    const s = get();
    const compare = s.compare.filter((x) => x !== id);
    set({ ...s, compare, compareGroup: compare.length ? s.compareGroup : null });
  },
  clearCompare() {
    set({ ...get(), compare: [], compareGroup: null });
  },
  /** Returns an error message when the alert can't be added. */
  addAlert(alert: PriceAlert): "max" | null {
    const s = get();
    if (s.alerts.length >= MAX_ALERTS) return "max";
    const others = s.alerts.filter((a) => !(a.productId === alert.productId && a.destination === alert.destination));
    set({ ...s, alerts: [...others, alert] });
    return null;
  },
  updateAlert(id: string, patch: Partial<Pick<PriceAlert, "targetMinor" | "currency" | "paused" | "emailEnabled">>) {
    const s = get();
    set({
      ...s,
      // Editing the target starts fresh, so the new target can notify.
      alerts: s.alerts.map((a) => (a.id === id ? { ...a, ...patch, ...(patch.targetMinor !== undefined ? { lastNotifiedMinor: null, lastNotifiedAt: null } : {}) } : a)),
    });
  },
  removeAlert(id: string) {
    const s = get();
    set({ ...s, alerts: s.alerts.filter((a) => a.id !== id), notifications: s.notifications.filter((n) => n.alertId !== id) });
  },
  applyAlertResults(updated: PriceAlert[], fresh: AlertNotification[]) {
    const s = get();
    const byId = new Map(updated.map((a) => [a.id, a]));
    set({
      ...s,
      alerts: s.alerts.map((a) => byId.get(a.id) ?? a),
      notifications: [...fresh, ...s.notifications].slice(0, MAX_NOTIFICATIONS),
    });
  },
  markNotificationsRead() {
    const s = get();
    set({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) });
  },
  clearNotifications() {
    set({ ...get(), notifications: [] });
  },
  setAlertPopups(on: boolean) {
    set({ ...get(), alertPopups: on });
  },
  /** Merges favourites and alerts from an exported file (see lib/portable-data). */
  importData(text: string): ImportResult {
    const s = get();
    const r = mergeImport(text, { saved: s.saved, alerts: s.alerts });
    if (r.ok) set({ ...s, saved: r.saved, alerts: r.alerts });
    return r;
  },
  /** Replaces favourites and alerts with a signed-in account's data (keeps this browser's alert check results). */
  setAccountData(owner: string, saved: string[], alerts: PriceAlert[]) {
    const s = get();
    const local = new Map(s.alerts.map((a) => [a.id, a]));
    const merged = alerts.map((a) => {
      const l = local.get(a.id);
      return l ? { ...a, lastNotifiedMinor: l.lastNotifiedMinor, lastNotifiedAt: l.lastNotifiedAt, lastCheckedAt: l.lastCheckedAt, lastBestMinor: l.lastBestMinor } : a;
    });
    const ids = new Set(merged.map((a) => a.id));
    set({ ...s, owner, saved: [...saved], alerts: merged, notifications: s.notifications.filter((n) => ids.has(n.alertId)) });
  },
  /** After logging out (or when another account signs in): remove the account's personal lists from this browser. */
  clearAccountData() {
    set({ ...get(), owner: null, saved: [], alerts: [], notifications: [] });
  },
  forgetEverything() {
    set({ ...DEFAULT_STATE });
    applyTheme("system");
  },
};
