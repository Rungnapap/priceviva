import { shopCategoryHref } from "@/data/shop-categories";
import Link from "next/link";
import type { ReactNode } from "react";
import { backdrops } from "@/data/site-backgrounds";
import { BackdropImage } from "../backdrop-image";
import { Globe, MapPin } from "../icons";
import { SearchBox } from "../search-box";
import type { TFunction } from "@/i18n";

const POPULAR = ["electronics", "beauty", "home-living", "fashion", "sports-outdoor"] as const;

/**
 * Homepage hero: what PriceViva does, one big search, and (on wide screens) a small labelled example comparison.
 * The photo is a band above the text up to 1279 px and a full background from 1280 px, with the text on the light
 * left side and the example card low on the right, below the shoppers' faces.
 */
export function Hero({ t, example }: { t: TFunction; example?: ReactNode }) {
  return (
    <section aria-labelledby="hero-h" className="relative isolate border-b border-line bg-surface xl:min-h-[540px]">
      <div className="relative h-52 overflow-hidden sm:h-60 md:h-64 xl:absolute xl:inset-0 xl:-z-10 xl:h-auto">
        <BackdropImage image={backdrops.home} decorative={false} priority className="object-[50%_22%]" />
        <div className="pv-wash-hero absolute inset-0 hidden xl:block" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent xl:hidden" />
      </div>

      <div className="pa-container relative flex flex-col gap-8 pb-8 pt-1 md:pb-10 xl:min-h-[540px] xl:flex-row xl:items-end xl:justify-between xl:py-12">
        <div className="w-full max-w-2xl xl:max-w-[42rem] xl:self-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-ink sm:text-[13px]">
            <Globe className="h-3.5 w-3.5" aria-hidden="true" /> {t("home.pill")}
          </p>
          <h1 id="hero-h" className="pv-display text-[2.1rem] font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl xl:text-[3.4rem]">
            {t("home.title1")}
            <br />
            <span className="text-primary">{t("home.title2")}</span>
          </h1>
          <p className="pv-display mt-3 text-lg font-bold text-ink sm:text-xl">{t("home.tagline")}</p>
          <p className="mt-2 max-w-[34rem] text-base leading-relaxed text-ink/80">{t("home.lead")}</p>

          <div className="mt-6">
            {/* On phones the question is too long for the box, so it is shown above it instead of as a cut-off placeholder. */}
            <p className="mb-2 font-semibold text-ink sm:hidden" aria-hidden="true">{t("search.placeholderHero")}</p>
            <div className="rounded-full shadow-[0_20px_44px_-16px_rgb(14_26_51/0.45)]">
              <SearchBox size="hero" placeholder={t("search.placeholderHero")} placeholderFrom="sm" quietCamera />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
            <span className="rounded-full bg-surface/85 px-1.5 text-muted">{t("home.popularCats")}</span>
            {POPULAR.map((slug) => (
              <Link key={slug} href={shopCategoryHref(slug)} className="rounded-full border border-line bg-surface/95 px-3 py-1 text-ink hover:border-primary hover:text-primary">
                {t(`cat.${slug}`)}
              </Link>
            ))}
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="rounded-full bg-surface/85 px-1.5 text-muted">{t("home.alsoExplore")}</span>
            <Link href="/compare" className="inline-flex items-center gap-1.5 rounded-full bg-surface/85 px-1.5 font-semibold text-primary-ink hover:underline">
              <Globe className="h-4 w-4" aria-hidden="true" /> {t("nav.globalCompare")}
            </Link>
            <Link href="/deals" className="inline-flex items-center gap-1.5 rounded-full bg-surface/85 px-1.5 font-semibold text-radar-ink hover:underline">
              <MapPin className="h-4 w-4" aria-hidden="true" /> {t("nav.localDealRadar")}
            </Link>
          </p>
        </div>

        {/* Example comparison: wide screens only, low on the right so it never covers faces. */}
        {example && <div className="hidden w-[21rem] shrink-0 xl:block 2xl:w-[23rem]">{example}</div>}
      </div>
    </section>
  );
}
