import { NextResponse } from "next/server";
import { getRepository } from "@/lib/catalog/repository";
import { normalizeGtin } from "@/lib/importers/normalize";

export const dynamic = "force-dynamic";

/**
 * GET /api/barcode?code=7350012345678 — EXACT product identification by GTIN/EAN/UPC (check digit validated).
 * Returns only products whose stored barcode equals the code; never "similar" products.
 */
export async function GET(req: Request) {
  const raw = (new URL(req.url).searchParams.get("code") ?? "").replace(/[\s-]/g, "");
  const gtin = normalizeGtin(raw);
  if (!gtin) return NextResponse.json({ valid: false, items: [], message: "That is not a valid barcode (EAN/UPC/GTIN, 8–14 digits with a correct check digit)." }, { status: 400 });
  try {
    const repo = getRepository();
    const { items } = await repo.search(gtin.replace(/^0+(?=\d{8,})/, ""), {});
    const exact = items.filter((p) => p.gtin && normalizeGtin(p.gtin) === gtin);
    return NextResponse.json({ valid: true, gtin, mode: repo.mode, items: exact.map((p) => ({ id: p.id, slug: p.slug, name: p.name, brand: p.brandName, image: p.thumbnailUrl ?? p.images[0]?.url ?? null })) });
  } catch {
    return NextResponse.json({ valid: true, items: [], message: "Barcode lookup is temporarily unavailable." }, { status: 503 });
  }
}
