import { NextResponse } from "next/server";
import { getRepository } from "@/lib/catalog/repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/local-offers?lat=56.66&lng=16.36&radius=25
 * Merchant-supplied / verified local offers with real store coordinates. `supported: false` means this mode
 * (demo/test) has no merchant data source — the client then shows its honest empty state.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const radius = Math.min(100, Math.max(1, Number(sp.get("radius") ?? 10)));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !Number.isFinite(radius)) {
    return NextResponse.json({ supported: false, offers: [], error: "Invalid position." }, { status: 400 });
  }
  try {
    const offers = await getRepository().localOffers({ lat, lng }, radius);
    return NextResponse.json({ supported: offers !== null, offers: offers ?? [] }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return NextResponse.json({ supported: true, offers: [], error: "Local offers are temporarily unavailable." }, { status: 503 });
  }
}
