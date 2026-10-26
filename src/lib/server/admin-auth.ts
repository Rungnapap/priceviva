/**
 * Admin sign-in for the importer dashboard (single admin, server-side only).
 *  - Password checked against ADMIN_PASSWORD_HASH (scrypt) with a constant-time compare.
 *  - Session = HMAC-signed expiry in an HttpOnly, SameSite=Strict cookie (8 hours).
 *  - Mutating admin requests must come from the same origin (CSRF guard) and carry a valid session.
 * Phase 4 replaces this with Supabase Auth + an admin role; the checks stay server-side.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, sameOrigin, verifySessionToken } from "./admin-session";

export * from "./admin-session";

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(ADMIN_COOKIE)?.value);
}

/** Use at the top of every admin page. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Mutating admin route guard: same origin + valid session. Returns an error Response or null. */
export async function guardAdminPost(req: Request): Promise<Response | null> {
  if (!sameOrigin(req)) return new Response("Forbidden (cross-site request)", { status: 403 });
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  return null;
}

