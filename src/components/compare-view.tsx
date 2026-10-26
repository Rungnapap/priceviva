"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { getDepartment } from "@/data/departments";
import { rankingFor } from "@/lib/catalog-queries";
import { actions, useClientState, useHydrated } from "@/lib/client-store";
import type { CatalogProduct } from "@/lib/types";
import { useProducts } from "@/lib/use-products";
import { useCatalog } from "./catalog-context";
import { Scale, X } from "./icons";
import { ProductThumb } from "./product-photo";
import { EmptyState, StatusBadge } from "./ui";
import { useCountryName, useFormatMoney, useT } from "./i18n-provider";

export function CompareView() {
  const hydrated = useHydrated();
  const { compare, location, currency } = useClientState();
  const { fx, mode } = useCatalog();
  const { items, loading, error } = useProducts(compare, hydrated);
  const t = useT();
  const money = useFormatMoney();
  const countryName = useCountryName();
  if (!hydrated || loading) return <div className="h-72 animate-pulse rounded-[var(--radius-card)] bg-surface-2" aria-label={t("common.loading")} />;
  if (error) return <EmptyState title={t("compare.unavailable")}>{error}</EmptyState>;

  if (items.length === 0) {
    return (
      <EmptyState title={t("compare.empty")} icon={<Scale className="h-6 w-6" />}>
        <p>{t("compare.emptyText")}</p>
        <Link href="/departments" className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover">{t("compare.browse")}</Link>
      </EmptyState>
    );
  }

  const dest = location.deliveryDestination;
  const country = countryName(dest);
  const notStated = <span className="text-muted">{t("compare.notStated")}</span>;
  const specKeys = [...new Set(items.flatMap((p) => Object.keys(p.specs)))];
  const rows: { label: string; render: (p: CatalogProduct) => ReactNode }[] = [
    { label: t("compare.brand"), render: (p) => p.brandName || notStated },
    { label: t("compare.variant"), render: (p) => p.variant },
    { label: t("compare.condition"), render: (p) => t(`cond.${p.condition}`) },
    {
      label: t("compare.bestTo", { country }),
      render: (p) => {
        const r = rankingFor(p, dest, currency, fx);
        return r.best ? (
          <span className="space-y-1">
            <span className="block text-base font-semibold">
              {r.best.offer.price.currency !== currency && <span className="mr-0.5 font-normal text-muted">≈</span>}
              {money(r.best.displayTotalMinor as number, currency)}
            </span>
            <span className="block text-xs text-muted">
              {r.best.offer.retailer.name} · {t("compare.chargedIn", { cur: r.best.offer.price.currency })}
            </span>
            <StatusBadge status={r.best.landed.status} demo={r.best.offer.source !== "awin"} />
          </span>
        ) : (
          <span className="text-warning-ink">{t("compare.notAvailable")} <span className="block text-xs text-muted">{t("compare.notCounted")}</span></span>
        );
      },
    },
    { label: t("compare.offers"), render: (p) => t("compare.availableN", { n: rankingFor(p, dest, currency, fx).offers.filter((o) => o.tier < 3).length }) },
    ...specKeys.map((k) => ({ label: k, render: (p: CatalogProduct) => p.specs[k] ?? notStated })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {t("compare.summary", { n: items.length, dept: getDepartment(items[0]!.department)?.name ?? t("compare.uncategorised"), cur: currency, country })}
        </p>
        <button type="button" onClick={() => actions.clearCompare()} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-semibold hover:bg-surface-2">
          <X className="h-4 w-4" aria-hidden="true" /> {t("compare.clearAll")}
        </button>
      </div>
      <div className="rounded-xl border border-primary/20 bg-primary-soft p-4 text-sm"><strong>{t("compare.exploreTitle")}</strong> {t("compare.exploreText")} {mode === "live" ? t("compare.liveNote") : t("compare.demoDataNote")}</div>
      {items.length < 3 && (
        <Link href={`/search?dept=${encodeURIComponent(items[0]!.department)}`} className="inline-flex min-h-10 items-center rounded-full border border-primary/30 px-4 text-sm font-semibold text-primary-ink hover:bg-primary-soft">
          + {t("compare.addMore", { dept: getDepartment(items[0]!.department)?.name ?? t("compare.uncategorised") })}
        </Link>
      )}
      <p className="text-xs text-muted sm:hidden">{t("compare.scrollHint")}</p>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">{t("compare.caption")}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-36 bg-surface p-4 text-left align-bottom text-xs uppercase tracking-wide text-muted sm:w-48">{t("compare.product")}</th>
              {items.map((p) => (
                <th key={p.id} scope="col" className="p-4 text-left align-top">
                  <div className="relative">
                    <Link href={`/product/${p.slug}`} aria-label={t("compare.explore", { name: p.name })} className="mb-3 block aspect-[4/3] w-full max-w-[12rem] overflow-hidden rounded-xl"><ProductThumb product={p} /></Link>
                    <button type="button" onClick={() => actions.removeFromCompare(p.id)} aria-label={t("compare.removeName", { name: p.name })}
                      className="absolute right-0 top-0 inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink shadow-card ring-1 ring-line hover:bg-surface-2">
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> {t("compare.remove")}
                    </button>
                  </div>
                  <Link href={`/product/${p.slug}`} className="block font-semibold text-ink hover:text-primary hover:underline">{p.name}</Link>
                  <Link href={`/product/${p.slug}`} className="mt-2 inline-flex rounded-full border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-soft">{t("compare.viewAll")}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th scope="row" className="sticky left-0 z-10 bg-surface p-4 text-left font-medium text-muted">{row.label}</th>
                {items.map((p) => <td key={p.id} className="p-4 align-top">{row.render(p)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
