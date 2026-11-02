import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { legacyDepartmentRedirect } from "@/lib/catalog-categories";
import { getDepartment } from "@/data/departments";
import { promotions } from "@/data/places";
import { getRepository } from "@/lib/catalog/repository";
import { promoTiming } from "@/lib/location";
import { ChevronRight, DeptIcon, Package, Radar } from "@/components/icons";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/ui";
import { getT } from "@/i18n/server";

type Params = Promise<{ slug: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SP }): Promise<Metadata> {
  const slug = (await params).slug;
  const target = legacyDepartmentRedirect(slug, await searchParams);
  const d = getDepartment(target ? "furniture" : slug);
  if (!d) return { title: "Department not found" };
  // Filters (?sub=, ?page=) show the same department, so they all point search engines at the plain address.
  return { title: d.name, description: `${d.name}: ${d.tagline}. Compare prices and delivered totals from retailers on PriceViva.`, alternates: { canonical: `/departments/${d.slug}` } };
}

const GUIDANCE: Record<string, string> = {
  groceries: "Groceries are compared by unit price (per kg, litre or piece) — different pack sizes are separate products.",
  sports: "Shoes and apparel are compared per size variant. Sizes are never merged.",
  "computers-gaming": "Keyboards are compared per layout, laptops per memory/storage configuration.",
  phones: "Phones are compared per storage size and colour. Refurbished units live in their own department.",
  refurbished: "Refurbished and used items are separate listings from new ones, with their grade shown.",
};

export default async function DepartmentPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { slug } = await params;
  const redirect = legacyDepartmentRedirect(slug, await searchParams);
  if (redirect) permanentRedirect(redirect);
  const t = await getT();
  const d = getDepartment(slug);
  if (!d) notFound();
  const subRaw = (await searchParams).sub;
  const sub = typeof subRaw === "string" && d.subcategories.some((s) => s.slug === subRaw) ? subRaw : "";
  const pageRaw = (await searchParams).page;
  const page = Math.max(1, Math.min(500, Number.parseInt(typeof pageRaw === "string" ? pageRaw : "1", 10) || 1));
  const PER_PAGE = 24;
  const repo = getRepository();
  const [meta, listing] = await Promise.all([repo.meta(), repo.list({ department: d.slug, subcategory: sub || undefined, page, perPage: PER_PAGE })]);
  const list = listing.items;
  const allCount = meta.departmentCounts[d.slug] ?? 0;
  const subCount = (s: string) => meta.subcategoryCounts[`${d.slug}/${s}`] ?? 0;
  const pages = Math.max(1, Math.ceil(listing.total / PER_PAGE));
  // Local promotions: demo ones in demo mode; in live mode only verified ones (none exist until store data is imported).
  const localCount = repo.mode !== "live" ? promotions.filter((p) => p.departmentSlug === d.slug && promoTiming(p) !== "expired").length : 0;
  const hasProducts = allCount > 0;

  return (
    <div>
      <section className="border-b border-line" style={{ background: `linear-gradient(135deg, hsl(${d.hue} 80% 96%), transparent 70%)` }}>
        <div className="pa-container py-10">
          <nav aria-label={t("common.breadcrumb")} className="mb-4 flex items-center gap-1 text-sm text-muted">
            <Link href="/" className="hover:text-primary">{t("nav.home")}</Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <Link href="/departments" className="hover:text-primary">{t("dept.departments")}</Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span aria-current="page" className="text-ink">{d.name}</span>
          </nav>
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface shadow-card" style={{ color: `hsl(${d.hue} 60% 30%)` }}>
              <DeptIcon name={d.icon} className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-ink">{d.name}</h1>
              <p className="text-muted">{d.tagline}</p>
            </div>
          </div>
          {d.subcategories.length > 0 && (
            <nav aria-label={t("dept.categoriesOf", { name: d.name })} className="mt-6 flex flex-wrap gap-2">
              <Link href={`/departments/${d.slug}`} aria-current={!sub ? "page" : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-sm ${!sub ? "border-primary bg-primary text-white" : "border-line bg-surface hover:border-primary"}`}>
                {t("dept.allCount", { n: allCount })}
              </Link>
              {d.subcategories.map((s) => {
                const n = subCount(s.slug);
                return (
                  <Link key={s.slug} href={`/departments/${d.slug}?sub=${s.slug}`} aria-current={sub === s.slug ? "page" : undefined}
                    className={`rounded-full border px-3.5 py-1.5 text-sm ${sub === s.slug ? "border-primary bg-primary text-white" : "border-line bg-surface hover:border-primary"}`}>
                    {s.name} ({n})
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </section>

      <div className="pa-container py-10">
        {GUIDANCE[d.slug] && (
          <p className="mb-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            <strong className="text-ink">{t("dept.howCompare")} </strong>{GUIDANCE[d.slug]}
          </p>
        )}
        {list.length === 0 ? (
          <EmptyState title={hasProducts ? t("dept.noneInCategory") : t("shop.opensLater", { name: d.name })} icon={<Package className="h-6 w-6" />}>
            {hasProducts
              ? t("dept.noRetailer")
              : repo.mode === "sample"
              ? t("shop.emptySample")
              : repo.mode === "live"
              ? t("shop.emptyLive")
              : t("dept.emptyDemo")}
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((p) => (
              <li key={p.id} className="flex"><ProductCard product={p} className="w-full" /></li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <nav aria-label={t("search.pagination")} className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {Array.from({ length: Math.min(pages, 20) }, (_, i) => i + 1).map((n) => (
              <Link key={n} href={`/departments/${d.slug}?${new URLSearchParams({ ...(sub ? { sub } : {}), page: String(n) })}`} aria-current={n === page ? "page" : undefined}
                className={`flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm ${n === page ? "border-primary bg-primary text-white" : "border-line bg-surface hover:bg-surface-2"}`}>
                {n}
              </Link>
            ))}
          </nav>
        )}
        {localCount > 0 && (
          <Link href="/deals" className="mt-10 flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 hover:shadow-lift">
            <Radar className="h-6 w-6 text-primary" aria-hidden="true" />
            <span className="flex-1">
              <span className="block font-semibold">{t("dept.localPromos", { n: localCount, name: d.name })}</span>
              <span className="block text-sm text-muted">{t("dept.localPromosText")}</span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}
