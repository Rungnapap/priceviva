import Link from "next/link";
import { shopCategories } from "@/data/shop-categories";
import { categoryLabel, type TFunction } from "@/i18n";
import { ArrowRight } from "../icons";
import { SiteImage } from "../site-image";

/**
 * Compact category grid: the 12 main categories as small photo cards with the name underneath
 * (owner-supplied photography — see shop-categories.ts), plus any further categories as links.
 */
const FEATURED = shopCategories.filter((c) => c.featured);
/** Eight photo cards (one row on wide screens); the rest stay one click away as links. */
const PRIMARY = FEATURED.slice(0, 8);

export function CategoryTiles({ t }: { t: TFunction }) {
  const others = [...FEATURED.slice(8), ...shopCategories.filter((c) => !c.featured)];
  return (
    <section aria-labelledby="cats-h" className="pa-container">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 id="cats-h" className="pv-display text-2xl font-bold text-ink sm:text-[1.75rem]">{t("home.browseCats")}</h2>
        <Link href="/departments" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-ink hover:underline">
          {t("home.viewAllCategories")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 xl:grid-cols-8">
        {PRIMARY.map((c) => (
          <li key={c.slug}>
            <Link href={`/shop/${c.slug}`} className="pv-photo-zoom group block">
              <span className="relative block aspect-[3/2] overflow-hidden rounded-xl bg-surface-2 shadow-card">
                <SiteImage src={c.image} alt={c.imageAlt} sizes="(min-width:1280px) 12vw, (min-width:640px) 25vw, 50vw" style={{ objectPosition: c.imagePosition ?? "50% 50%" }} />
              </span>
              <span className="mt-2 block break-words text-center text-sm font-medium leading-snug text-ink group-hover:text-primary">{categoryLabel(t, c.slug, c.name)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <nav aria-label={t("home.moreCategories")} className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-ink">{t("home.moreCatsLabel")}</span>
          {others.map((c) => (
            <Link key={c.slug} href={`/shop/${c.slug}`} className="rounded-full border border-line bg-surface px-3 py-1.5 text-ink hover:border-primary hover:text-primary">
              {categoryLabel(t, c.slug, c.name)}
            </Link>
          ))}
        </nav>
      )}
    </section>
  );
}
