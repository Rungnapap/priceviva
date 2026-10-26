"use client";

import Link from "next/link";
import { useClientState, useHydrated } from "@/lib/client-store";
import { useProducts } from "@/lib/use-products";
import { Heart } from "@/components/icons";
import { ProductCard } from "@/components/product-card";
import { PageHeader } from "@/components/page-header";
import { backdrops } from "@/data/site-backgrounds";
import { EmptyState } from "@/components/ui";
import { useT } from "@/components/i18n-provider";

export default function SavedPage() {
  const hydrated = useHydrated();
  const t = useT();
  const { saved } = useClientState();
  const { items, loading, error } = useProducts(saved, hydrated);
  const missing = saved.length - items.length;
  return (
    <div>
      <PageHeader title={t("fav.title")} crumb={t("fav.title")} icon={<Heart className="h-6 w-6" />} backdrop={backdrops.calm}>{t("fav.lead")}</PageHeader>
      <div className="pa-container py-10">
        {!hydrated || loading ? (
          <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-surface-2" aria-label={t("common.loading")} />
        ) : error ? (
          <EmptyState title={t("fav.unavailable")}>{error}</EmptyState>
        ) : items.length === 0 ? (
          <EmptyState title={saved.length ? t("fav.noLongerListed") : t("fav.empty")} icon={<Heart className="h-6 w-6" />}>
            {t("fav.emptyText")} <Link href="/" className="text-primary-ink underline">{t("fav.startExploring")}</Link>
          </EmptyState>
        ) : (
          <>
            {missing > 0 && <p className="mb-4 text-sm text-muted">{t("fav.hidden", { n: missing })}</p>}
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((p) => <li key={p.id} className="flex"><ProductCard product={p} className="w-full" /></li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
