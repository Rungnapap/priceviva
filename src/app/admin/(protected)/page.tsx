import Link from "next/link";
import { Card, Flash, one, Pill, statusTone, when } from "@/components/admin-ui";
import { readSourceOverride } from "@/lib/server/catalog-source";
import { configStatus } from "@/lib/server/env";
import { supabaseEnvProblems } from "@/lib/server/env-check";
import { rpc, rpcConfigured } from "@/lib/server/supabase-rpc";

interface Overview {
  feeds: { id: string; advertiser_name: string; enabled: boolean; last_status: string | null; last_success_at: string | null; active_offers: number }[];
  counts: Record<string, number>;
  recent_runs: { id: string; feed_name: string; status: string; started_at: string; rows_total: number; rows_imported: number; rows_rejected: number; offers_deactivated: number; message: string | null }[];
}

export default async function AdminOverview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const cfg = configStatus();
  let data: Overview | null = null;
  let error: string | null = null;
  if (rpcConfigured("service")) {
    try {
      data = await rpc<Overview>("pa_admin_overview", {}, { role: "service" });
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const checks: [string, boolean, string][] = [
    ["Supabase URL", cfg.supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"],
    ["Supabase anon key", cfg.supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ["Supabase service-role key", cfg.supabaseServiceKey, "SUPABASE_SERVICE_ROLE_KEY (server only)"],
    ["Awin data-feed API key", cfg.awinApiKey, "AWIN_DATAFEED_API_KEY"],
    ["Awin publisher ID", cfg.awinPublisherId, "AWIN_PUBLISHER_ID"],
    ["Cron secret", cfg.cronSecret, "CRON_SECRET"],
  ];
  const envProblems = supabaseEnvProblems(process.env);
  const override = readSourceOverride();
  const sources: { v: string; title: string; text: string; disabled?: boolean }[] = [
    { v: "sample", title: "DEMO API — test mode", text: "Sample products from the free DummyJSON API + demonstration offers from data/sample-offers.csv. For local testing only." },
    { v: "live", title: "REAL FEED — authorised data", text: "Products and offers imported from approved Awin feeds (Supabase).", disabled: !cfg.supabaseUrl || !cfg.supabaseAnonKey },
    { v: "demo", title: "Built-in fictional demo", text: "The original offline demo catalogue (no internet needed)." },
  ];
  const c = data?.counts ?? {};
  const tiles: [string, number | undefined, string?][] = [
    ["Products (variants)", c.variants],
    ["Active offers", c.active_offers],
    ["Stale offers (>7 days)", c.stale_offers, "/admin/issues?kind=stale"],
    ["Missing photos", c.missing_photos, "/admin/issues?kind=missing_photos"],
    ["Open match reviews", c.open_reviews, "/admin/issues?kind=reviews"],
    ["Unmapped categories", c.unmapped_categories, "/admin/issues?kind=categories"],
    ["Store-link clicks (7 days)", c.clicks_7d],
  ];
  return (
    <div className="space-y-6">
      <Flash ok={one(sp.ok)} err={one(sp.err) ?? error ?? undefined} />
      <Card title="Catalogue source">
        <p className="mb-3 text-sm">
          Showing now: <Pill tone={cfg.catalogMode === "live" ? "ok" : "warn"}>{cfg.catalogMode === "live" ? "REAL FEED" : cfg.catalogMode === "sample" ? "DEMO API (test mode)" : "Built-in demo"}</Pill>
          {cfg.catalogSourceRequested !== cfg.catalogMode && <span className="ml-2 text-warning-ink">(real feed requested but Supabase is not configured — falling back to test mode)</span>}
          <span className="ml-2 text-xs text-muted">{override ? "set by this switch" : "from CATALOG_SOURCE / default"}</span>
        </p>
        <form method="post" action="/api/admin/catalog-source" className="grid gap-3 md:grid-cols-3">
          {sources.map((o) => (
            <label key={o.v} className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm ${cfg.catalogMode === o.v ? "border-primary bg-primary-soft" : "border-line"} ${o.disabled ? "cursor-not-allowed opacity-60" : ""}`}>
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="source" value={o.v} defaultChecked={cfg.catalogSourceRequested === o.v} disabled={o.disabled} /> {o.title}
              </span>
              <span className="text-muted">{o.text}{o.disabled ? " Configure Supabase first." : ""}</span>
            </label>
          ))}
          <div className="flex flex-wrap gap-2 md:col-span-3">
            <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover">Switch</button>
          </div>
        </form>
        {override && (
          <form method="post" action="/api/admin/catalog-source" className="mt-2">
            <input type="hidden" name="source" value="env" />
            <button type="submit" className="text-xs text-muted underline">Clear switch (use CATALOG_SOURCE)</button>
          </form>
        )}
        <p className="mt-3 text-xs text-muted">The switch is saved in <code>.data/catalog-source.json</code> on this server. On read-only hosting, set <code>CATALOG_SOURCE</code> instead.</p>
      </Card>

      <Card title="Configuration (needed for REAL FEED mode)">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {checks.map(([label, ok, env]) => (
            <li key={label} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
              <span>{label} <span className="block text-xs text-muted">{env}</span></span>
              <Pill tone={ok ? "ok" : "warn"}>{ok ? "Set" : "Missing"}</Pill>
            </li>
          ))}
        </ul>
        {envProblems.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm" aria-label="Configuration problems">
            {envProblems.map((p) => (
              <li key={p.variable + p.message} className={`rounded-lg px-3 py-2 ${p.level === "error" ? "bg-error-soft text-error-ink" : "bg-warning-soft text-warning-ink"}`}>
                <strong>{p.level === "error" ? "Problem" : "Check"}:</strong> <code>{p.variable}</code> {p.message}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">
          Secrets are read on the server only and never shown here. Feeds that may be enabled at once: {cfg.maxEnabledFeeds} (AWIN_MAX_ENABLED_FEEDS). Max rows per import: {cfg.maxRowsPerFeed.toLocaleString("en")}.
        </p>
      </Card>

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map(([label, n, href]) => {
              const body = (
                <>
                  <span className="block text-2xl font-semibold">{(n ?? 0).toLocaleString("en")}</span>
                  <span className="text-sm text-muted">{label}</span>
                </>
              );
              return href ? (
                <Link key={label} href={href} className="rounded-2xl border border-line bg-surface p-4 hover:border-primary">{body}</Link>
              ) : (
                <div key={label} className="rounded-2xl border border-line bg-surface p-4">{body}</div>
              );
            })}
          </div>

          <Card title="Feeds" action={<Link href="/admin/feeds" className="text-sm font-semibold text-primary-ink hover:underline">Manage feeds →</Link>}>
            {data.feeds.filter((f) => f.enabled).length === 0 ? (
              <p className="text-sm text-muted">No feed is enabled. Go to Feeds → “Discover feeds”, then enable one approved advertiser’s feed for the first test.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {data.feeds.filter((f) => f.enabled).map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium">{f.advertiser_name}</span>
                    <span className="flex items-center gap-2 text-muted">{f.active_offers} active offers · last success {when(f.last_success_at)} <Pill tone={statusTone(f.last_status)}>{f.last_status ?? "never run"}</Pill></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent import runs">
            {data.recent_runs.length === 0 ? (
              <p className="text-sm text-muted">No imports yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="text-xs uppercase text-muted"><tr><th className="py-2">Feed</th><th>Started</th><th>Status</th><th>Rows</th><th>Imported</th><th>Rejected</th><th>Deactivated</th></tr></thead>
                  <tbody>
                    {data.recent_runs.map((r) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="py-2"><Link href={`/admin/runs/${r.id}`} className="font-medium text-primary-ink hover:underline">{r.feed_name}</Link></td>
                        <td>{when(r.started_at)}</td>
                        <td><Pill tone={statusTone(r.status)}>{r.status}</Pill></td>
                        <td>{r.rows_total}</td><td>{r.rows_imported}</td><td>{r.rows_rejected}</td><td>{r.offers_deactivated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      {!rpcConfigured("service") && <p className="text-sm text-muted">Connect Supabase to see feeds and data quality. Until then the public site runs in demo mode.</p>}
    </div>
  );
}
