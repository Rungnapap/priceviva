"use client";

import Link from "next/link";
import { useClientState, useHydrated } from "@/lib/client-store";
import { BellRing, Heart, History, Scale } from "../icons";
import { useT } from "../i18n-provider";

/**
 * "Your shopping tools". Favourites, the comparison list and price alerts work in this browser today
 * (alerts notify inside PriceViva only — no email). Price history shows only prices actually recorded.
 */
export function ShoppingTools({ live }: { live: boolean }) {
  const hydrated = useHydrated();
  const t = useT();
  const { saved, compare, alerts } = useClientState();
  const activeAlerts = hydrated ? alerts.filter((a) => !a.paused).length : 0;
  const tools = [
    {
      href: "/saved",
      icon: Heart,
      title: t("tools.favourites"),
      text: hydrated && saved.length > 0 ? t("tools.favouritesN", { n: saved.length }) : t("tools.favouritesEmpty"),
      status: null,
      tone: "bg-radar-soft text-radar-ink",
    },
    {
      href: "/compare",
      icon: Scale,
      title: t("tools.compare"),
      text: hydrated && compare.length > 0 ? t("tools.compareN", { n: compare.length }) : t("tools.compareEmpty"),
      status: null,
      tone: "bg-primary-soft text-primary-ink",
    },
    {
      href: "/alerts",
      icon: BellRing,
      title: t("tools.alerts"),
      text: activeAlerts > 0 ? `${t("tools.alertsN", { n: activeAlerts })} ${t("tools.alertsText")}` : t("tools.alertsText"),
      status: t("tools.browserOnly"),
      tone: "bg-gold-soft text-gold-ink",
    },
    {
      href: "/price-history",
      icon: History,
      title: t("tools.history"),
      text: live ? t("tools.historyLive") : t("tools.historyText"),
      status: null,
      tone: "bg-surface-2 text-ink",
    },
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tools.map((x) => (
        <li key={x.href}>
          <Link href={x.href} className="flex h-full gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-lift">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${x.tone}`} aria-hidden="true">
              <x.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{x.title}</span>
                {x.status && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">{x.status}</span>}
              </span>
              <span className="mt-1 block text-sm text-muted">{x.text}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
