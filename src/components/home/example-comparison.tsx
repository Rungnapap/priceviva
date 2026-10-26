"use client";

import Link from "next/link";
import { rankingFor } from "@/lib/catalog-queries";
import { useClientState, useHydrated } from "@/lib/client-store";
import { convertMinor } from "@/lib/money";
import type { CatalogProduct } from "@/lib/types";
import { useCatalog } from "../catalog-context";
import { useFormatMoney, useT } from "../i18n-provider";
import { ProductThumb } from "../product-photo";

/**
 * A small, real example in the hero: one catalogue product and up to three of its offers, exactly as the product page
 * computes them (item price + delivery when the shop states it). Always labelled as an example; in demo and test
 * mode it also says the data is demonstration data. No ratings, reviews or logos.
 */
export function ExampleComparison({ product }: { product: CatalogProduct }) {
  const hydrated = useHydrated();
  const { location, currency } = useClientState();
  const { fx, mode } = useCatalog();
  const t = useT();
  const money = useFormatMoney();
  if (!hydrated) return <div className="h-64 w-full animate-pulse rounded-2xl bg-surface/80" aria-hidden="true" />;
  const rows = rankingFor(product, location.deliveryDestination, currency, fx)
    .offers.filter((r) => r.tier < 3 && !r.offer.informational)
    .slice(0, 3);
  if (rows.length < 2) return null;
  const href = `/product/${product.slug}`;
  return (
    <section aria-labelledby="example-h" className="w-full rounded-2xl border border-line bg-surface/95 p-4 shadow-lift backdrop-blur">
      <p className="mb-2 inline-flex rounded-full bg-demo-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-demo">
        {mode === "live" ? t("home.exampleLive") : t("home.exampleDemo")}
      </p>
      <div className="flex items-center gap-3">
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white">
          <ProductThumb product={product} />
        </span>
        <h2 id="example-h" className="line-clamp-2 font-semibold leading-snug text-ink">{product.name}</h2>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {rows.map((r) => {
          const conv = r.offer.price.currency !== currency;
          const price = convertMinor(r.offer.price.minor, r.offer.price.currency, currency, fx);
          const ship = r.landed.shipping;
          const shipText =
            !ship || ship.amountMinor === null || ship.basis === "unknown"
              ? t("home.deliveryUnknown")
              : ship.amountMinor === 0
              ? t("home.freeDelivery")
              : t("home.plusDelivery", { price: money(convertMinor(ship.amountMinor, r.landed.currency, currency, fx), currency) });
          return (
            <li key={r.offer.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 break-words text-sm leading-snug font-medium text-ink">{r.offer.retailer.name}</span>
              <span className="text-right">
                <span className="block text-sm font-bold text-ink">{conv ? "≈ " : ""}{money(price, currency)}</span>
                <span className={`block text-[11px] ${ship?.amountMinor === 0 ? "text-success-ink" : "text-muted"}`}>{shipText}</span>
              </span>
              <Link href={`${href}#offers`} className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover">
                {t("home.view")}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href={href} className="mt-2 block text-center text-xs font-semibold text-primary-ink hover:underline">{t("home.viewOffers")}</Link>
    </section>
  );
}
