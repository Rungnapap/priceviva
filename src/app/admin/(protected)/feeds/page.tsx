import Link from "next/link";
import { Card, Flash, one, Pill, statusTone, when } from "@/components/admin-ui";
import { serverEnv } from "@/lib/server/env";
import { rpc, rpcConfigured } from "@/lib/server/supabase-rpc";
import { SUPPORTED_COUNTRIES } from "@/lib/types";

interface FeedRow {
  id: string;
  external_feed_id: string;
  advertiser_id: string | null;
  advertiser_name: string | null;
  name: string | null;
  country: string | null;
  currency: string | null;
  language: string | null;
  membership_status: string | null;
  enabled: boolean;
  refresh_hours: number;
  vat_included: boolean;
  has_download_url: boolean;
  provider_last_imported_at: string | null;
  last_success_at: string | null;
  last_status: string | null;
  last_message: string | null;
  active_offers: number;
  last_run: { id: string } | null;
}

export default async function AdminFeeds({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (!rpcConfigured("service")) return <p className="text-sm text-muted">Supabase is not configured (SUPABASE_SERVICE_ROLE_KEY).</p>;
  const { feeds } = await rpc<{ feeds: FeedRow[] }>("pa_admin_overview", {}, { role: "service" });
  const enabledCount = feeds.filter((f) => f.enabled).length;
  const anySuccess = feeds.some((f) => f.last_success_at);
  return (
    <div className="space-y-6">
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      <Card
        title="Awin feeds"
        action={
          <form method="post" action="/api/admin/feeds/discover">
            <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover" disabled={!serverEnv.awinApiKey}>
              Discover feeds from Awin
            </button>
          </form>
        }
      >
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>“Discover feeds” lists feeds from advertisers you have joined (nothing is enabled).</li>
          <li>Enable <strong>one</strong> approved feed and press “Run import now”. Check the run’s errors.</li>
          <li>Only after a successful run can another feed be enabled (limit: {serverEnv.maxEnabledFeeds}). Large feeds: use <code>npm run import:feeds -- --feed &lt;id&gt;</code>.</li>
        </ol>
        {!anySuccess && enabledCount > 0 && <p className="mt-3 text-sm text-warning-ink">Test the enabled feed first — a second feed can be enabled after it succeeds.</p>}
      </Card>

      {feeds.length === 0 ? (
        <p className="text-sm text-muted">No feeds registered yet.</p>
      ) : (
        <ul className="space-y-3">
          {feeds.map((f) => {
            const joined = /active|joined/i.test(f.membership_status ?? "");
            return (
              <li key={f.id} className={`rounded-2xl border bg-surface p-4 ${f.enabled ? "border-primary/40" : "border-line"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{f.advertiser_name ?? "Unknown advertiser"} <span className="text-sm font-normal text-muted">· {f.name} · feed {f.external_feed_id}</span></p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Pill tone={joined ? "ok" : "warn"}>{f.membership_status || "membership unknown"}</Pill>
                      <span>{f.country ?? "no country"} · {f.currency ?? "no currency"} · {f.language ?? "?"}</span>
                      <span>Awin updated {when(f.provider_last_imported_at)}</span>
                      <span>{f.active_offers} active offers</span>
                      {f.last_status && <Pill tone={statusTone(f.last_status)}>{f.last_status}</Pill>}
                      {f.last_run && <Link className="text-primary-ink underline" href={`/admin/runs/${f.last_run.id}`}>last run</Link>}
                    </p>
                    {f.last_message && <p className="mt-1 text-xs text-muted">{f.last_message}</p>}
                    {!f.has_download_url && <p className="mt-1 text-xs text-warning-ink">No download URL yet — run Discover, or paste a Create-a-Feed URL below.</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form method="post" action={`/api/admin/feeds/${f.id}`}>
                      <input type="hidden" name="action" value={f.enabled ? "disable" : "enable"} />
                      <button type="submit" className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-surface-2">{f.enabled ? "Disable" : "Enable"}</button>
                    </form>
                    {f.enabled && (
                      <form method="post" action={`/api/admin/feeds/${f.id}/run`}>
                        <button type="submit" className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover">Run import now</button>
                      </form>
                    )}
                  </div>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-primary-ink">Settings</summary>
                  <form method="post" action={`/api/admin/feeds/${f.id}`} className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <input type="hidden" name="action" value="settings" />
                    <label className="space-y-1">
                      <span className="block text-muted">Home country (sets currency)</span>
                      <select name="country" defaultValue={f.country ?? ""} className="h-10 w-full rounded-lg border border-line bg-surface px-2">
                        <option value="">—</option>
                        {SUPPORTED_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="block text-muted">Refresh every (hours, 6–168)</span>
                      <input name="refresh_hours" type="number" min={6} max={168} defaultValue={f.refresh_hours} className="h-10 w-full rounded-lg border border-line bg-surface px-2" />
                    </label>
                    <label className="flex items-center gap-2 sm:col-span-2">
                      <input name="vat_included" type="checkbox" defaultChecked={f.vat_included} /> Prices include VAT (normal for consumer feeds)
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="block text-muted">Create-a-Feed download URL (optional; the API key in it is discarded, never stored)</span>
                      <input name="download_url" type="url" placeholder="https://productdata.awin.com/datafeed/download/apikey/…" className="h-10 w-full rounded-lg border border-line bg-surface px-2" autoComplete="off" />
                    </label>
                    <button type="submit" className="h-10 rounded-full border border-line px-4 hover:bg-surface-2 sm:w-fit">Save settings</button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
