import { readUnsubscribeToken } from "@/lib/server/alert-emails";
import { respond, sameOrigin } from "@/lib/server/auth/http";
import { rpc } from "@/lib/server/supabase-rpc";

export const dynamic = "force-dynamic";

/** Switches e-mail off for one price alert, from the signed link in an alert e-mail (no login needed). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return respond(req, { ok: false, error: "forbidden" }, { status: 403 });
  let token = "";
  try {
    token = String(((await req.json()) as { token?: unknown }).token ?? "").slice(0, 400);
  } catch {
    /* invalid body */
  }
  const who = readUnsubscribeToken(token);
  if (!who) return respond(req, { ok: false, error: "link_invalid" }, { status: 400 });
  try {
    const r = await rpc<{ ok: boolean }>("pa_alert_unsubscribe", { user_id: who.userId, alert_id: who.alertId }, { role: "service" });
    return respond(req, { ok: true, found: r.ok });
  } catch {
    return respond(req, { ok: false, error: "unavailable" }, { status: 503 });
  }
}
