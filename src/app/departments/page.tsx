import type { Metadata } from "next";
import Link from "next/link";
import { departments } from "@/data/departments";
import { getRepository } from "@/lib/catalog/repository";
import { DeptIcon } from "@/components/icons";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "All departments" };

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  const meta = await getRepository().meta();
  const t = await getT();
  const count = (slug: string) => meta.departmentCounts[slug] ?? 0;
  const open = departments.filter((d) => count(d.slug) > 0).length;
  return (
    <div className="pa-container py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{t("dept.all")}</h1>
      <p className="mt-2 max-w-2xl text-muted">
        {t("dept.openSummary", { open, total: departments.length, where: t(meta.mode === "demo" ? "dept.whereDemo" : meta.mode === "sample" ? "dept.whereSample" : "dept.whereLive") })}
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((d) => {
          const n = count(d.slug);
          return (
            <li key={d.slug}>
              <Link
                href={`/departments/${d.slug}`}
                className={`flex h-full items-start gap-4 rounded-[var(--radius-card)] border p-5 transition hover:shadow-lift ${n > 0 ? "border-line bg-surface" : "border-dashed border-line bg-transparent"}`}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: `hsl(${d.hue} 85% 94%)`, color: `hsl(${d.hue} 60% 28%)` }}>
                  <DeptIcon name={d.icon} className="h-6 w-6" />
                </span>
                <span>
                  <span className="block font-semibold text-ink">{d.name}</span>
                  <span className="block text-sm text-muted">{d.tagline}</span>
                  <span className={`mt-2 inline-block text-xs font-medium ${n > 0 ? "text-primary-ink" : "text-muted"}`}>
                    {n > 0 ? t(n === 1 ? "home.product1" : "dept.productsN", { n }) : t("dept.openingLater")}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
