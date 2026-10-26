import { NextResponse } from "next/server";
import { getRepository } from "@/lib/catalog/repository";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  if (q.trim().length < 2) return NextResponse.json({ items: [] });
  try {
    return NextResponse.json({ items: await getRepository().suggest(q) }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return NextResponse.json({ items: [] }, { status: 503 });
  }
}
