/**
 * Command-line feed import (for first tests and for large feeds that exceed serverless time limits).
 *
 *   npm run import:feeds                         # import all enabled feeds that are due
 *   npm run import:feeds -- --force              # ignore refresh interval
 *   npm run import:feeds -- --feed <feed-uuid>   # one feed (must exist in admin), downloads from Awin
 *   npm run import:feeds -- --feed <uuid> --file ./downloaded-feed.csv(.gz)   # import a file you downloaded
 *   npm run import:feeds -- --discover           # register feeds from your Awin feed list (disabled)
 *
 * Reads configuration from .env.local (see .env.example).
 */
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { importDueFeeds, importFeed, type FeedRecord } from "../src/lib/importers/run";
import { fetchFeedList } from "../src/lib/importers/awin/feed-list";
import { rpc } from "../src/lib/server/supabase-rpc";
import { serverEnv } from "../src/lib/server/env";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const value = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  if (!serverEnv.supabaseUrl || !serverEnv.supabaseServiceKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");

  if (flag("--discover")) {
    if (!serverEnv.awinApiKey) throw new Error("Set AWIN_DATAFEED_API_KEY in .env.local");
    const feeds = await fetchFeedList(serverEnv.awinApiKey);
    await rpc("pa_admin_feeds_upsert", { provider: "awin", feeds }, { role: "service" });
    console.log(`Registered ${feeds.length} feeds (all disabled). Joined: ${feeds.filter((f) => /active|joined/i.test(f.membership_status)).length}.`);
    return;
  }

  const feedId = value("--feed");
  if (feedId) {
    const feed = await rpc<FeedRecord | null>("pa_admin_feed_get", { feed_id: feedId }, { role: "service" });
    if (!feed) throw new Error(`Feed ${feedId} not found`);
    if (!feed.enabled) throw new Error("Feed is not enabled. Enable it in /admin first (one feed at a time).");
    const file = value("--file");
    let source: AsyncIterable<string> | undefined;
    if (file) {
      const raw = createReadStream(file);
      source = (file.endsWith(".gz") ? raw.pipe(createGunzip()) : raw).setEncoding("utf8") as AsyncIterable<string>;
    }
    const r = await importFeed(feed, { trigger: "cli", source });
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.status === "failed" ? 1 : 0;
    return;
  }

  const { results, log } = await importDueFeeds({ trigger: "cli", force: flag("--force"), budgetMs: 6 * 60 * 60_000 });
  for (const l of log) console.log(l);
  console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => r.status === "failed")) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
