"use client";

import Link from "next/link";
import { shopCategories } from "@/data/shop-categories";
import { Logo } from "./brand";
import { useCatalog } from "./catalog-context";
import { useT } from "./i18n-provider";
import { categoryLabel } from "@/i18n";

// Computed once when the module loads (keeps rendering pure).
const YEAR = new Date().getFullYear();

export function SiteFooter() {
  const { mode, fx } = useCatalog();
  const t = useT();
  const cols: { title: string; links: (readonly [string, string])[] }[] = [
    { title: t("foot.shop"), links: [...shopCategories.slice(0, 6).map((c) => [categoryLabel(t, c.slug, c.name), `/shop/${c.slug}`] as const), [t("nav.allDepartments"), "/departments"] as const] },
    {
      title: t("foot.compareSave"),
      links: [
        [t("nav.globalCompare"), "/compare"],
        [t("nav.localDealRadar"), "/deals"],
        [t("nav.priceAlerts"), "/alerts"],
        [t("tools.history"), "/price-history"],
        [t("foot.stores"), "/stores"],
      ],
    },
    { title: t("foot.yours"), links: [[t("nav.favourites"), "/saved"], [t("nav.account"), "/account"]] },
    {
      title: t("foot.trust"),
      links: [
        [t("foot.aboutLive"), "/about"],
        [t("foot.howItWorks"), "/about#pricing"],
        ...(mode === "live" ? [] : ([[mode === "sample" ? t("foot.aboutTest") : t("foot.aboutDemo"), "/about#demo"]] as const)),
        [t("foot.disclosures"), "/about#disclosure"],
        [t("foot.privacyPolicy"), "/privacy"],
        [t("foot.contact"), "/contact"],
      ],
    },
  ];
  return (
    <footer className="mt-20 bg-navy pb-16 text-white md:pb-0">
      <div className="pa-container grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div>
          <Logo inverted />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/70">
            {t("foot.about")}
          </p>
          <p className="mt-4 max-w-sm text-xs leading-relaxed text-white/55">
            {mode === "demo"
              ? t("foot.demo")
              : mode === "sample"
              ? t("foot.test")
              : t("foot.live")}{" "}
            {t("foot.fx", { label: fx.label, date: fx.asOf })}
          </p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="mb-4 text-sm font-semibold">{c.title}</p>
            <ul className="space-y-2.5 text-sm">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-white/70 hover:text-white hover:underline">{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="pa-container flex flex-col gap-1 py-5 text-xs text-white/55 sm:flex-row sm:justify-between">
          <span>© {YEAR} PriceViva — {mode === "demo" ? t("foot.modeDemo") : mode === "sample" ? t("foot.modeTest") : t("foot.modeBeta")}</span>
          <span>{mode === "live" ? t("foot.noAffLive") : t("foot.noAff")}</span>
        </div>
      </div>
    </footer>
  );
}
