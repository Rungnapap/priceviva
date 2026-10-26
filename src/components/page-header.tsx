import Link from "next/link";
import type { ReactNode } from "react";
import type { Backdrop } from "@/data/site-backgrounds";
import { BackdropImage } from "./backdrop-image";
import { ChevronRight } from "./icons";
import { T } from "./t";

/**
 * Page title block used by the feature pages. `tone` picks the accent (blue, radar red, gold).
 * With `backdrop`, a photo sits behind a white wash on the left (laptop/desktop, 1024 px and up) or as a band
 * above the title (phones and tablets), so text never covers the people in the photo.
 */
export function PageHeader({
  title,
  eyebrow,
  children,
  icon,
  tone = "primary",
  crumb,
  crumbs,
  backdrop,
}: {
  title: string;
  eyebrow?: string;
  children?: ReactNode;
  icon?: ReactNode;
  tone?: "primary" | "radar" | "gold";
  crumb?: string;
  /** Extra breadcrumb links between Home and the current page. */
  crumbs?: { label: string; href: string }[];
  backdrop?: Backdrop;
}) {
  const accent = {
    primary: { bg: "from-primary-soft", icon: "bg-primary text-white", eyebrow: "text-primary-ink" },
    radar: { bg: "from-radar-soft", icon: "bg-radar text-white", eyebrow: "text-radar-ink" },
    gold: { bg: "from-gold-soft", icon: "bg-gold text-navy", eyebrow: "text-gold-ink" },
  }[tone];
  return (
    <section className={`relative isolate border-b border-line ${backdrop ? "bg-surface" : `bg-gradient-to-br ${accent.bg} via-bg to-bg`}`}>
      {backdrop && (
        <div className="relative h-28 overflow-hidden sm:h-40 md:h-48 lg:absolute lg:inset-0 lg:-z-10 lg:h-auto" aria-hidden="true">
          <BackdropImage image={backdrop} />
          <div className="pv-wash-left-soft absolute inset-0 hidden lg:block" />
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent lg:hidden" />
        </div>
      )}
      <div className={`pa-container ${backdrop ? "py-6 md:py-8 lg:py-14" : "py-10 sm:py-12"}`}>
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted">
          <Link href="/" className="hover:text-primary"><T k="nav.home" /></Link>
          {crumbs?.map((c) => (
            <span key={c.href} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              <Link href={c.href} className="hover:text-primary">{c.label}</Link>
            </span>
          ))}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span aria-current="page" className="text-ink">{crumb ?? title}</span>
        </nav>
        <div className="flex items-start gap-4">
          {icon && <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-card ${accent.icon}`}>{icon}</span>}
          <div className={`min-w-0 max-w-2xl ${backdrop ? "lg:max-w-xl" : ""}`}>
            {eyebrow && <p className={`mb-1 text-xs font-semibold uppercase tracking-[0.14em] ${accent.eyebrow}`}>{eyebrow}</p>}
            <h1 className="pv-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
            {children && <div className="mt-2 text-ink/75">{children}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
