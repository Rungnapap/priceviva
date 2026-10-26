import { NextResponse } from "next/server";
import { getRepository } from "@/lib/catalog/repository";

export const dynamic = "force-dynamic";

/** Catalogue views by id, for saved items and comparison (max 50 ids). */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9-]{1,64}$/.test(s)))].slice(0, 50);
  if (ids.length === 0) return NextResponse.json({ items: [] });
  try {
    const items = await getRepository().byIds(ids);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ error: "Catalogue temporarily unavailable" }, { status: 503 });
  }
}
