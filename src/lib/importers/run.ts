/**
 * Feed import orchestrator (server-only). Used by the cron route, the admin "Run now" button and the CLI.
 *
 * Flow: start run -> stream CSV -> validate header -> map + validate rows -> batch upsert (matching in SQL)
 *       -> log errors -> finish. Offers that disappeared are deactivated ONLY after a complete, healthy run.
 */
import { csvObjects } from "./csv";
import { checkAwinHeader, mapAwinRow } from "./awin/map-row";
import { fetchFeedList, fromUrlTemplate } from "./awin/feed-list";
import { downloadFeed } from "./download";
import { fetchEcbRates } from "./fx-ecb";
import type { FeedContext, NormalizedRow, RowIssue } from "./types";
import { redact, serverEnv } from "@/lib/server/env";
import { rpc } from "@/lib/server/supabase-rpc";
import { SUPPORTED_COUNTRIES, SUPPORTED_CURRENCIES, type CountryCode, type CurrencyCode } from "@/lib/types";

export interface FeedRecord {
  id: string;
  provider: "awin";
  external_feed_id: string;
  advertiser_id: string | null;
  advertiser_name: string | null;
  name: string | null;
  country: string | null;
  currency: string | null;
  vat_included: boolean;
  enabled: boolean;
  download_url_template: string | null;
  provider_last_imported_at: string | null;
  last_success_at: string | null;
  refresh_hours: number;
}

/** Where import results are written. The real one calls Supabase RPCs; tests can substitute another. */
export interface ImportSink {
  start(feedId: string, trigger: string): Promise<{ started: boolean; run_id?: string; reason?: string; active_offers?: number }>;
  batch(p: { run_id: string; feed_id: string; source: string; retailer: FeedContext["retailer"]; rows: NormalizedRow[] }): Promise<unknown>;
  logErrors(runId: string, errors: RowIssue[]): Promise<unknown>;
  finish(p: { run_id: string; status: "succeeded" | "partial" | "failed"; rows_total: number; message: string }): Promise<{ offers_deactivated?: number }>;
}

export const rpcSink: ImportSink = {
  start: (feedId, trigger) => rpc("pa_import_start", { feed_id: feedId, trigger }, { role: "service" }),
  batch: (p) => rpc("pa_import_batch", p, { role: "service", timeoutMs: 120_000 }),
  logErrors: (runId, errors) =>
    rpc("pa_import_log_errors", { run_id: runId, errors: errors.map((e) => ({ ...e, message: redact(e.message) })) }, { role: "service" }),
  finish: (p) => rpc("pa_import_finish", p, { role: "service" }),
};

export interface ImportResult {
  feedId: string;
  status: "succeeded" | "partial" | "failed" | "skipped";
  runId?: string;
  rowsTotal: number;
  rowsImported: number;
  rowsRejected: number;
  warnings: number;
  offersDeactivated?: number;
  message: string;
}

const BATCH = 250;
const MAX_STORED_ISSUES = 2000;

export async function importFeed(
  feed: FeedRecord,
  opts: {
    trigger: "cron" | "manual" | "cli" | "test";
    sink?: ImportSink;
    /** Provide text chunks directly (local file / tests). Otherwise the feed is downloaded from Awin. */
    source?: AsyncIterable<string> | Iterable<string>;
    maxRows?: number;
    deadline?: number; // epoch ms
  },
): Promise<ImportResult> {
  const sink = opts.sink ?? rpcSink;
  const maxRows = opts.maxRows ?? serverEnv.maxRowsPerFeed;
  const base = { feedId: feed.id, rowsTotal: 0, rowsImported: 0, rowsRejected: 0, warnings: 0 };

  if (!feed.country || !SUPPORTED_COUNTRIES.includes(feed.country as CountryCode))
    return { ...base, status: "skipped", message: `Feed country ${feed.country ?? "(none)"} is not supported yet (${SUPPORTED_COUNTRIES.join(", ")}).` };
  if (!feed.currency || !SUPPORTED_CURRENCIES.includes(feed.currency as CurrencyCode))
    return { ...base, status: "skipped", message: `Feed currency ${feed.currency ?? "(none)"} is not supported yet.` };

  const started = await sink.start(feed.id, opts.trigger);
  if (!started.started || !started.run_id) return { ...base, status: "skipped", message: started.reason ?? "Run not started" };
  const runId = started.run_id;
  const previouslyActive = started.active_offers ?? 0;

  const ctx: FeedContext = {
    feedId: feed.id,
    source: "awin",
    country: feed.country,
    currency: feed.currency,
    vatIncluded: feed.vat_included,
    retailer: { external_id: feed.advertiser_id ?? `feed-${feed.external_feed_id}`, name: feed.advertiser_name ?? `Awin advertiser ${feed.advertiser_id}`, country: feed.country },
  };

  let rowsTotal = 0, imported = 0, rejected = 0, warnings = 0, storedIssues = 0;
  let batch: NormalizedRow[] = [];
  let issues: RowIssue[] = [];
  const seen = new Set<string>();
  let truncated: string | null = null;

  const flushIssues = async () => {
    if (issues.length === 0) return;
    const room = Math.max(0, MAX_STORED_ISSUES - storedIssues);
    const toStore = issues.slice(0, room);
    if (toStore.length) await sink.logErrors(runId, toStore);
    storedIssues += toStore.length;
    issues = [];
  };
  const flushBatch = async () => {
    if (batch.length === 0) return;
    await sink.batch({ run_id: runId, feed_id: feed.id, source: "awin", retailer: ctx.retailer, rows: batch });
    imported += batch.length;
    batch = [];
  };

  try {
    let chunks = opts.source;
    if (!chunks) {
      const key = serverEnv.awinApiKey;
      if (!key) throw new Error("AWIN_DATAFEED_API_KEY is not set.");
      if (!feed.download_url_template) throw new Error("This feed has no download URL. Run 'Discover feeds' or paste a Create-a-Feed URL in admin.");
      chunks = await downloadFeed(fromUrlTemplate(feed.download_url_template, key));
    }

    let headerChecked = false;
    for await (const { row, values, header } of csvObjects(chunks)) {
      if (!headerChecked) {
        const h = checkAwinHeader(header);
        if (!h.ok) throw new Error(`Feed is missing required columns: ${h.missing.join(", ") || "unrecognised format"}.`);
        headerChecked = true;
      }
      rowsTotal++;
      if (rowsTotal > maxRows) {
        truncated = `Stopped after ${maxRows} rows (IMPORT_MAX_ROWS_PER_FEED).`;
        rowsTotal--;
        break;
      }
      if (opts.deadline && Date.now() > opts.deadline) {
        truncated = "Stopped early to stay within the time limit.";
        break;
      }
      const mapped = mapAwinRow(values, row, ctx);
      for (const i of mapped.issues) {
        if (i.severity === "error") rejected++;
        else warnings++;
      }
      issues.push(...mapped.issues);
      if (mapped.row) {
        if (seen.has(mapped.row.external_id)) {
          rejected++;
          issues.push({ row, external_id: mapped.row.external_id, severity: "error", code: "duplicate_row", message: "Same product id appears more than once in this feed; later copy ignored." });
        } else {
          seen.add(mapped.row.external_id);
          batch.push(mapped.row);
        }
      }
      if (batch.length >= BATCH) await flushBatch();
      if (issues.length >= 200) await flushIssues();
    }
    if (!headerChecked) throw new Error("The feed file is empty.");
    await flushBatch();
    await flushIssues();

    // Safety: never deactivate the catalogue because a broken/short file arrived.
    let status: "succeeded" | "partial" | "failed" = "succeeded";
    let message = `Imported ${imported} of ${rowsTotal} rows (${rejected} rejected, ${warnings} warnings).`;
    if (imported === 0) {
      status = "failed";
      message = `No valid rows imported (${rejected} rejected). Nothing was deactivated.`;
    } else if (truncated) {
      status = "partial";
      message += ` ${truncated} Missing offers were NOT deactivated.`;
    } else if (previouslyActive > 50 && imported < previouslyActive * 0.5) {
      status = "partial";
      message += ` Only ${imported} rows vs ${previouslyActive} active offers before — treated as partial; nothing deactivated. Check the feed.`;
    }
    const fin = await sink.finish({ run_id: runId, status, rows_total: rowsTotal, message });
    return { feedId: feed.id, runId, status, rowsTotal, rowsImported: imported, rowsRejected: rejected, warnings, offersDeactivated: fin.offers_deactivated, message };
  } catch (e) {
    const message = redact(`Import failed: ${(e as Error).message}`);
    try {
      await flushIssues();
      await sink.finish({ run_id: runId, status: "failed", rows_total: rowsTotal, message });
    } catch {
      /* best effort */
    }
    return { feedId: feed.id, runId, status: "failed", rowsTotal, rowsImported: imported, rowsRejected: rejected, warnings, message };
  }
}

export async function refreshFxRates(): Promise<string> {
  const ecb = await fetchEcbRates();
  await rpc("pa_fx_upsert", { base: "EUR", as_of: ecb.asOf, source: "ECB euro foreign exchange reference rates", rates: ecb.rates }, { role: "service" });
  return ecb.asOf;
}

/** Called by the scheduler: refresh FX, then import every enabled feed whose refresh interval has passed. */
export async function importDueFeeds(opts: { trigger: "cron" | "cli" | "manual"; force?: boolean; budgetMs?: number }) {
  const deadline = Date.now() + (opts.budgetMs ?? 270_000);
  const log: string[] = [];
  try {
    log.push(`FX rates updated (${await refreshFxRates()}).`);
  } catch (e) {
    log.push(redact(`FX update skipped: ${(e as Error).message}`));
  }

  const due = await rpc<FeedRecord[]>("pa_admin_feeds_due", { force: !!opts.force }, { role: "service" });
  if (due.length === 0) return { results: [] as ImportResult[], log: [...log, "No feeds due."] };

  // Respect the provider: skip feeds Awin hasn't re-imported since our last successful run.
  let providerTimes = new Map<string, string | null>();
  if (serverEnv.awinApiKey) {
    try {
      const list = await fetchFeedList(serverEnv.awinApiKey);
      providerTimes = new Map(list.map((f) => [f.external_feed_id, f.provider_last_imported_at]));
    } catch (e) {
      log.push(redact(`Feed list check skipped: ${(e as Error).message}`));
    }
  }

  const results: ImportResult[] = [];
  for (const feed of due) {
    if (Date.now() > deadline - 30_000) {
      log.push(`Time budget reached; ${feed.advertiser_name} will run next time.`);
      break;
    }
    const providerAt = providerTimes.get(feed.external_feed_id);
    if (!opts.force && providerAt && feed.last_success_at && new Date(providerAt) <= new Date(feed.last_success_at)) {
      log.push(`${feed.advertiser_name}: unchanged at Awin since last import — skipped.`);
      continue;
    }
    results.push(await importFeed(feed, { trigger: opts.trigger, deadline }));
  }
  return { results, log };
}
