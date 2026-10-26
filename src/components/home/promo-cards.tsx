import Link from "next/link";
import type { ReactNode } from "react";
import { backdrops, type Backdrop } from "@/data/site-backgrounds";
import { BackdropImage } from "../backdrop-image";
import { ArrowRight, Globe, MapPin } from "../icons";
import type { TFunction } from "@/i18n";

function PromoCard({
  href,
  image,
  icon,
  eyebrow,
  title,
  text,
  cta,
  tone,
}: {
  href: string;
  image: Backdrop;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  text: string;
  cta: string;
  tone: "primary" | "radar";
}) {
  const t =
    tone === "primary"
      ? { badge: "bg-primary text-white", eyebrow: "text-primary-ink", cta: "bg-primary group-hover:bg-primary-hover" }
      : { badge: "bg-radar text-white", eyebrow: "text-radar-ink", cta: "bg-radar group-hover:bg-radar-hover" };
  return (
    <Link
      href={href}
      className="pv-photo-zoom group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card transition-shadow hover:shadow-lift"
    >
      <span className="relative block aspect-[16/7] overflow-hidden bg-surface-2">
        <BackdropImage image={image} sizes="(min-width:1024px) 45vw, 100vw" />
      </span>
      <span className="flex flex-1 flex-col gap-2 p-5 sm:p-6">
        <span className="flex items-center gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${t.badge}`} aria-hidden="true">{icon}</span>
          <span className={`text-xs font-semibold uppercase tracking-[0.12em] ${t.eyebrow}`}>{eyebrow}</span>
        </span>
        <span className="pv-display text-xl font-bold text-ink">{title}</span>
        <span className="text-sm text-muted">{text}</span>
        <span className={`mt-auto inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white ${t.cta}`}>
          {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

export function GlobalComparePromo({ t }: { t: TFunction }) {
  return (
    <PromoCard
      href="/compare"
      image={backdrops.globalV7}
      icon={<Globe className="h-4 w-4" />}
      eyebrow={t("promo.globalEyebrow")}
      title={t("promo.globalTitle")}
      text={t("promo.globalText")}
      cta={t("promo.globalCta")}
      tone="primary"
    />
  );
}

export function LocalDealsPromo({ t }: { t: TFunction }) {
  return (
    <PromoCard
      href="/deals"
      image={backdrops.localV7}
      icon={<MapPin className="h-4 w-4" />}
      eyebrow={t("promo.localEyebrow")}
      title={t("promo.localTitle")}
      text={t("promo.localText")}
      cta={t("promo.localCta")}
      tone="radar"
    />
  );
}
