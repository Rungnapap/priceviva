"use client";

import Link from "next/link";
import { useT } from "@/components/i18n-provider";

export default function NotFound() {
  const t = useT();
  return (
    <div className="pa-container py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-ink">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("common.notFoundTitle")}</h1>
      <p className="mx-auto mt-3 max-w-md text-muted">{t("common.notFoundProduct")}</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/" className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover">{t("common.backHome")}</Link>
        <Link href="/search" className="rounded-full border border-line px-5 py-2.5 text-sm font-medium hover:bg-surface-2">{t("common.searchProducts")}</Link>
      </div>
    </div>
  );
}
