import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { legacySearchRedirect } from "@/lib/catalog-categories";
import { departments } from "@/data/departments";
import { getRepository } from "@/lib/catalog/repository";
import type { SortKey } from "@/lib/search";
import type { Condition } from "@/lib/types";
import { Search } from "@/components/icons";
import { SearchResults } from "@/components/search-results";
import { PriceRangeFields } from "@/components/price-range-fields";
import { parsePriceInput } from "@/lib/listing-price";
import { DISPLAY_CURRENCIES, type CurrencyCode } from "@/lib/types";
import { EmptyState } from "@/components/ui";
import { getT } from "@/i18n/server";

type SP = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const SORTS = { relevance: "search.sortRelevance", price_asc: "search.sortAsc", price_desc: "search.sortDesc", name: "search.sortName" } as const satisfies Record<SortKey, string>;
const CONDITIONS = { new: "cond.new", open_box: "cond.open_box", refurbished: "cond.refurbished", used: "cond.used" } as const satisfies Record<Condition, string>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const q = one((await searchParams).q).slice(0, 80);
  return { title: q ? `Search: ${q}` : "Search" };
}

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const redirect = legacySearchRedirect(sp);
  if (redirect) permanentRedirect(redirect);
  const t = await getT();
  // Validate & bound everything that comes from the URL.
  const q = one(sp.q).slice(0, 120);
  // Category filter: "department" or "department/subcategory".
  const [deptRaw = "", subRaw = ""] = one(sp.dept).split("/");
  const deptObj = departments.find((d) => d.slug === deptRaw);
  const dept = deptObj ? deptRaw : "";
  const sub = deptObj?.subcategories.some((x) => x.slug === subRaw) ? subRaw : "";
  const repo = getRepository();
  const meta = await repo.meta().catch(() => null);
  const brands = await repo.brands(); // brand filter is offered where the source has brand data (demo, sample)
  const brand = brands.some((b) => b.slug === one(sp.brand)) ? one(sp.brand) : "";
  const cond = (Object.keys(CONDITIONS) as Condition[]).includes(one(sp.cond) as Condition) ? (one(sp.cond) as Condition) : undefined;
  const sort: SortKey = (Object.keys(SORTS) as SortKey[]).includes(one(sp.sort) as SortKey) ? (one(sp.sort) as SortKey) : "relevance";
  const page = Math.max(1, Math.min(999, Number.parseInt(one(sp.page), 10) || 1));
  // Price range (major units) in the currency it was typed in (cur); applied in the browser, where the visitor's
  // delivery country and display currency are known. Invalid values are ignored and explained, never guessed.
  const num = (v: string) => { const n = parsePriceInput(v.slice(0, 20)); return n === null || Number.isNaN(n) ? null : n; };
  const invalidRange = [one(sp.min), one(sp.max)].some((v) => Number.isNaN(parsePriceInput(v.slice(0, 20))));
  let min = num(one(sp.min));
  let max = num(one(sp.max));
  const reversed = min !== null && max !== null && min > max;
  if (reversed) {
    min = null;
    max = null;
  }
  const cur = (DISPLAY_CURRENCIES as readonly string[]).includes(one(sp.cur)) ? (one(sp.cur) as CurrencyCode) : null;
  const ranged = min !== null || max !== null;

  let hits: Awaited<ReturnType<typeof repo.search>>["items"] = [];
  let suggestion: string | null = null;
  let failed = false;
  try {
    const r = await repo.search(q, { department: dept || undefined, condition: cond, brand: brand || undefined });
    hits = sub ? r.items.filter((p) => p.subcategory === sub) : r.items;
    suggestion = r.suggestion;
  } catch {
    failed = true;
  }

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (dept) params.set("dept", sub ? `${dept}/${sub}` : dept);
  if (brand) params.set("brand", brand);
  if (cond) params.set("cond", cond);
  if (sort !== "relevance") params.set("sort", sort);
  if (min !== null) params.set("min", String(min));
  if (max !== null) params.set("max", String(max));
  if (ranged && cur) params.set("cur", cur);

  return (
    <div className="pa-container py-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {q ? t("search.resultsFor", { q }) : t("search.browseAll")}
      </h1>
      {/* With a price range, the browser shows how many of these are in range (prices depend on the visitor's settings). */}
      {!ranged && (
        <p className="mt-1 text-sm text-muted">
          {hits.length === 1 ? t("search.count1") : t("search.count", { n: hits.length })}
        </p>
      )}

      {/* Plain GET form: works without JavaScript and produces shareable URLs. */}
      <form action="/search" method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="sq" className="mb-1 block text-xs font-medium text-muted">{t("search.button")}</label>
          <input key={q} id="sq" name="q" defaultValue={q} type="search" className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
        </div>
        <div>
          <label htmlFor="sdept" className="mb-1 block text-xs font-medium text-muted">{t("search.category")}</label>
          <select id="sdept" name="dept" defaultValue={sub ? `${dept}/${sub}` : dept} className="h-10 max-w-[16rem] rounded-lg border border-line bg-surface px-2 text-sm">
            <option value="">{t("radar.allCategories")}</option>
            {departments
              .filter((d) => (meta?.departmentCounts[d.slug] ?? 0) > 0 || d.slug === dept)
              .map((d) => (
                <optgroup key={d.slug} label={d.name}>
                  <option value={d.slug}>{t("search.allIn", { name: d.name, n: meta?.departmentCounts[d.slug] ?? 0 })}</option>
                  {d.subcategories
                    .filter((x) => (meta?.subcategoryCounts[`${d.slug}/${x.slug}`] ?? 0) > 0)
                    .map((x) => (
                      <option key={x.slug} value={`${d.slug}/${x.slug}`}>
                        {x.name} ({meta?.subcategoryCounts[`${d.slug}/${x.slug}`]})
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>
        </div>
        {brands.length > 0 && (
          <div>
            <label htmlFor="sbrand" className="mb-1 block text-xs font-medium text-muted">{t("compare.brand")}</label>
            <select id="sbrand" name="brand" defaultValue={brand} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
              <option value="">{t("search.all")}</option>
              {brands.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="scond" className="mb-1 block text-xs font-medium text-muted">{t("compare.condition")}</label>
          <select id="scond" name="cond" defaultValue={cond ?? ""} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value="">{t("search.any")}</option>
            {Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ssort" className="mb-1 block text-xs font-medium text-muted">{t("radar.sort")}</label>
          <select id="ssort" name="sort" defaultValue={sort} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
        </div>
        <PriceRangeFields min={min} max={max} />
        <button type="submit" className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">{t("search.apply")}</button>
        {(dept || brand || cond || sort !== "relevance" || ranged || reversed || invalidRange) && (
          <Link href={q ? `/search?q=${encodeURIComponent(q)}` : "/search"} className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-2">{t("search.clearFilters")}</Link>
        )}
      </form>

      {(reversed || invalidRange) && (
        <p role="alert" className="mt-3 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-sm text-warning-ink">
          {t(reversed ? "search.rangeOrderIgnored" : "search.rangeInvalidIgnored")}
        </p>
      )}

      <div className="mt-8">
        {failed ? (
          <EmptyState title={t("search.unavailable")} icon={<Search className="h-6 w-6" />}>
            {t("search.unavailableText")}
          </EmptyState>
        ) : hits.length === 0 ? (
          <EmptyState title={t("search.noMatch", { q })} icon={<Search className="h-6 w-6" />}>
            {suggestion && (
              <p className="mb-2">
                {t("search.didYouMean")}{" "}
                <Link href={`/search?q=${encodeURIComponent(suggestion)}`} className="font-semibold text-primary-ink underline">{suggestion}</Link>?
              </p>
            )}
            <p>{t("search.neverInvent")} <Link href="/departments" className="text-primary-ink underline">{t("search.departments")}</Link>.</p>
          </EmptyState>
        ) : (
          <SearchResults products={hits} sort={sort} page={page} baseQuery={params.toString()} min={min} max={max} rangeCurrency={cur} />
        )}
      </div>
    </div>
  );
}
