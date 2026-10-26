"use client";

import Link from "next/link";
import { useRef } from "react";
import { cities } from "@/data/places";
import { areaName } from "@/lib/location";
import { useAuth } from "@/lib/auth-client";
import { actions, useClientState, useHydrated } from "@/lib/client-store";
import { exportSnapshot } from "@/lib/portable-data";
import { useProducts } from "@/lib/use-products";
import { AlertsManager } from "./alerts";
import { LogoutButton } from "./auth-forms";
import { Check, Heart, LogIn, User } from "./icons";
import { ProductCard } from "./product-card";
import { toast } from "./toast";
import { EmptyState } from "./ui";
import { useCountryName, useT } from "./i18n-provider";

/**
 * /account. Signed in: e-mail, saved products, price alerts (edit, pause, delete), log out.
 * Guest: how to sign in, plus the browser-only data tools. Accounts not configured: the browser-only page as before.
 */
export function AccountDashboard({ welcome = false }: { welcome?: boolean }) {
  const auth = useAuth();
  const t = useT();
  const signedIn = auth.status === "signed_in" && !!auth.user;

  return (
    <div className="pa-container max-w-5xl py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${signedIn ? "bg-primary text-white" : "bg-surface-2 text-muted"}`}>
            <User className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="pv-display text-3xl font-bold tracking-tight">{t("acct.title")}</h1>
            {auth.status === "loading" ? (
              <p className="h-5 w-48 animate-pulse rounded bg-surface-2" aria-label={t("common.loading")} />
            ) : signedIn ? (
              <p className="flex flex-wrap items-center gap-2 text-muted">
                <span className="truncate font-medium text-ink" data-testid="account-email">{auth.user!.email}</span>
                {auth.user!.emailConfirmed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success-ink">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t("acct.emailConfirmed")}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-muted">{t("acct.guest")}</p>
            )}
          </div>
        </div>
        {signedIn && <LogoutButton />}
      </div>

      {welcome && signedIn && (
        <div role="status" className="mt-6 rounded-[var(--radius-card)] border border-success/30 bg-success-soft p-4 text-sm text-success-ink">{t("acct.welcome")}</div>
      )}
      {signedIn && auth.syncError && (
        <div role="status" className="mt-6 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-4 text-sm text-warning-ink">
          {t(auth.syncError === "acct.sync.dbNotReady" ? "acct.sync.dbNotReady" : "acct.sync.offline")}
        </div>
      )}

      {auth.status === "unconfigured" && (
        <div className="mt-8 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-5 text-sm text-warning-ink">
          <p className="font-semibold">{t("acct.notAvailableTitle")}</p>
          <p className="mt-1">{t("acct.notAvailable")}</p>
        </div>
      )}

      {auth.status === "guest" && (
        <section aria-labelledby="signin-h" className="mt-8 rounded-[var(--radius-card)] border border-primary/20 bg-primary-soft p-5 sm:p-6">
          <h2 id="signin-h" className="pv-display text-xl font-bold text-ink">{t("acct.signInTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink/80">{t("acct.signInLead")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">
              <LogIn className="h-4 w-4" aria-hidden="true" /> {t("auth.loginButton")}
            </Link>
            <Link href="/signup" className="inline-flex h-11 items-center rounded-full border border-primary/30 bg-surface px-5 text-sm font-semibold text-primary-ink hover:bg-surface-2">{t("auth.createAccount")}</Link>
          </div>
        </section>
      )}

      {signedIn && <SavedSection />}

      {signedIn && (
        <section aria-label={t("acct.priceAlerts")} className="mt-10">
          <AlertsManager />
        </section>
      )}

      {auth.status !== "loading" && <BrowserData signedIn={signedIn} />}
    </div>
  );
}

function SavedSection() {
  const hydrated = useHydrated();
  const t = useT();
  const { saved } = useClientState();
  const shown = saved.slice(-4).reverse();
  const { items, loading } = useProducts(shown, hydrated && shown.length > 0);
  return (
    <section aria-labelledby="saved-h" className="mt-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 id="saved-h" className="pv-display text-xl font-bold">{t("acct.savedTitle", { n: saved.length })}</h2>
        {saved.length > 0 && <Link href="/saved" className="text-sm font-semibold text-primary-ink hover:underline">{t("acct.viewAllSaved")} →</Link>}
      </div>
      {!hydrated || (loading && shown.length > 0) ? (
        <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface-2" aria-label={t("common.loading")} />
      ) : saved.length === 0 ? (
        <EmptyState title={t("fav.empty")} icon={<Heart className="h-6 w-6" />}>
          {t("acct.savedEmpty")} <Link href="/search" className="font-semibold text-primary-ink underline">{t("alerts.findProduct")}</Link>
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((p) => (
            <li key={p.id} className="flex">
              <ProductCard product={p} className="w-full" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Preferences kept in this browser, export/import, and (guests only) forgetting everything. */
function BrowserData({ signedIn }: { signedIn: boolean }) {
  const hydrated = useHydrated();
  const s = useClientState();
  const t = useT();
  const countryName = useCountryName();
  const fileRef = useRef<HTMLInputElement>(null);
  const area = (a: typeof s.location.savedArea) => (a ? `${areaName(a, cities)}, ${a.radiusKm} km` : null);
  const rows: [string, string][] = hydrated
    ? [
        [t("acct.savedArea"), area(s.location.savedArea) ?? t("acct.notSet")],
        [t("acct.tempArea"), area(s.location.temporaryArea) ?? t("acct.none")],
        [t("prefs.deliverTo"), countryName(s.location.deliveryDestination)],
        [t("prefs.currency"), s.currency],
        [t("prefs.theme"), t(`theme.${s.theme}`)],
        [t("nav.favourites"), String(s.saved.length)],
        [t("tools.compare"), String(s.compare.length)],
        [t("acct.priceAlerts"), String(s.alerts.length)],
        [t("acct.deviceLocation"), t("acct.neverStored")],
      ]
    : [];

  const exportData = () => {
    const blob = new Blob([JSON.stringify(exportSnapshot(s), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "priceviva-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const r = actions.importData(await file.text());
    if (!r.ok) return toast(t(r.error === "too_large" ? "acct.importTooLarge" : r.error === "not_json" ? "acct.importNotJson" : "acct.importUnknown"), "error");
    toast(`${t("acct.imported", { f: r.addedFavourites, a: r.addedAlerts })}${r.skipped ? ` ${t("acct.importSkipped", { n: r.skipped })}` : ""}`, "success");
  };

  return (
    <>
      <section className="mt-10 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 className="font-semibold">{t(signedIn ? "acct.storedSignedIn" : "acct.stored")}</h2>
        {signedIn && <p className="mt-1 text-sm text-muted">{t("acct.storedSignedInLead")}</p>}
        <dl className="mt-3 divide-y divide-line text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-2 gap-4 py-2">
              <dt className="text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={exportData} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2">{t("acct.export")}</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2">{t("acct.import")}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label={t("acct.importLabel")} onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
          {/* Signed in, this would delete the account's lists too, so the way to clear this browser is "Log out". */}
          {!signedIn && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t("acct.deleteConfirm"))) {
                  actions.forgetEverything();
                  toast(t("acct.deleted"));
                }
              }}
              className="rounded-full border border-error/30 bg-error-soft px-4 py-2 text-sm font-medium text-error-ink hover:opacity-90"
            >
              {t("acct.delete")}
            </button>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-5 text-sm">
        {signedIn ? (
          <>
            <h2 className="font-semibold">{t("acct.privacyTitle")}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li>{t("acct.privacy1")}</li>
              <li>{t("acct.privacy2")}</li>
              <li>
                {t("acct.privacy3")} <Link href="/contact" className="underline">{t("acct.contactLink")}</Link>
              </li>
            </ul>
          </>
        ) : (
          <>
            <h2 className="font-semibold">{t("acct.moveTitle")}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li>{t("acct.move1")}</li>
              <li>{t("acct.move2")}</li>
            </ul>
          </>
        )}
      </section>
    </>
  );
}
