"use client";

import Link from "next/link";
import { useClientState, useHydrated } from "@/lib/client-store";
import { inRange, rangeInCurrency, shownPrice } from "@/lib/listing-price";
import { paginate, type SortKey } from "@/lib/search";
import type { CatalogProduct } from "@/lib/types";
import { useCatalog } from "./catalog-context";
import { ProductCard } from "./product-card";
import { useFormatMoney, useT } from "./i18n-provider";
import type { CurrencyCode } from "@/lib/types";

const PER_PAGE = 12;

/**
 * Price filtering and sorting use exactly the price shown on each card (src/lib/listing-price.ts → shownPrice),
 * in the visitor's currency and for their delivery country. Products with no price at all are never guessed:
 * they are left out of price ranges and listed last when sorting by price.
 */
export function SearchResults({
  products,
  sort,
  page,
  baseQuery,
  min = null,
  max = null,
  rangeCurrency = null,
}: {
  products: CatalogProduct[];
  sort: SortKey;
  page: number;
  baseQuery: string;
  min?: number | null;
  max?: number | null;
  rangeCurrency?: CurrencyCode | null;
}) {
  const hydrated = useHydrated();
  const { currency, location } = useClientState();
  const { fx, mode } = useCatalog();
  // One card per product, even if a data source ever returned the same product twice.
  const all = products.filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
  const tr = useT();
  const money = useFormatMoney();
  const ranged = min !== null || max !== null;
  const priceSort = sort === "price_asc" || sort === "price_desc";

  // Prices depend on browser settings: show a placeholder rather than an unfiltered or unsorted flash.
  if (!hydrated && (ranged || priceSort)) {
    return <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-surface-2" role="status" aria-label={tr("search.loadingPrices")} />;
  }

  const price = new Map(all.map((p) => [p.id, shownPrice(p, location.deliveryDestination, currency, fx)]));
  const range = rangeInCurrency({ min, max, currency: rangeCurrency }, currency, fx);
  let list = all;
  let noPrice = 0;
  if (ranged) {
    list = all.filter((p) => {
      const v = price.get(p.id) ?? null;
      if (v === null) {
        noPrice++;
        return false;
      }
      return inRange(v, range.minMinor, range.maxMinor);
    });
  }

  let ordered = list;
  if (sort === "name") ordered = [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (priceSort) {
    ordered = [...list].sort((a, b) => {
      const pa = price.get(a.id) ?? null;
      const pb = price.get(b.id) ?? null;
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return sort === "price_asc" ? pa - pb : pb - pa;
    });
  }

  const rangeText = [range.minMinor !== null ? money(range.minMinor, currency) : "", range.maxMinor !== null ? money(range.maxMinor, currency) : ""];
  const rangeLabel = range.minMinor !== null && range.maxMinor !== null ? `${rangeText[0]} – ${rangeText[1]}` : range.minMinor !== null ? `≥ ${rangeText[0]}` : `≤ ${rangeText[1]}`;
  const testData = mode !== "live";

  const pg = paginate(ordered, page, PER_PAGE);
  const href = (n: number) => `/search?${baseQuery}${baseQuery ? "&" : ""}page=${n}`;

  if (ranged && list.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-10 text-center">
        <p className="font-semibold">{tr("search.noneInRange")}</p>
        <p className="mt-1 text-sm text-muted">
          {tr("search.noneInRangeFor", { range: rangeLabel })} {tr("search.noneInRangeText")}
          {noPrice ? ` ${tr("search.priceHidden", { n: noPrice })}` : ""}
        </p>
      </div>
    );
  }

  return (
    <>
      {ranged && (
        <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted" role="status">
          <span>{tr("search.priceFiltered", { shown: list.length, total: all.length, range: rangeLabel })}</span>
          {range.converted && <span>{tr("search.rangeConverted", { cur: rangeCurrency ?? currency })}</span>}
          {noPrice ? <span>{tr("search.priceHidden", { n: noPrice })}</span> : null}
          {testData && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-warning-ink">{tr("search.testData")}</span>}
        </p>
      )}
      <h2 className="sr-only">{tr("search.resultsHeading")}</h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {pg.items.map((p) => (
          <li key={p.id} className="flex" data-filter-price={price.get(p.id) ?? undefined}>
            <ProductCard product={p} className="w-full" />
          </li>
        ))}
      </ul>
      {pg.pages > 1 && (
        <nav aria-label={tr("search.pagination")} className="mt-8 flex items-center justify-center gap-2">
          {Array.from({ length: pg.pages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={href(n)}
              aria-current={n === pg.page ? "page" : undefined}
              className={`flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm ${n === pg.page ? "border-primary bg-primary text-white" : "border-line bg-surface hover:bg-surface-2"}`}
            >
              {n}
            </Link>
          ))}
        </nav>
      )}
      {(priceSort || ranged) && (
        <p className="mt-6 text-center text-xs text-muted">
          {tr("search.priceBasis")}
          {testData ? ` ${tr("search.priceBasisTest")}` : ""}
        </p>
      )}
    </>
  );
}
