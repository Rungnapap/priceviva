"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MAX_ALERTS, evaluateAlert, newAlertId, parseAmountToMinor, type PriceAlert } from "@/lib/alerts";
import { rankingFor } from "@/lib/catalog-queries";
import { actions, useClientState, useHydrated } from "@/lib/client-store";
import { useAuth } from "@/lib/auth-client";
import type { CatalogProduct } from "@/lib/types";
import { useProducts } from "@/lib/use-products";
import { useCatalog } from "./catalog-context";
import { BellRing, Check, X } from "./icons";
import { toast } from "./toast";
import { DemoBadge, EmptyState } from "./ui";
import { useCountryName, useFormatMoney, useIntlLocale, useT } from "./i18n-provider";

/**
 * Evaluates the visitor's alerts against current offers whenever the site is opened (and when the tab
 * becomes visible again). Runs in the browser; nothing is sent anywhere.
 */
export function AlertWatcher() {
  const hydrated = useHydrated();
  const { alerts, alertPopups } = useClientState();
  const { fx } = useCatalog();
  const t = useT();
  const money = useFormatMoney();
  const active = alerts.filter((a) => !a.paused);
  const [tick, setTick] = useState(0);
  const ids = hydrated ? [...new Set(active.map((a) => a.productId))].sort() : [];
  const { items, loading } = useProducts(ids, hydrated && ids.length > 0 && tick >= 0);
  const done = useRef("");

  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && setTick((t) => t + 1);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!hydrated || loading || items.length === 0) return;
    const active = alerts.filter((a) => !a.paused);
    const key = `${tick}|${items.map((p) => p.id).join(",")}|${active.map((a) => `${a.id}:${a.targetMinor}:${a.currency}`).join(",")}`;
    if (done.current === key) return;
    done.current = key;
    const byId = new Map(items.map((p) => [p.id, p]));
    const updated: PriceAlert[] = [];
    const fresh = [];
    for (const a of active) {
      const p = byId.get(a.productId);
      if (!p) continue;
      const ev = evaluateAlert(a, p, fx);
      updated.push(ev.alert);
      if (ev.notification) fresh.push(ev.notification);
    }
    if (updated.length) actions.applyAlertResults(updated, fresh);
    if (alertPopups) for (const n of fresh) toast(`${t("alerts.toastHit", { name: n.productName, price: money(n.priceMinor, n.currency), retailer: n.retailer })}${n.demo ? ` ${t("alerts.demoSuffix")}` : ""}`, "success");
  }, [hydrated, loading, items, alerts, fx, tick, alertPopups, t, money]);

  return null;
}

/** "Set price alert" control on a product page. */
export function PriceAlertButton({ product }: { product: CatalogProduct }) {
  const hydrated = useHydrated();
  const { alerts, currency, location } = useClientState();
  const { fx, mode } = useCatalog();
  const t = useT();
  const money = useFormatMoney();
  const countryName = useCountryName();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!hydrated) return null;
  const dest = location.deliveryDestination;
  const existing = alerts.find((a) => a.productId === product.id && a.destination === dest);
  const best = rankingFor(product, dest, currency, fx).best;
  const bestMinor = best?.displayTotalMinor ?? null;

  const save = () => {
    const minor = parseAmountToMinor(text);
    if (!minor) return setError(t("alerts.enterTarget"));
    const err = actions.addAlert({
      id: existing?.id ?? newAlertId(),
      productId: product.id,
      productName: `${product.brandName} ${product.name}`.trim(),
      productSlug: product.slug,
      targetMinor: minor,
      currency,
      destination: dest,
      createdAt: new Date().toISOString(),
      paused: false,
      lastNotifiedMinor: null,
      lastNotifiedAt: null,
      lastCheckedAt: null,
      lastBestMinor: null,
    });
    if (err) return setError(t("alerts.max", { n: MAX_ALERTS }));
    setOpen(false);
    setError(null);
    toast(t("alerts.setToast", { country: countryName(dest), price: money(minor, currency) }), "success");
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setText(existing ? String(existing.targetMinor / 100) : bestMinor ? String(Math.floor((bestMinor * 0.9) / 100)) : "");
        }}
        className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2"
      >
        <BellRing className="h-4 w-4" aria-hidden="true" />
        {existing ? `${t("alerts.at", { price: money(existing.targetMinor, existing.currency) })}${existing.paused ? ` ${t("alerts.pausedSuffix")}` : ""}` : t("alerts.button")}
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-4 shadow-lift">
          <p className="font-semibold">{t("alerts.popTitle")}</p>
          <p className="mt-1 text-xs text-muted">
            {t("alerts.popScope", { country: countryName(dest), cur: currency })} {bestMinor ? t("alerts.bestNowTotal", { price: money(bestMinor, currency) }) : t("alerts.noTotalNow")}
          </p>
          <label className="mt-3 block text-sm font-medium" htmlFor={`target-${product.id}`}>{t("alerts.target", { cur: currency })}</label>
          <input
            id={`target-${product.id}`}
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
          />
          {error && <p className="mt-1 text-xs text-error-ink">{error}</p>}
          <p className="mt-2 text-xs text-muted">
            {t("alerts.howChecked")}
            {mode !== "live" ? ` ${t("alerts.demoOffers")}` : ""}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={save} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover">
              {existing ? t("alerts.update") : t("alerts.set")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2">{t("alerts.cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}


/** The /alerts page body: alerts with pause/edit/delete, and the in-app notification inbox. */
/** Where alert notifications go: in this browser for everyone; by e-mail only for signed-in accounts with live, verified prices. */
function AlertDelivery() {
  const auth = useAuth();
  const { mode } = useCatalog();
  const t = useT();
  if (auth.status === "guest") {
    return (
      <p className="mb-4 rounded-xl border border-line bg-surface p-3 text-sm text-muted">
        {t("alerts.guestNote")} <Link href="/login?next=%2Falerts" className="font-semibold text-primary-ink underline">{t("auth.loginButton")}</Link>{" · "}
        <Link href="/signup" className="font-semibold text-primary-ink underline">{t("auth.createAccount")}</Link>
      </p>
    );
  }
  if (auth.status !== "signed_in") return null;
  return mode === "live" ? (
    <p className="mb-4 rounded-xl border border-primary/20 bg-primary-soft p-3 text-sm text-primary-ink">{t("alerts.emailLive", { email: auth.user?.email ?? "" })}</p>
  ) : (
    <p role="note" className="mb-4 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning-ink">
      <strong>{t("alerts.emailTestTitle")}</strong> {t("alerts.emailTest")}
    </p>
  );
}

export function AlertsManager() {
  const hydrated = useHydrated();
  const { alerts, notifications, alertPopups } = useClientState();
  const auth = useAuth();
  const signedIn = auth.status === "signed_in";
  const t = useT();
  const money = useFormatMoney();
  const countryName = useCountryName();
  const when = new Intl.DateTimeFormat(useIntlLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (hydrated && unread > 0) {
      const timer = setTimeout(() => actions.markNotificationsRead(), 4000);
      return () => clearTimeout(timer);
    }
  }, [hydrated, unread]);

  if (!hydrated) return <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-surface-2" aria-label={t("common.loading")} />;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section aria-labelledby="my-alerts-h">
        <h2 id="my-alerts-h" className="pv-display mb-3 text-xl font-bold">{t("alerts.yours", { n: alerts.length })}</h2>
        <AlertDelivery />
        {alerts.length === 0 ? (
          <EmptyState title={t("alerts.empty")} icon={<BellRing className="h-6 w-6" />}>
            {t("alerts.emptyText")} <Link href="/search" className="font-semibold text-primary-ink underline">{t("alerts.findProduct")}</Link>
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {alerts.map((a) => {
              const hit = a.lastBestMinor !== null && a.lastBestMinor <= a.targetMinor;
              return (
                <li key={a.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/product/${a.productSlug}`} className="font-semibold text-ink hover:text-primary hover:underline">{a.productName}</Link>
                      <p className="text-sm text-muted">
                        {t("alerts.targetTo", { price: money(a.targetMinor, a.currency), country: countryName(a.destination) })}
                      </p>
                      <p className="mt-1 text-sm">
                        {a.lastBestMinor === null ? (
                          <span className="text-muted">{a.lastCheckedAt ? t("alerts.noTotal") : t("alerts.notChecked")}</span>
                        ) : (
                          <span className={hit ? "font-semibold text-success-ink" : ""}>
                            {t("alerts.bestNow", { price: money(a.lastBestMinor, a.currency) })}
                            {hit ? t("alerts.atOrBelow") : ""}
                          </span>
                        )}
                        {a.lastCheckedAt && <span className="text-muted"> · {t("alerts.checked", { time: when.format(new Date(a.lastCheckedAt)) })}</span>}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.paused ? "bg-surface-2 text-muted" : "bg-primary-soft text-primary-ink"}`}>{a.paused ? t("alerts.paused") : t("alerts.active")}</span>
                  </div>
                  {editing === a.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`edit-${a.id}`}>{t("alerts.newTarget", { cur: a.currency })}</label>
                      <input id={`edit-${a.id}`} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} className="h-10 w-36 rounded-xl border border-line bg-surface px-3" />
                      <span className="text-sm text-muted">{a.currency}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const m = parseAmountToMinor(text);
                          if (!m) return toast(t("alerts.invalid"), "error");
                          actions.updateAlert(a.id, { targetMinor: m });
                          setEditing(null);
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-2 text-sm font-semibold text-white"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" /> {t("alerts.save")}
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-line px-3.5 py-2 text-sm font-semibold">{t("alerts.cancel")}</button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => actions.updateAlert(a.id, { paused: !a.paused })} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold hover:bg-surface-2">
                        {a.paused ? t("alerts.resume") : t("alerts.pause")}
                      </button>
                      <button type="button" onClick={() => { setEditing(a.id); setText(String(a.targetMinor / 100)); }} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold hover:bg-surface-2">
                        {t("alerts.edit")}
                      </button>
                      <button type="button" onClick={() => actions.removeAlert(a.id)} className="inline-flex items-center gap-1 rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold text-error-ink hover:bg-surface-2">
                        <X className="h-4 w-4" aria-hidden="true" /> {t("alerts.delete")}
                      </button>
                      {signedIn && (
                        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
                          <input
                            type="checkbox"
                            checked={a.emailEnabled ?? true}
                            onChange={(e) => actions.updateAlert(a.id, { emailEnabled: e.target.checked })}
                            className="h-4 w-4 accent-[var(--pa-primary)]"
                          />
                          {t("alerts.emailMe")}
                        </label>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="inbox-h" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="inbox-h" className="pv-display text-xl font-bold">{t("alerts.notifications")}</h2>
          {notifications.length > 0 && (
            <button type="button" onClick={() => actions.clearNotifications()} className="text-sm text-muted hover:text-ink hover:underline">{t("alerts.clearAll")}</button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={alertPopups} onChange={(e) => actions.setAlertPopups(e.target.checked)} className="h-4 w-4 accent-[var(--pa-primary)]" />
          {t("alerts.popups")}
        </label>
        {notifications.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t("alerts.noNotifications")}</p>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li key={n.id} className={`rounded-xl border p-3 text-sm ${n.read ? "border-line bg-surface" : "border-primary/40 bg-primary-soft"}`}>
                <p>
                  <Link href={`/product/${n.productSlug}`} className="font-semibold hover:underline">{n.productName}</Link>{" "}
                  {t("alerts.notification", { price: money(n.priceMinor, n.currency), retailer: n.retailer, target: money(n.targetMinor, n.currency) })}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {when.format(new Date(n.at))}
                  {n.demo && <DemoBadge>{t("alerts.demoOffer")}</DemoBadge>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
