import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDepartment } from "@/data/departments";
import { compareGroup } from "@/lib/catalog-queries";
import { getRepository } from "@/lib/catalog/repository";
import { ChevronRight } from "@/components/icons";
import { PriceAlertButton } from "@/components/alerts";
import { groupForDepartment } from "@/data/shop-categories";
import { BestOfferSummary, OfferTable } from "@/components/offer-table";
import { PriceHistoryChart } from "@/components/price-history-chart";
import { CompareButton, SaveButton } from "@/components/product-actions";
import { ProductCard } from "@/components/product-card";
import { ProductGallery } from "@/components/product-gallery";
import { DemoBadge, SectionHeading } from "@/components/ui";
import { getT } from "@/i18n/server";
import { categoryLabel } from "@/i18n";
import { jsonLdScript, productDescription, productJsonLd, productTitle } from "@/lib/product-seo";
import { siteUrl } from "@/lib/server/seo";

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const slug = (await params).slug;
  const p = await getRepository().product(slug).catch(() => null);
  if (!p) return { title: "Product not found" };
  const title = productTitle(p);
  const description = productDescription(p);
  const path = `/product/${slug}`;
  const image = p.images.find((i) => i.url.startsWith("https://"));
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "PriceViva", title, description, url: path, ...(image ? { images: [{ url: image.url, alt: image.alt }] } : {}) },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const repo = getRepository();
  const t = await getT();
  const cond = (c: "new" | "open_box" | "refurbished" | "used") => t(`cond.${c}`);
  const p = await repo.product(slug);
  if (!p) notFound();
  const dept = getDepartment(p.department);
  const sub = dept?.subcategories.find((s) => s.slug === p.subcategory);
  const [related, history] = await Promise.all([repo.related(p, 4).catch(() => []), repo.priceHistory(p).catch(() => [])]);
  const group = groupForDepartment(p.department);
  const shopCount = new Set(p.offers.filter((o) => !o.informational).map((o) => o.retailer.id)).size;
  const specRows: [string, string][] = [
    [t("compare.brand"), p.brandName || t("compare.notStated")],
    [t("product.model"), p.model || t("compare.notStated")],
    ...(p.variant ? ([[t("compare.variant"), p.variant]] as [string, string][]) : []),
    [t("compare.condition"), cond(p.condition)],
    ...Object.entries(p.specs),
    ...(p.source === "sample" ? [] : ([[p.source === "demo" ? t("product.gtinDemo") : "GTIN / EAN", p.gtin ? p.gtin.replace(/^0+(?=\d{13}$)/, "") : t("product.notSupplied")]] as [string, string][])),
  ];
  const ld = productJsonLd(p, `${siteUrl()}/product/${slug}`);

  return (
    <div className="pa-container py-8">
      {/* Product data for search engines: real offers only, no ratings or reviews. */}
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />}
      <nav aria-label={t("common.breadcrumb")} className="mb-6 flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link href="/" className="hover:text-primary">{t("nav.home")}</Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        {group && group.name !== dept?.name && (
          <>
            <Link href={`/shop/${group.slug}`} className="hover:text-primary">{categoryLabel(t, group.slug, group.name)}</Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </>
        )}
        {dept ? <Link href={`/departments/${dept.slug}`} className="hover:text-primary">{dept.name}</Link> : <Link href="/search" className="hover:text-primary">{t("product.allProducts")}</Link>}
        {sub && (
          <>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <Link href={`/departments/${dept?.slug}?sub=${sub.slug}`} className="hover:text-primary">{sub.name}</Link>
          </>
        )}
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-6">
          <ProductGallery product={p} />
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 className="mb-3 font-semibold">{t("product.specs")}</h2>
            <dl className="divide-y divide-line text-sm">
              {specRows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-2 gap-4 py-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="break-words font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">
              {p.source === "demo"
                ? t("product.specsDemo")
                : p.source === "sample"
                ? t("product.specsSample")
                : t("product.specsLive")}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted">{p.brandName}</span>
              {p.source === "demo" && <DemoBadge>{t("product.demoBadge")}</DemoBadge>}
              {p.source === "sample" && <DemoBadge>{t("product.sampleBadge")}</DemoBadge>}
              {p.condition !== "new" && <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-surface">{cond(p.condition)}</span>}
            </div>
            <h1 className="pv-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{p.name}</h1>
            {p.variant && <p className="mt-1 text-lg text-muted">{p.variant}</p>}
            {p.description && <p className="mt-4 max-w-2xl whitespace-pre-line text-ink/90">{p.description}</p>}
            <div className="mt-5">
              <BestOfferSummary product={p} shopCount={shopCount} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <SaveButton productId={p.id} name={`${p.brandName} ${p.name}`} />
              <CompareButton productId={p.id} group={compareGroup(p)} />
              <PriceAlertButton product={p} />
            </div>
          </div>

          {p.siblings && p.siblings.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">{t("product.otherVariants")}</h2>
              <div className="flex flex-wrap gap-2">
                <span aria-current="true" className="rounded-full border border-primary bg-primary-soft px-3.5 py-1.5 text-sm font-medium text-primary-ink">
                  {p.variant || t("product.thisItem")}{p.condition !== "new" ? ` · ${cond(p.condition)}` : ""}
                </span>
                {p.siblings.map((v) => (
                  <Link key={v.slug} href={`/product/${v.slug}`} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm hover:border-primary">
                    {v.variant || v.name}{v.condition !== "new" ? ` · ${cond(v.condition)}` : ""}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <section id="offers" aria-labelledby="offers-h" className="scroll-mt-28">
            <h2 id="offers-h" className="pv-display text-xl font-bold">
              {p.offers.length === 1 ? t("product.offer1") : t(p.source === "demo" ? "product.offersDemo" : p.source === "sample" ? "product.offersSample" : "product.offersLive", { n: p.offers.length })}
            </h2>
            <p className="mb-3 mt-1 text-sm text-muted">
              <strong className="font-medium text-ink">{t("product.howMatched")} </strong>
              {p.source === "awin"
                ? p.gtin
                  ? t("product.matchGtin", { gtin: p.gtin.replace(/^0+(?=\d{13}$)/, ""), condition: cond(p.condition).toLowerCase() })
                  : t("product.matchModel", { variant: p.variant ? t("product.matchVariant", { v: p.variant }) : "" })
                : p.source === "sample"
                ? t("product.matchSample")
                : t("product.matchDemo")}
              {" "}{t("product.othersSeparate")}
            </p>
            <OfferTable product={p} />
          </section>

          <PriceHistoryChart observations={history} />
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16" aria-labelledby="rel-h">
          <SectionHeading id="rel-h" eyebrow={t("product.sameAisle")} title={t("product.moreIn", { name: sub?.name ?? dept?.name ?? t("product.thisCategory") })} />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => <li key={r.id} className="flex"><ProductCard product={r} className="w-full" /></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
