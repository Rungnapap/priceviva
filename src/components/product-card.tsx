"use client";

import Link from "next/link";
import { compareGroup } from "@/lib/catalog-queries";
import type { CatalogProduct } from "@/lib/types";
import { Scale } from "./icons";
import { PriceSummary } from "./price-summary";
import { CompareButton, SaveButton } from "./product-actions";
import { ProductThumb } from "./product-photo";
import { DemoBadge } from "./ui";
import { useT } from "./i18n-provider";

/** Shops that list this product (excludes reference-only prices such as a sample API's list price). */
export function retailersOf(product: CatalogProduct) {
  const seen = new Map<string, string>();
  for (const o of product.offers) if (!o.informational && !seen.has(o.retailer.id)) seen.set(o.retailer.id, o.retailer.name);
  return [...seen.values()];
}

function initials(name: string) {
  return name
    .replace(/^Sample Shop /i, "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ProductCard({ product, className = "" }: { product: CatalogProduct; className?: string }) {
  const brand = product.brandName;
  const shops = retailersOf(product);
  const href = `/product/${product.slug}`;
  const t = useT();
  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card transition-shadow hover:shadow-lift ${className}`}
    >
      <div className="relative aspect-square overflow-hidden bg-white">
        <ProductThumb product={product} />
        <div className="absolute right-2.5 top-2.5 z-10">
          <SaveButton productId={product.id} name={`${brand} ${product.name}`.trim()} compact />
        </div>
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
          {product.source === "demo" && <DemoBadge>{t("card.demo")}</DemoBadge>}
          {product.source === "sample" && <DemoBadge>{t("card.sampleData")}</DemoBadge>}
          {product.condition !== "new" && (
            <span className="rounded-full bg-navy px-2 py-0.5 text-xs font-semibold text-white">{t(`cond.${product.condition}`)}</span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          {(brand || product.model) && (
            <p className="truncate text-xs font-medium text-muted">
              {brand}
              {brand && product.model ? " · " : ""}
              {product.model}
            </p>
          )}
          <h3 className="mt-0.5 line-clamp-2 font-semibold leading-snug text-ink">
            <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
              {product.name}
            </Link>
          </h3>
          {product.variant && <p className="mt-0.5 truncate text-sm text-muted">{product.variant}</p>}
        </div>
        <div className="mt-auto">
          <PriceSummary product={product} />
        </div>
        <div className="relative z-10 flex items-center gap-2">
          <Link
            href={`${href}#offers`}
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-primary-soft px-3 py-2 text-sm font-semibold text-primary-ink ring-1 ring-primary/20 hover:bg-primary hover:text-white"
          >
            {shops.length > 1 ? (
              <>
                <span className="sm:hidden">{t("card.offersN", { n: shops.length })}</span>
                <span className="hidden sm:inline">{t("card.compareN", { n: shops.length })}</span>
              </>
            ) : shops.length === 1 ? (
              t("card.viewOffer")
            ) : (
              t("card.viewDetails")
            )}
          </Link>
          <CompareButton productId={product.id} group={compareGroup(product)} compact iconOnly />
        </div>
        {shops.length > 0 && (
          <div className="hidden items-center gap-1.5 text-xs text-muted sm:flex" aria-label={t("card.offeredBy", { shops: shops.join(", ") })}>
            {shops.slice(0, 2).map((s) => (
              <span key={s} className="inline-flex min-w-0 items-center gap-1">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[9px] font-bold text-ink" aria-hidden="true">
                  {initials(s)}
                </span>
                <span className="truncate">{s}</span>
              </span>
            ))}
            {shops.length > 2 && <span className="shrink-0 rounded-full bg-surface-2 px-1.5 font-semibold">+{shops.length - 2}</span>}
          </div>
        )}
        {shops.length > 0 && (
          <p className="text-xs text-muted sm:hidden">{t(shops.length === 1 ? "card.shop1" : "card.shopsN", { n: shops.length })}: {shops.map((s) => s.replace(/^Sample Shop /i, "")).join(", ")}</p>
        )}
        {shops.length === 0 && product.source === "sample" && (
          <p className="flex items-center gap-1 text-xs text-muted">
            <Scale className="h-3.5 w-3.5" aria-hidden="true" /> {t("card.noSampleOffers")}
          </p>
        )}
      </div>
    </article>
  );
}
