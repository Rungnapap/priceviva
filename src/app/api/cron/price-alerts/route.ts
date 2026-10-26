import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getRepository } from "@/lib/catalog/repository";
import { runAlertEmails } from "@/lib/server/alert-emails";
import { redact, serverEnv } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled price-alert check (e.g. Vercel Cron, `Authorization: Bearer $CRON_SECRET`). In test mode, or until
 * e-mails are explicitly switched on (see src/lib/server/alert-emails.ts), it returns {skipped: "..."} and sends
 * nothing.
 */
export async function GET(req: Request) {
  const secret = serverEnv.cronSecret;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const repo = getRepository();
    const meta = await repo.meta();
    const summary = await runAlertEmails({ loadProducts: (ids) => repo.byIds(ids), fx: meta.fx });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: redact((e as Error).message) }, { status: 500 });
  }
}
