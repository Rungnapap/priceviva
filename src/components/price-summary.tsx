"use client";

import { bestVerifiedDiscount, rankingFor } from "@/lib/catalog-queries";
import { useClientState, useHydrated } from "@/lib/client-store";
import { formatMoney } from "@/lib/money";
import type { CatalogProduct, Product } from "@/lib/types";
import { useCatalog } from "./catalog-context";
import { StatusBadge } from "./ui";
import { useCountryName, useFormatMoney, useT } from "./i18n-provider";
import type { TFunction } from "@/i18n";

/** Unit price text for groceries etc. (per kg / per l / per piece). */
export function unitPrice(p: Product, minor: number, currency: Parameters<typeof formatMoney>[1], t?: TFunction, fmt: typeof formatMoney = formatMoney): string | null {
  if (!p.unit) return null;
  const per = p.unit.unit === "pcs" ? (t ? t("card.perPiece") : "piece") : p.unit.unit;
  return `${fmt(Math.round(minor / p.unit.quantity), currency)} / ${per}`;
}

/**
 * Card price block. Shows the best COMPLETE delivered total when one exists; otherwise the known part
 * "+ unknown costs", or the sample list price — never a made-up "lowest price".
 */
export function PriceSummary({ product }: { product: CatalogProduct }) {
  const hydrated = useHydrated();
  const { location, currency } = useClientState();
  const { fx } = useCatalog();
  const dest = location.deliveryDestination;
  const t = useT();
  const money = useFormatMoney();
  const country = useCountryName()(dest);

  if (!hydrated) {
    return <div className="h-[52px] animate-pulse rounded-lg bg-surface-2" aria-label={t("card.loadingPrices")} />;
  }

  const r = rankingFor(product, dest, currency, fx);
  const discount = bestVerifiedDiscount(product);

  if (r.best) {
    const b = r.best;
    const unit = unitPrice(product, b.displayTotalMinor as number, currency, t, money);
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-xl font-bold tracking-tight text-ink" title={b.offer.price.currency !== currency ? t("card.converted", { cur: b.offer.price.currency }) : undefined}>
            {b.offer.price.currency !== currency && <span className="mr-0.5 font-medium text-muted">≈</span>}
            {money(b.displayTotalMinor as number, currency)}
          </span>
          {discount !== null && (
            <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-xs font-semibold text-success-ink" title={t("card.discountTitle")}>
              −{discount}%
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          <StatusBadge status={b.landed.status} demo={b.offer.source !== "awin"} />
          <span>{t("card.to", { country })}</span>
          {unit && <span>· {unit}</span>}
        </div>
        {r.bestIsUncertain && (
          <p className="text-xs text-muted">
            <span className="sm:hidden">{t("card.otherIncomplete")}</span>
            <span className="hidden sm:inline">{t("card.otherMayBeCheaper")}</span>
          </p>
        )}
      </div>
    );
  }

  const fallback = r.offers.find((o) => o.tier === 1) ?? r.offers.find((o) => o.tier === 2);
  if (fallback) {
    const listPrice = fallback.offer.informational;
    return (
      <div className="space-y-1">
        <span className="text-xl font-bold tracking-tight text-ink">
          {money(fallback.displayKnownMinor, currency)}
          {!listPrice && <span className="ml-1 text-xs font-normal text-muted">{t("card.unknownCosts")}</span>}
        </span>
        <p className="text-xs text-muted">
          {listPrice ? t("card.sampleListPrice") : t("card.noCompleteTotal", { country })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <StatusBadge status="unavailable" />
      <p className="text-xs text-muted">{t("card.noDelivery", { country })}</p>
    </div>
  );
}
