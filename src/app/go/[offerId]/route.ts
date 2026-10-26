import { NextResponse } from "next/server";
import { isPermittedAwinLink } from "@/lib/importers/awin/map-row";
import { catalogMode } from "@/lib/server/env";
import { rpc, rpcConfigured } from "@/lib/server/supabase-rpc";

export const dynamic = "force-dynamic";

/**
 * "Visit store" redirect. Looks up the offer server-side (the visitor never supplies a URL),
 * re-checks the stored link against the allowlist for its source, logs an anonymous click, then 302s.
 * Unknown / inactive / demo offers -> 404. Never an open redirect.
 */
export async function GET(req: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const notFound = () =>
    new NextResponse("This store link is not available. The offer may have ended.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });
  if (catalogMode() !== "live" || !rpcConfigured("service") || !/^[0-9a-f-]{36}$/i.test(offerId)) return notFound();

  let from: string | null = null;
  try {
    const ref = req.headers.get("referer");
    if (ref) {
      const u = new URL(ref);
      if (u.host === new URL(req.url).host) from = u.pathname.slice(0, 200);
    }
  } catch {
    /* ignore */
  }

  try {
    const r = await rpc<{ found: boolean; click_url?: string; source?: string }>("pa_offer_redirect", { offer_id: offerId, from_path: from }, { role: "service" });
    if (!r.found || !r.click_url) return notFound();
    const permitted = r.source === "awin" ? isPermittedAwinLink(r.click_url) : false; // other sources get their own allowlist when added
    if (!permitted) return notFound();
    return NextResponse.redirect(r.click_url, { status: 302, headers: { "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "origin", "Cache-Control": "no-store" } });
  } catch {
    return new NextResponse("Store link temporarily unavailable.", { status: 503 });
  }
}
