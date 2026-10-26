/**
 * Price-drop alerts (guest version: stored in this browser).
 *
 * An alert watches ONE product for a delivery country, with a target delivered total in a chosen currency.
 * It is evaluated against the current offers whenever the site is opened. Rules:
 *  - only COMPLETE delivered totals count (unknown shipping/import costs never trigger an alert);
 *  - a notification fires once when the best total reaches the target, and again only if it drops further;
 *    after the price rises above the target, a later drop notifies again (no repeats for the same price);
 *  - paused alerts never notify;
 *  - notifications based on demonstration offers are labelled as such (live mode has no demo offers).
 * Email delivery needs accounts + an email provider + a scheduler — see docs/ALERTS.md.
 */
import { z } from "zod";
import { rankingFor } from "./catalog-queries";
import type { FxTable } from "./money";
import type { CatalogProduct, CountryCode, CurrencyCode } from "./types";

/** Validation for alerts read from storage or an imported file (never trusted). */
export const alertSchema = z.object({
  id: z.string().max(40),
  productId: z.string().max(64),
  productName: z.string().max(200),
  productSlug: z.string().max(200),
  targetMinor: z.number().int().positive().max(1e12),
  currency: z.enum(["SEK", "EUR", "GBP", "USD", "NOK", "DKK", "CHF", "CAD", "AUD", "JPY"]),
  destination: z.enum(["SE", "DE", "GB"]),
  createdAt: z.string().max(40),
  paused: z.boolean(),
  lastNotifiedMinor: z.number().nullable(),
  lastNotifiedAt: z.string().max(40).nullable(),
  lastCheckedAt: z.string().max(40).nullable().catch(null),
  lastBestMinor: z.number().nullable().catch(null),
  emailEnabled: z.boolean().optional().catch(undefined),
});

export const MAX_ALERTS = 50;
export const MAX_NOTIFICATIONS = 100;

export interface PriceAlert {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  targetMinor: number;
  currency: CurrencyCode;
  destination: CountryCode;
  createdAt: string;
  paused: boolean;
  /** Best total we last notified about (null = not currently notified). Prevents duplicates. */
  lastNotifiedMinor: number | null;
  lastNotifiedAt: string | null;
  /** Last evaluation, for display. */
  lastCheckedAt: string | null;
  lastBestMinor: number | null;
  /** Signed-in accounts: e-mail this alert when a verified offer reaches the target (default on). */
  emailEnabled?: boolean;
}

export interface AlertNotification {
  id: string;
  alertId: string;
  productName: string;
  productSlug: string;
  at: string;
  priceMinor: number;
  currency: CurrencyCode;
  targetMinor: number;
  retailer: string;
  demo: boolean;
  read: boolean;
}

export interface Evaluation {
  alert: PriceAlert;
  notification: AlertNotification | null;
  /** Best complete delivered total now (null = no complete total available). */
  bestMinor: number | null;
  retailer: string | null;
}

export function newAlertId(now = Date.now()): string {
  return `al-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function evaluateAlert(alert: PriceAlert, product: CatalogProduct, fx: FxTable, now = new Date()): Evaluation {
  const r = rankingFor(product, alert.destination, alert.currency, fx);
  const best = r.best && r.best.displayTotalMinor !== null ? r.best : null;
  const bestMinor = best ? (best.displayTotalMinor as number) : null;
  let next: PriceAlert = { ...alert, lastCheckedAt: now.toISOString(), lastBestMinor: bestMinor };
  let notification: AlertNotification | null = null;

  if (bestMinor === null) return { alert: next, notification, bestMinor, retailer: null };

  if (bestMinor > alert.targetMinor) {
    // Back above target: the next drop may notify again.
    next = { ...next, lastNotifiedMinor: null, lastNotifiedAt: null };
  } else if (!alert.paused && (alert.lastNotifiedMinor === null || bestMinor < alert.lastNotifiedMinor)) {
    notification = {
      id: `${alert.id}-${now.getTime()}`,
      alertId: alert.id,
      productName: alert.productName,
      productSlug: alert.productSlug,
      at: now.toISOString(),
      priceMinor: bestMinor,
      currency: alert.currency,
      targetMinor: alert.targetMinor,
      retailer: best!.offer.retailer.name,
      demo: best!.offer.source !== "awin",
      read: false,
    };
    next = { ...next, lastNotifiedMinor: bestMinor, lastNotifiedAt: now.toISOString() };
  }
  return { alert: next, notification, bestMinor, retailer: best!.offer.retailer.name };
}

/** Parse a user-typed amount ("1 290", "1290,50", "1,290.50") into minor units. */
export function parseAmountToMinor(text: string): number | null {
  // Negative amounts, letters mixed into digits ("12a3") and empty input are rejected rather than "cleaned up".
  if (/-/.test(text) || /\d[^\d\s.,]+\d/.test(text)) return null;
  const t = text.replace(/\s/g, "").replace(/[^\d.,]/g, "");
  if (!t) return null;
  // Last separator with 1–2 digits after it is the decimal separator.
  const m = t.match(/^(.*?)[.,](\d{1,2})$/);
  const whole = (m ? m[1]! : t).replace(/[.,]/g, "");
  const dec = m ? m[2]!.padEnd(2, "0") : "00";
  const v = Number(whole) * 100 + Number(dec);
  return Number.isFinite(v) && v > 0 && v < 1e12 ? v : null;
}

