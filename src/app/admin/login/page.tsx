import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Flash, one } from "@/components/admin-ui";
import { isAdmin } from "@/lib/server/admin-auth";
import { serverEnv } from "@/lib/server/env";

export const metadata: Metadata = { title: "Admin sign-in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLogin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await isAdmin()) redirect("/admin");
  const sp = await searchParams;
  const configured = !!serverEnv.adminPasswordHash && !!serverEnv.adminSessionSecret;
  return (
    <div className="pa-container max-w-md py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Admin sign-in</h1>
      <p className="mt-1 text-sm text-muted">Feed imports, data quality and moderation.</p>
      <div className="mt-6">
        <Flash err={one(sp.err)} />
        {!configured ? (
          <p className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning-ink">
            Admin sign-in is not configured. Run <code>npm run admin:hash -- &quot;a long password&quot;</code> and add the two printed lines to <code>.env.local</code>, then restart.
          </p>
        ) : (
          <form method="post" action="/api/admin/login" className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <div>
              <label htmlFor="pw" className="mb-1 block text-sm font-medium">Password</label>
              <input id="pw" name="password" type="password" required autoComplete="current-password" className="h-11 w-full rounded-lg border border-line bg-surface px-3" />
            </div>
            <button type="submit" className="h-11 w-full rounded-full bg-primary text-sm font-semibold text-white hover:bg-primary-hover">Sign in</button>
          </form>
        )}
      </div>
    </div>
  );
}
