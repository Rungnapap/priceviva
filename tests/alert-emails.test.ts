/**
 * Price-alert e-mails: the TEST MODE safety rule and the other switches. No database or network needed:
 * when e-mails are blocked, nothing is even looked up.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fxSnapshot } from "../src/data/fx";
import { alertEmailsBlocked, readUnsubscribeToken, runAlertEmails, unsubscribeToken, verifiedBest, type EmailProvider } from "../src/lib/server/alert-emails";
import type { CatalogProduct } from "../src/lib/types";

const SECRET = "x".repeat(40);
const ALL_ON = {
  CATALOG_SOURCE: "live",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_TESTONLY",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_TESTONLY",
  ALERT_EMAILS_ENABLED: "true",
  ALERT_EMAIL_SECRET: SECRET,
  NEXT_PUBLIC_SITE_URL: "https://www.priceviva.example",
};
const KEYS = [...Object.keys(ALL_ON), "RESEND_API_KEY", "ALERT_EMAIL_FROM"];
beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});
const setEnv = (v: Record<string, string>) => Object.assign(process.env, v);

const provider = (): EmailProvider & { sent: number } => {
  const p = { sent: 0, async send() { p.sent++; return { ok: true as const }; } };
  return p;
};
const never = async (): Promise<CatalogProduct[]> => {
  throw new Error("must not load products when e-mails are blocked");
};

test("TEST MODE: no e-mail can be sent from demo or sample data, whatever else is switched on", async () => {
  for (const mode of ["sample", "demo"]) {
    setEnv({ ...ALL_ON, CATALOG_SOURCE: mode });
    const p = provider();
    assert.equal(alertEmailsBlocked(p), "test_mode");
    const r = await runAlertEmails({ provider: p, loadProducts: never, fx: fxSnapshot });
    assert.deepEqual(r, { skipped: "test_mode", checked: 0, sent: 0, failed: 0 });
    assert.equal(p.sent, 0);
  }
  // "live" requested but Supabase not configured falls back to sample mode → still blocked.
  setEnv({ ...ALL_ON, NEXT_PUBLIC_SUPABASE_URL: "" });
  assert.equal(alertEmailsBlocked(provider()), "test_mode");
});

test("live mode still needs the explicit switch, a provider, a signing secret and an https site address", () => {
  setEnv({ ...ALL_ON, ALERT_EMAILS_ENABLED: "false" });
  assert.equal(alertEmailsBlocked(provider()), "disabled");
  setEnv(ALL_ON);
  assert.equal(alertEmailsBlocked(null), "no_provider");
  setEnv({ ...ALL_ON, ALERT_EMAIL_SECRET: "short" });
  assert.equal(alertEmailsBlocked(provider()), "no_secret");
  setEnv({ ...ALL_ON, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" });
  assert.equal(alertEmailsBlocked(provider()), "no_site_url");
  setEnv(ALL_ON);
  assert.equal(alertEmailsBlocked(provider()), null);
});

const offer = (id: string, sek: number, source: string, extra: Record<string, unknown> = {}) => ({
  id, productId: "p1", retailerId: id, retailer: { id, name: `Shop ${id}`, country: "SE" }, price: { minor: sek, currency: "SEK" },
  vatIncluded: true, shipFrom: "SE", stock: "in_stock", observedDaysAgo: 0, sourceUrl: null, clickable: false, source,
  destinations: { SE: { shipping: { amountMinor: 0, basis: "verified" }, importCharges: { amountMinor: 0, basis: "verified" } } },
  ...extra,
});
const product = (offers: unknown[]) => ({ id: "p1", slug: "p1", name: "Thing", brandName: "Brand", offers, condition: "new" }) as unknown as CatalogProduct;
const where = { destination: "SE" as const, currency: "SEK" as const };

test("only verified feed offers count: demo, sample, informational and stale prices are ignored", () => {
  assert.equal(verifiedBest(product([offer("d", 100, "demo"), offer("s", 100, "sample"), offer("i", 100, "awin", { informational: true })]), where, fxSnapshot), null);
  assert.equal(verifiedBest(product([offer("old", 100, "awin", { observedDaysAgo: 30 })]), where, fxSnapshot), null);
  assert.deepEqual(verifiedBest(product([offer("d", 100, "demo"), offer("a", 500, "awin")]), where, fxSnapshot), { minor: 500, retailer: "Shop a" });
});

test("unsubscribe links are signed: tampered or unsigned links are refused", () => {
  const tok = unsubscribeToken("11111111-1111-4111-8111-111111111111", "al-1", SECRET);
  assert.deepEqual(readUnsubscribeToken(tok, SECRET), { userId: "11111111-1111-4111-8111-111111111111", alertId: "al-1" });
  const other = unsubscribeToken("22222222-2222-4222-8222-222222222222", "al-1", SECRET);
  assert.equal(readUnsubscribeToken(`${other.split(".")[0]}.${tok.split(".")[1]}`, SECRET), null);
  assert.equal(readUnsubscribeToken(tok, "y".repeat(40)), null);
  assert.equal(readUnsubscribeToken(tok, "short"), null);
  assert.equal(readUnsubscribeToken("garbage", SECRET), null);
});
