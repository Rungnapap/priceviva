import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/server/admin-auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const nav: [href: string, label: string][] = [
    ["/admin", "Overview"],
    ["/admin/sample", "Test data (DummyJSON)"],
    ["/admin/feeds", "Awin feeds"],
    ["/admin/issues?kind=stale", "Stale offers"],
    ["/admin/issues?kind=missing_photos", "Missing photos"],
    ["/admin/issues?kind=duplicates", "Possible duplicates"],
    ["/admin/issues?kind=reviews", "Match reviews"],
    ["/admin/issues?kind=categories", "Category mapping"],
  ];
  return (
    <div className="pa-container py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-ink">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight">Catalogue & feeds</h1>
        </div>
        <form method="post" action="/api/admin/logout">
          <button type="submit" className="rounded-full border border-line px-4 py-2 text-sm hover:bg-surface-2">Sign out</button>
        </form>
      </div>
      <nav aria-label="Admin" className="mb-8 flex flex-wrap gap-2 text-sm">
        {nav.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-full border border-line bg-surface px-3 py-1.5 hover:border-primary">{label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
