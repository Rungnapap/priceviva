"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClientState, useHydrated } from "@/lib/client-store";
import { Globe, Heart, LayoutGrid, MapPin, Search } from "./icons";
import { useT } from "./i18n-provider";

const TABS = [
  { href: "/", label: "nav.home", icon: LayoutGrid, match: (p: string) => p === "/" },
  { href: "/search", label: "nav.search", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/compare", label: "nav.compare", icon: Globe, match: (p: string) => p.startsWith("/compare") },
  { href: "/deals", label: "nav.localDeals", icon: MapPin, match: (p: string) => p.startsWith("/deals"), radar: true },
  { href: "/saved", label: "nav.saved", icon: Heart, match: (p: string) => p.startsWith("/saved") },
] as const;

/**
 * Phone navigation between the four main jobs (search, compare, local deals, saved) plus home.
 * Hidden from md up, where the header has room for everything. Respects the iOS home-indicator inset.
 */
export function MobileTabBar() {
  const path = usePathname() ?? "/";
  const hydrated = useHydrated();
  const { saved, compare } = useClientState();
  const tr = useT();
  return (
    <nav
      aria-label={tr("nav.mainSections")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((t) => {
          const on = t.match(path);
          const color = on ? ("radar" in t ? "text-radar-ink" : "text-primary-ink") : "text-muted";
          const count = !hydrated ? 0 : t.href === "/saved" ? saved.length : t.href === "/compare" ? compare.length : 0;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium ${color}`}
              >
                <t.icon className="h-5 w-5" aria-hidden="true" />
                <span>{tr(t.label)}</span>
                {count > 0 && (
                  <span className={`absolute right-[22%] top-1.5 min-w-4 rounded-full px-1 ${t.href === "/compare" ? "bg-primary" : "bg-radar"} text-center text-[10px] font-bold leading-4 text-white`} aria-hidden="true">
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
