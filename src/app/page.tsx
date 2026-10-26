import Link from "next/link";
import { getRepository } from "@/lib/catalog/repository";
import { pickFeatured } from "@/lib/featured";
import { CategoryTiles } from "@/components/home/category-tiles";
import { Hero } from "@/components/home/hero";
import { Benefits } from "@/components/home/benefits";
import { HowItWorks } from "@/components/home/how-it-works";
import { ArrowRight } from "@/components/icons";
import { ProductStrip } from "@/components/home/product-strip";
import { ExampleComparison } from "@/components/home/example-comparison";
import { SectionHeading } from "@/components/ui";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n";

// Reads the language cookie, so it renders per request.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const repo = getRepository();
  const [meta, locale] = await Promise.all([repo.meta(), getLocale()]);
  const t = makeT(locale);
  const live = meta.mode === "live";
  const sample = meta.mode === "sample" && !meta.notice?.includes("built-in");
  const featured = pickFeatured(await repo.shelf({ limit: 120 }));
  // The hero example uses a real catalogue product with offers from at least two different shops; nothing is made up.
  const shops = (p: (typeof featured)[number]) => new Set(p.offers.filter((o) => !o.informational).map((o) => o.retailer.id)).size;
  const example = featured.find((p) => shops(p) >= 2);
  const dataLabel = live ? undefined : sample ? t("home.sampleData") : t("home.demoData");
  return (
    <>
      {/* A deliberately short page: search first, then what PriceViva does, how it works, products and categories.
          Global Compare, Local Deal Radar, favourites and alerts stay in the header, tab bar and footer. */}
      <Hero t={t} example={example && <ExampleComparison product={example} />} />

      <div className="space-y-12 pt-6 sm:space-y-14 sm:pt-8">
        <Benefits t={t} />
        <HowItWorks t={t} />

        {/* Products and categories sit close together as one browsing block. */}
        <div className="space-y-9 sm:space-y-10">
        <section aria-labelledby="featured-h" className="pa-container">
          <SectionHeading
            id="featured-h"
            eyebrow={dataLabel}
            title={t("home.featuredTitle")}
            action={
              <Link href="/search" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-ink hover:underline">
                {t("home.seeMore")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
          />
          {!live && <p className="-mt-3 mb-5 max-w-3xl text-sm text-muted">{sample ? t("home.sampleNote") : t("home.demoNote")}</p>}
          {featured.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">{t("home.noProducts")}</p>
          ) : (
            <ProductStrip products={featured.slice(0, 5)} />
          )}
        </section>

        <CategoryTiles t={t} />
        </div>
      </div>
    </>
  );
}
