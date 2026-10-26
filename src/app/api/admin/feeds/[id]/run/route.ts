import { importFeed, type FeedRecord } from "@/lib/importers/run";
import { guardAdminPost } from "@/lib/server/admin-auth";
import { redact } from "@/lib/server/env";
import { rpc } from "@/lib/server/supabase-rpc";
import { back } from "@/lib/server/admin-redirect";

export const runtime = "nodejs";
export const maxDuration = 300;

/** "Run import now" for one enabled feed. Large feeds should use `npm run import:feeds` instead. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdminPost(req);
  if (denied) return denied;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Bad id", { status: 400 });
  try {
    const feed = await rpc<FeedRecord | null>("pa_admin_feed_get", { feed_id: id }, { role: "service" });
    if (!feed) return back(req, "/admin/feeds", "Feed not found.", false);
    if (!feed.enabled) return back(req, "/admin/feeds", "Enable the feed before importing.", false);
    const r = await importFeed(feed, { trigger: "manual", deadline: Date.now() + 270_000 });
    const dest = r.runId ? `/admin/runs/${r.runId}` : "/admin/feeds";
    return back(req, dest, `${r.status.toUpperCase()}: ${r.message}`, r.status === "succeeded");
  } catch (e) {
    return back(req, "/admin/feeds", redact((e as Error).message), false);
  }
}
