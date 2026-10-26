import { NextResponse } from "next/server";
import { ADMIN_COOKIE, sameOrigin } from "@/lib/server/admin-auth";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("Forbidden", { status: 403 });
  const res = NextResponse.redirect(new URL("/admin/login", req.url), 303);
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
