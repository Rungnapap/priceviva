import { categoryFilter } from "@/lib/catalog-categories";
import Link from "next/link";
import { Card, Flash, one, Pill, when } from "@/components/admin-ui";
import { departments } from "@/data/departments";
import { formatMoney } from "@/lib/money";
import { rpc, rpcConfigured } from "@/lib/server/supabase-rpc";
import type { CurrencyCode } from "@/lib/types";

const KINDS = {
  stale: "Stale offers — not seen in the feed for more than 7 days (shown as stale, never as the current best)",
  missing_photos: "Products without any https photo in their feed",
  duplicates: "Possible duplicates — same brand and title but different identities. Never merged automatically; check whether they are real variants",
  reviews: "Match reviews — a GTIN was reused with a different colour/size, so the listings were kept apart",
  categories: "Category mapping — source categories and the department they appear in. Manual choices override automatic ones",
} as const;
type Kind = keyof typeof KINDS;

type Row = Record<string, unknown>;

export default async function Issues({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const kind = (Object.keys(KINDS) as Kind[]).includes(one(sp.kind) as Kind) ? (one(sp.kind) as Kind) : "stale";
  if (!rpcConfigured("service")) return <p className="text-sm text-muted">Supabase is not configured.</p>;
  const rows = await rpc<Row[]>("pa_admin_issues", { kind, limit: 200 }, { role: "service" });
  const targets = departments.flatMap((d) => [{ v: d.slug, l: d.name }, ...d.subcategories.map((s) => ({ v: `${d.slug}/${s.slug}`, l: `${d.name} › ${s.name}` }))]);

  return (
    <div className="space-y-6">
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      <nav aria-label="Issue type" className="flex flex-wrap gap-2 text-sm">
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <Link key={k} href={`/admin/issues?kind=${k}`} aria-current={k === kind ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 ${k === kind ? "border-primary bg-primary text-white" : "border-line bg-surface hover:border-primary"}`}>
            {k.replace("_", " ")}
          </Link>
        ))}
      </nav>
      <Card title={`${rows.length}${rows.length >= 200 ? "+" : ""} item${rows.length === 1 ? "" : "s"}`}>
        <p className="mb-4 text-sm text-muted">{KINDS[kind]}.</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Nothing to show.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {rows.map((r, i) => (
              <li key={String(r.id ?? i)} className="flex flex-wrap items-start justify-between gap-3 py-3">
                {kind === "stale" && (
                  <>
                    <Link href={`/product/${r.slug}`} className="font-medium text-primary-ink hover:underline">{String(r.title)}</Link>
                    <span className="text-muted">{String(r.retailer)} · {formatMoney(Number(r.price_minor), r.currency as CurrencyCode)} · last seen {when(r.last_seen_at as string)}</span>
                  </>
                )}
                {kind === "missing_photos" && (
                  <>
                    <Link href={`/product/${r.slug}`} className="font-medium text-primary-ink hover:underline">{String(r.title)}</Link>
                    <span className="text-muted">{String(r.brand ?? "—")} · GTIN {String(r.gtin ?? "none")}</span>
                  </>
                )}
                {kind === "duplicates" && (
                  <div className="w-full">
                    <p className="font-medium">{String(r.brand ?? "")} {String(r.title)} <Pill tone="warn">{String(r.n)} listings</Pill></p>
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {(r.items as Row[]).map((it) => (
                        <li key={String(it.identity)}>
                          <Link href={`/product/${it.slug}`} className="text-primary-ink underline">{String(it.variant || "(no variant)")}</Link> · {String(it.condition)} · GTIN {String(it.gtin ?? "—")} · MPN {String(it.mpn ?? "—")} · <span className="font-mono">{String(it.identity)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {kind === "reviews" && (
                  <div className="flex w-full flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{String(r.title)} <Pill tone="warn">{String(r.reason).replace(/_/g, " ")}</Pill></p>
                      <pre className="mt-1 max-w-2xl overflow-x-auto whitespace-pre-wrap rounded bg-surface-2 p-2 text-xs">{JSON.stringify(r.detail, null, 2)}</pre>
                    </div>
                    <div className="flex gap-2">
                      {(["resolved", "dismissed"] as const).map((s) => (
                        <form key={s} method="post" action={`/api/admin/reviews/${r.id}`}>
                          <input type="hidden" name="status" value={s} />
                          <button type="submit" className="rounded-full border border-line px-3 py-1.5 hover:bg-surface-2">Mark {s}</button>
                        </form>
                      ))}
                    </div>
                  </div>
                )}
                {kind === "categories" && (
                  <form method="post" action={`/api/admin/categories/${r.id}`} className="flex w-full flex-wrap items-center justify-between gap-3">
                    <span>
                      <span className="font-medium">{String(r.source_category)}</span>{" "}
                      <span className="text-muted">· {String(r.product_count)} rows · {r.manual ? "manual" : "automatic"}</span>
                      {!r.department_slug && <> <Pill tone="warn">unmapped — searchable only</Pill></>}
                    </span>
                    <span className="flex gap-2">
                      <label className="sr-only" htmlFor={`t-${r.id}`}>Department</label>
                      <select id={`t-${r.id}`} name="target" defaultValue={categoryFilter(r.department_slug ? `${r.department_slug}${r.subcategory_slug ? `/${r.subcategory_slug}` : ""}` : "")} className="h-9 rounded-lg border border-line bg-surface px-2">
                        <option value="">(unmapped)</option>
                        {targets.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                      </select>
                      <button type="submit" className="rounded-full border border-line px-3 hover:bg-surface-2">Save</button>
                    </span>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
