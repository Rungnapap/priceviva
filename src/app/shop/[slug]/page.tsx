import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDepartment } from "@/data/departments";
import { getShopCategory, shopCategories } from "@/data/shop-categories";
import { getRepository } from "@/lib/catalog/repository";
import type { CatalogProduct } from "@/lib/types";
import { Package } from "@/components/icons";
import { ProductCard } from "@/components/product-card";
import { Shelf } from "@/components/shelf";
import { PageHeader } from "@/components/page-header";
import { categoryBackdrop } from "@/data/site-backgrounds";
import { EmptyState, SectionHeading } from "@/components/ui";
import { getLocale } from "@/i18n/server";
import { categoryLabel, makeT, type MessageKey } from "@/i18n";
import { LOCALE_INFO } from "@/i18n/config";

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const c = getShopCategory((await params).slug);
  if (!c) return { title: "Category not found" };
  return { title: c.name, description: `${c.name}: ${c.blurb.trim().replace(/\.?$/, ".")} Compare prices on PriceViva.`, alternates: { canonical: `/shop/${c.slug}` } };
}

/** A shopper-facing category (e.g. Electronics) that groups several catalogue departments. */
export default async function ShopCategoryPage({ params }: { params: Params }) {
  const c = getShopCategory((await params).slug);
  if (!c) notFound();
  const repo = getRepository();
  const [meta, locale] = await Promise.all([repo.meta(), getLocale()]);
  const t = makeT(locale);
  const name = categoryLabel(t, c.slug, c.name);
  const blurbKey = `catBlurb.${c.slug}` as MessageKey;
  const depts = c.departments.map((s) => getDepartment(s)).filter((d): d is NonNullable<typeof d> => Boolean(d));
  const shelves = await Promise.all(
    depts.map(async (d) => ({
      dept: d,
      count: meta.departmentCounts[d.slug] ?? 0,
      items: (meta.departmentCounts[d.slug] ?? 0) > 0 ? await repo.shelf({ department: d.slug, limit: 12 }) : ([] as CatalogProduct[]),
    })),
  );
  const total = shelves.reduce((n, s) => n + s.count, 0);

  return (
    <div>
      <PageHeader title={name} backdrop={categoryBackdrop(c)}>
        <p>{t(blurbKey) === blurbKey ? c.blurb : t(blurbKey)}</p>
        <p className="mt-1 text-sm text-muted">
          {total > 0 ? t(total === 1 ? "home.product1" : "home.products", { n: total.toLocaleString(LOCALE_INFO[locale].intl) }) : t("shop.noProducts")}
          {meta.mode === "sample" ? t("shop.sampleData") : meta.mode === "demo" ? t("shop.demoData") : ""}
        </p>
        <nav aria-label={t("shop.departments", { name })} className="mt-4 flex flex-wrap gap-2">
          {shelves.map((s) => (
            <Link
              key={s.dept.slug}
              href={`/departments/${s.dept.slug}`}
              className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink shadow-card hover:border-primary hover:text-primary"
            >
              {s.dept.name} ({s.count})
            </Link>
          ))}
        </nav>
      </PageHeader>

      <div className="space-y-12 py-10">
        {total === 0 && (
          <div className="pa-container">
            <EmptyState title={t("shop.opensLater", { name })} icon={<Package className="h-6 w-6" />}>
              {meta.mode === "sample"
                ? t("shop.emptySample")
                : meta.mode === "live"
                ? t("shop.emptyLive")
                : t("shop.emptyDemo")}
            </EmptyState>
          </div>
        )}
        {shelves
          .filter((s) => s.items.length > 0)
          .map((s) => (
            <section key={s.dept.slug} aria-labelledby={`g-${s.dept.slug}`} className="pa-container">
              <SectionHeading id={`g-${s.dept.slug}`} eyebrow={name} title={s.dept.name} />
              <Shelf
                label={s.dept.name}
                action={<Link href={`/departments/${s.dept.slug}`} className="text-sm font-semibold text-primary-ink hover:underline">{t("shop.seeAll", { n: s.count })}</Link>}
              >
                {s.items.map((p) => (
                  <ProductCard key={p.id} product={p} className="w-[16rem] shrink-0" />
                ))}
              </Shelf>
            </section>
          ))}
        <nav aria-label={t("shop.other")} className="pa-container">
          <p className="mb-3 text-sm font-semibold text-muted">{t("home.moreCategories")}</p>
          <div className="flex flex-wrap gap-2">
            {shopCategories
              .filter((o) => o.slug !== c.slug)
              .map((o) => (
                <Link key={o.slug} href={`/shop/${o.slug}`} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm hover:border-primary hover:text-primary">
                  {categoryLabel(t, o.slug, o.name)}
                </Link>
              ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
