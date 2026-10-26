import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createSessionToken, loginThrottled, recordLoginFailure, sameOrigin, sessionCookieOptions, verifyPassword } from "@/lib/server/admin-auth";
import { back } from "@/lib/server/admin-redirect";
import { serverEnv } from "@/lib/server/env";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("Forbidden", { status: 403 });
  if (!serverEnv.adminPasswordHash || !serverEnv.adminSessionSecret) return back(req, "/admin/login", "Admin sign-in is not configured (ADMIN_PASSWORD_HASH / ADMIN_SESSION_SECRET).", false);
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  if (loginThrottled(ip)) return back(req, "/admin/login", "Too many attempts. Try again in 10 minutes.", false);
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  if (!verifyPassword(password)) {
    recordLoginFailure(ip);
    return back(req, "/admin/login", "Wrong password.", false);
  }
  const res = NextResponse.redirect(new URL("/admin", req.url), 303);
  res.cookies.set(ADMIN_COOKIE, createSessionToken(), sessionCookieOptions);
  return res;
}
