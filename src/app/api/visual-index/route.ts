import { NextResponse } from "next/server";
import { getRepository } from "@/lib/catalog/repository";

export const dynamic = "force-dynamic";

/**
 * Catalogue photos for on-device photo search: id, name and the small photo of each product that HAS a real
 * photo. Demo mode (drawn illustrations) returns none, and photo search says so instead of guessing.
 */
export async function GET() {
  try {
    const repo = getRepository();
    const items = await repo.shelf({ limit: 500 });
    const list = items
      .map((p) => ({ id: p.id, slug: p.slug, name: p.name, brand: p.brandName, image: p.thumbnailUrl ?? p.images[0]?.url ?? null, source: p.source }))
      .filter((x): x is typeof x & { image: string } => !!x.image);
    return NextResponse.json({ mode: repo.mode, items: list }, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch {
    return NextResponse.json({ mode: null, items: [], error: "Catalogue unavailable" }, { status: 503 });
  }
}
