import { toUrlTemplate } from "@/lib/importers/awin/feed-list";
import { guardAdminPost } from "@/lib/server/admin-auth";
import { redact, serverEnv } from "@/lib/server/env";
import { rpc } from "@/lib/server/supabase-rpc";
import { COUNTRY_CURRENCY } from "@/lib/tax";
import { SUPPORTED_COUNTRIES, type CountryCode } from "@/lib/types";
import { back } from "@/lib/server/admin-redirect";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdminPost(req);
  if (denied) return denied;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Bad id", { status: 400 });
  const f = await req.formData();
  const action = String(f.get("action") ?? "");
  const p: Record<string, unknown> = { feed_id: id, max_enabled: serverEnv.maxEnabledFeeds, supported_countries: SUPPORTED_COUNTRIES };

  if (action === "enable") p.enabled = true;
  else if (action === "disable") p.enabled = false;
  else if (action === "settings") {
    const country = String(f.get("country") ?? "").toUpperCase();
    if (country) {
      if (!SUPPORTED_COUNTRIES.includes(country as CountryCode)) return back(req, "/admin/feeds", `Country must be one of ${SUPPORTED_COUNTRIES.join(", ")}.`, false);
      p.country = country;
      p.currency = COUNTRY_CURRENCY[country as CountryCode];
    }
    const hours = Number(f.get("refresh_hours"));
    if (Number.isInteger(hours) && hours >= 6 && hours <= 168) p.refresh_hours = hours;
    p.vat_included = f.get("vat_included") === "on";
    const pasted = String(f.get("download_url") ?? "").trim();
    if (pasted) {
      const template = toUrlTemplate(pasted);
      if (!template) return back(req, "/admin/feeds", "The download URL must be an https://productdata.awin.com/… Create-a-Feed link containing /apikey/…", false);
      p.download_url_template = template; // the key in the pasted URL is discarded, never stored
    }
  } else return new Response("Unknown action", { status: 400 });

  try {
    const r = await rpc<{ ok: boolean; error?: string }>("pa_admin_feed_update", p, { role: "service" });
    return r.ok ? back(req, "/admin/feeds", "Feed updated.") : back(req, "/admin/feeds", r.error ?? "Update refused.", false);
  } catch (e) {
    return back(req, "/admin/feeds", redact((e as Error).message), false);
  }
}
