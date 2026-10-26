"use client";

import Link from "next/link";
import { rankingFor } from "@/lib/catalog-queries";
import { useClientState, useHydrated } from "@/lib/client-store";
import type { CatalogProduct } from "@/lib/types";
import { useCatalog } from "../catalog-context";
import { useFormatMoney, useT } from "../i18n-provider";
import { ChevronRight } from "../icons";
import { ProductThumb } from "../product-photo";
import { retailersOf } from "../product-card";

/** Compact row of real catalogue products. "From" is the best complete delivered total, or nothing if none is complete. */
export function ProductStrip({ products }: { products: CatalogProduct[] }) {
  const hydrated = useHydrated();
  const { location, currency } = useClientState();
  const { fx } = useCatalog();
  const t = useT();
  const money = useFormatMoney();
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {products.map((p) => {
        const best = hydrated ? rankingFor(p, location.deliveryDestination, currency, fx).best : null;
        const shops = retailersOf(p).length;
        return (
          <li key={p.id} className="flex">
            <article className="flex w-full">
              <Link
                href={`/product/${p.slug}`}
                className="group flex min-h-[6.5rem] w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-card transition-shadow hover:border-primary/40 hover:shadow-lift"
              >
                <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white">
                  <ProductThumb product={p} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="break-words text-sm font-semibold leading-snug text-ink group-hover:text-primary">{p.name}</span>
                  {best?.displayTotalMinor != null && (
                    <span className="text-sm font-bold text-ink">{t("home.from", { price: money(best.displayTotalMinor, currency) })}</span>
                  )}
                  {shops > 1 && <span className="text-xs text-muted">{t("card.compareN", { n: shops })}</span>}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
