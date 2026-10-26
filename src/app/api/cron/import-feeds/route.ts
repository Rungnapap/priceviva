import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { importDueFeeds } from "@/lib/importers/run";
import { redact, serverEnv } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds; Vercel caps this by plan

/** Scheduled import. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = serverEnv.cronSecret;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!serverEnv.supabaseServiceKey) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  try {
    const { results, log } = await importDueFeeds({ trigger: "cron", budgetMs: 270_000 });
    return NextResponse.json({ ok: true, log, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: redact((e as Error).message) }, { status: 500 });
  }
}
