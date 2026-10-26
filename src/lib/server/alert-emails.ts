/**
 * Price-alert e-mails (server only). Prepared, but OFF until every condition below is met. Nothing here ever
 * sends anything in test mode.
 *
 * An e-mail can only be sent when ALL of these hold:
 *   1. the catalogue is in LIVE mode (real, authorised retailer feeds) — never in demo/sample/test mode;
 *   2. ALERT_EMAILS_ENABLED=true (an explicit switch, default off);
 *   3. an e-mail provider is configured (RESEND_API_KEY + ALERT_EMAIL_FROM), and ALERT_EMAIL_SECRET for the
 *      signed unsubscribe links, and NEXT_PUBLIC_SITE_URL is an https address;
 *   4. the price comes from a VERIFIED retailer feed offer (source "awin"), with a complete, current delivered
 *      total — never demonstration, sample or informational prices;
 *   5. the account's e-mail address is confirmed, and the alert is active with e-mail switched on;
 *   6. the database atomically records this price drop first (pa_alert_observe), so the same drop is never
 *      e-mailed twice, even if two checks run at once.
 * Every e-mail is transactional (only the alert the person set), carries an unsubscribe link, and is never used
 * for marketing.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { rankOffers } from "@/lib/pricing";
import { formatMoney, type FxTable } from "@/lib/money";
import type { CatalogProduct, CountryCode, CurrencyCode } from "@/lib/types";
import { catalogMode, redact } from "./env";
import { rpc } from "./supabase-rpc";

export type BlockedReason = "test_mode" | "disabled" | "no_provider" | "no_secret" | "no_site_url";

const env = (n: string) => {
  const v = process.env[n];
  return v && v.trim() !== "" ? v.trim() : undefined;
};

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Resend (https://resend.com) over its REST API. Only used when you set RESEND_API_KEY and ALERT_EMAIL_FROM. */
export function emailProviderFromEnv(): EmailProvider | null {
  const key = env("RESEND_API_KEY");
  const from = env("ALERT_EMAIL_FROM");
  if (!key || !from) return null;
  return {
    async send(msg) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, headers: msg.headers }),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) return { ok: true };
        return { ok: false, error: `provider answered ${res.status}` };
      } catch (e) {
        return { ok: false, error: redact((e as Error).message).slice(0, 200) };
      }
    },
  };
}

/** Why e-mails can't be sent right now (null = all switches on). Order matters: test mode always wins. */
export function alertEmailsBlocked(provider: EmailProvider | null = emailProviderFromEnv()): BlockedReason | null {
  if (catalogMode() !== "live") return "test_mode";
  if (env("ALERT_EMAILS_ENABLED") !== "true") return "disabled";
  if (!provider) return "no_provider";
  if ((env("ALERT_EMAIL_SECRET") ?? "").length < 32) return "no_secret";
  if (!/^https:\/\//.test(env("NEXT_PUBLIC_SITE_URL") ?? "")) return "no_site_url";
  return null;
}

// --- signed unsubscribe links ----------------------------------------------------------------------------------
function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`unsubscribe:${payload}`).digest("base64url");
}

export function unsubscribeToken(userId: string, alertId: string, secret = env("ALERT_EMAIL_SECRET") ?? ""): string {
  const payload = Buffer.from(`${userId}:${alertId}`, "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readUnsubscribeToken(token: string, secret = env("ALERT_EMAIL_SECRET") ?? ""): { userId: string; alertId: string } | null {
  if (secret.length < 32) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(payload, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [userId, alertId] = Buffer.from(payload, "base64url").toString("utf8").split(":");
  if (!userId || !alertId || !/^[0-9a-f-]{36}$/i.test(userId) || !/^[A-Za-z0-9-]{1,40}$/.test(alertId)) return null;
  return { userId, alertId };
}

// --- checking -----------------------------------------------------------------------------------------------------
export interface DueAlert {
  userId: string;
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  targetMinor: number;
  currency: CurrencyCode;
  destination: CountryCode;
  email: string;
}

/** Best VERIFIED price for an alert: feed offers only, complete and current delivered totals only. */
export function verifiedBest(product: CatalogProduct, alert: Pick<DueAlert, "destination" | "currency">, fx: FxTable): { minor: number; retailer: string } | null {
  const verified = product.offers.filter((o) => o.source === "awin" && !o.informational);
  const r = rankOffers(verified, alert.destination, alert.currency, fx);
  const b = r.best;
  if (!b || b.displayTotalMinor === null || b.landed.stale || b.offer.source !== "awin") return null;
  return { minor: b.displayTotalMinor, retailer: b.offer.retailer.name };
}

export interface RunDeps {
  provider?: EmailProvider | null;
  loadProducts: (ids: string[]) => Promise<CatalogProduct[]>;
  fx: FxTable;
}

export interface RunSummary {
  skipped: BlockedReason | null;
  checked: number;
  sent: number;
  failed: number;
}

export async function runAlertEmails(deps: RunDeps): Promise<RunSummary> {
  const provider = deps.provider === undefined ? emailProviderFromEnv() : deps.provider;
  const blocked = alertEmailsBlocked(provider);
  const summary: RunSummary = { skipped: blocked, checked: 0, sent: 0, failed: 0 };
  if (blocked || !provider) return summary;

  const due = await rpc<DueAlert[]>("pa_alerts_due", { limit: 1000 }, { role: "service" });
  const products = new Map((await deps.loadProducts([...new Set(due.map((a) => a.productId))])).map((p) => [p.id, p]));
  const site = (env("NEXT_PUBLIC_SITE_URL") ?? "").replace(/\/+$/, "");

  for (const a of due) {
    const p = products.get(a.productId);
    summary.checked++;
    const best = p ? verifiedBest(p, a, deps.fx) : null;
    // Above target (or no verified price): only lets a later drop notify again; never sends anything.
    const seen = await rpc<{ action: string; event_id?: string }>(
      "pa_alert_observe",
      { user_id: a.userId, alert_id: a.id, best_minor: best?.minor ?? null, retailer: best?.retailer ?? null },
      { role: "service" },
    );
    if (seen.action !== "notify" || !seen.event_id || !best) continue;

    const price = formatMoney(best.minor, a.currency);
    const target = formatMoney(a.targetMinor, a.currency);
    const productUrl = `${site}/product/${encodeURIComponent(a.productSlug)}`;
    const unsubscribe = `${site}/unsubscribe?token=${encodeURIComponent(unsubscribeToken(a.userId, a.id))}`;
    const subject = `Price alert: ${a.productName} is now ${price}`;
    const text = [
      `${a.productName} is now ${price} delivered to ${a.destination} at ${best.retailer} (your target: ${target}).`,
      `See all offers: ${productUrl}`,
      `Prices can change at any time; please check the retailer's page before buying.`,
      `You get this e-mail because you set a price alert on PriceViva. Stop alerts for this product: ${unsubscribe}`,
    ].join("\n\n");
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const html = `<p><strong>${esc(a.productName)}</strong> is now <strong>${esc(price)}</strong> delivered to ${esc(a.destination)} at ${esc(best.retailer)} (your target: ${esc(target)}).</p><p><a href="${esc(productUrl)}">See all offers</a></p><p style="color:#667085;font-size:13px">Prices can change at any time; please check the retailer's page before buying.<br>You get this e-mail because you set a price alert on PriceViva. <a href="${esc(unsubscribe)}">Stop alerts for this product</a>.</p>`;
    const result = await provider.send({ to: a.email, subject, text, html, headers: { "List-Unsubscribe": `<${unsubscribe}>` } });
    await rpc("pa_alert_event_update", { event_id: seen.event_id, status: result.ok ? "sent" : "failed", detail: result.ok ? null : result.error }, { role: "service" });
    if (result.ok) summary.sent++;
    else summary.failed++;
  }
  return summary;
}
