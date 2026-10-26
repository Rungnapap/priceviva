import { fetchFeedList } from "@/lib/importers/awin/feed-list";
import { guardAdminPost } from "@/lib/server/admin-auth";
import { redact, serverEnv } from "@/lib/server/env";
import { rpc } from "@/lib/server/supabase-rpc";
import { back } from "@/lib/server/admin-redirect";

export const runtime = "nodejs";

/** Pull the publisher's Awin feed list and register the feeds (all stay disabled). */
export async function POST(req: Request) {
  const denied = await guardAdminPost(req);
  if (denied) return denied;
  if (!serverEnv.awinApiKey) return back(req, "/admin/feeds", "AWIN_DATAFEED_API_KEY is not set.", false);
  try {
    const feeds = await fetchFeedList(serverEnv.awinApiKey);
    await rpc("pa_admin_feeds_upsert", { provider: "awin", feeds }, { role: "service" });
    const joined = feeds.filter((f) => /active|joined/i.test(f.membership_status)).length;
    return back(req, "/admin/feeds", `Found ${feeds.length} feeds (${joined} from advertisers you have joined). Nothing was enabled.`);
  } catch (e) {
    return back(req, "/admin/feeds", redact((e as Error).message), false);
  }
}
