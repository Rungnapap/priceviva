import type { Metadata } from "next";
import Link from "next/link";
import { getRepository } from "@/lib/catalog/repository";
import type { CatalogProduct } from "@/lib/types";
import { CompareView } from "@/components/compare-view";
import { Globe, Scale, Search, Store } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { backdrops } from "@/data/site-backgrounds";
import { ProductCard } from "@/components/product-card";
import { SectionHeading } from "@/components/ui";
import { getT } from "@/i18n/server";

// The comparison depends on what each visitor picked: not indexed, links followed.
export const metadata: Metadata = { title: "Global Compare", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

function shopCount(p: CatalogProduct) {
  return new Set(p.offers.filter((o) => !o.informational).map((o) => o.retailer.id)).size;
}

/**
 * Two different jobs, kept apart:
 *  A. Compare retailer offers — ONE exact product (same GTIN / brand + model + variant + condition) across shops.
 *  B. Compare products — two or three DIFFERENT products side by side (specs and best totals).
 */
export default async function ComparePage() {
  const repo = getRepository();
  const t = await getT();
  const pool = await repo.shelf({ limit: 120 });
  const multi = pool.filter((p) => shopCount(p) > 1).sort((a, b) => shopCount(b) - shopCount(a)).slice(0, 8);
  const demoNote = repo.mode === "live" ? "" : ` ${t("compare.demoNote")}`;
  return (
    <div>
      <PageHeader title={t("compare.title")} eyebrow={t("compare.eyebrow")} icon={<Globe className="h-6 w-6" />} backdrop={backdrops.globalV7}>
        {t("compare.lead")}
      </PageHeader>

      <nav aria-label={t("compare.sectionsLabel")} className="border-b border-line bg-surface">
        <div className="pa-container flex gap-2 py-2.5">
          <a href="#retailer-offers" className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2">
            <Store className="h-4 w-4 text-primary" aria-hidden="true" /> {t("compare.aNav")}
          </a>
          <a href="#products" className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2">
            <Scale className="h-4 w-4 text-primary" aria-hidden="true" /> {t("compare.bNav")}
          </a>
        </div>
      </nav>

      <div className="pa-container space-y-14 py-10">
        <section id="retailer-offers" aria-labelledby="ro-h" className="scroll-mt-32 space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-ink">{t("compare.aEyebrow")}</p>
              <h2 id="ro-h" className="pv-display mt-1 text-2xl font-bold text-ink">{t("compare.aTitle")}</h2>
              <p className="mt-2 max-w-2xl text-muted">
                {t("compare.aLead")}
                {demoNote}
              </p>
              <form action="/search" method="get" role="search" className="mt-4 flex max-w-xl gap-2">
                <label htmlFor="ro-q" className="sr-only">{t("compare.findLabel")}</label>
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                  <input id="ro-q" name="q" type="search" placeholder={t("compare.findPlaceholder")} className="h-11 w-full rounded-full border border-line bg-surface pl-10 pr-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15" />
                </div>
                <button type="submit" className="h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">{t("compare.find")}</button>
              </form>
            </div>
            <aside className="rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm shadow-card">
              <p className="font-semibold text-ink">{t("compare.sameTitle")}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                <li>{t("compare.rule1")}</li>
                <li>{t("compare.rule2")}</li>
                <li>{t("compare.rule3")}</li>
                <li>{t("compare.rule4")}</li>
              </ul>
            </aside>
          </div>
          {multi.length > 0 ? (
            <div>
              <SectionHeading id="multi-h" title={t("compare.multi")} action={<Link href="/search" className="text-sm font-semibold text-primary-ink hover:underline">{t("compare.searchAll")}</Link>} />
              <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                {multi.map((p) => (
                  <li key={p.id} className="flex">
                    <ProductCard product={p} className="w-full" />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              {t("compare.noMulti")}
            </p>
          )}
        </section>

        <section id="products" aria-labelledby="pr-h" className="scroll-mt-32 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-ink">{t("compare.bEyebrow")}</p>
            <h2 id="pr-h" className="pv-display mt-1 text-2xl font-bold text-ink">{t("compare.bTitle")}</h2>
            <p className="mt-2 max-w-2xl text-muted">
              {t("compare.bLead")}
            </p>
          </div>
          <CompareView />
        </section>
      </div>
    </div>
  );
}
