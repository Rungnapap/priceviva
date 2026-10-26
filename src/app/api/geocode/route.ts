import { NextResponse } from "next/server";
import { geocode, reverseGeocode } from "@/lib/server/geocode";

export const dynamic = "force-dynamic";

/**
 * GET /api/geocode?q=Kalmar           — place / postcode search
 * GET /api/geocode?lat=56.66&lng=16.36 — town name for a device position (rounded to ~1 km before lookup)
 * See src/lib/server/geocode.ts for provider, limits and privacy rules.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  // Rate-limit key only; never logged or forwarded upstream.
  const client = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const r = sp.has("lat") ? await reverseGeocode(Number(sp.get("lat")), Number(sp.get("lng")), client) : await geocode(sp.get("q"), client);
  const code = r.status === "ok" ? 200 : r.status === "invalid" ? 400 : r.status === "rate_limited" ? 429 : 503;
  return NextResponse.json(r, { status: code, headers: { "Cache-Control": "no-store" } });
}
