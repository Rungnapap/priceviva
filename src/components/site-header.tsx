"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { departments } from "@/data/departments";
import { cities } from "@/data/places";
import { shopCategories, shopCategoryHref } from "@/data/shop-categories";
import { actions, useClientState, useHydrated, type ThemeChoice } from "@/lib/client-store";
import { authActions, useAuth } from "@/lib/auth-client";
import { activeArea, areaName } from "@/lib/location";
import { COUNTRY_NAME } from "@/lib/tax";
import { DISPLAY_CURRENCIES, type CountryCode, type CurrencyCode } from "@/lib/types";
import { AreaDialog } from "./area-dialog";
import { Logo } from "./brand";
import { useCatalog } from "./catalog-context";
import {
  Bell,
  ChevronDown,
  DeptIcon,
  Globe,
  Heart,
  LayoutGrid,
  MapPin,
  Menu,
  Monitor,
  Moon,
  Scale,
  Sun,
  Tag,
  Truck,
  User,
  LogIn,
  LogOut,
  X,
} from "./icons";
import { SearchBox } from "./search-box";
import { usePathname } from "next/navigation";
import { toast } from "./toast";
import { chooseLocale, useIntlLocale, useLocale, useT } from "./i18n-provider";
import { currencyName, regionName } from "@/i18n/display-names";
import { LOCALES, LOCALE_INFO, isLocale } from "@/i18n/config";
import { categoryLabel } from "@/i18n";


function AreaButton({ onOpen, className = "", compact = false }: { onOpen: () => void; className?: string; compact?: boolean }) {
  const hydrated = useHydrated();
  const { location } = useClientState();
  const { area, isTemporary } = activeArea(location);
  const t = useT();
  const name = area ? areaName(area, cities) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={clsx("min-w-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm hover:bg-surface-2", className)}
      aria-label={name ? t("nav.areaAria", { place: name, km: area?.radiusKm ?? "", temp: isTemporary ? ` (${t("nav.temporary")})` : "" }) : t("nav.chooseAreaAria")}
    >
      <MapPin className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />
      <span className="truncate">
        {!compact && <span className="text-muted">{t("nav.shoppingIn")} </span>}
        <span className="font-semibold text-ink">{hydrated && name ? `${name} · ${area?.radiusKm} km` : t("nav.chooseArea")}</span>
        {hydrated && isTemporary && <span className="ml-1 rounded bg-warning-soft px-1 text-xs text-warning-ink">{t("nav.temporary")}</span>}
      </span>
    </button>
  );
}

function DestinationSelect({ id }: { id: string }) {
  const { location } = useClientState();
  const t = useT();
  const intl = useIntlLocale();
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted">
        <Truck className="h-4 w-4" aria-hidden="true" /> {t("prefs.deliverTo")}
      </span>
      <select
        id={id}
        value={location.deliveryDestination}
        onChange={(e) => {
          actions.location({ type: "setDeliveryDestination", country: e.target.value as CountryCode });
          toast(`${t("prefs.deliverTo")}: ${regionName(e.target.value, COUNTRY_NAME[e.target.value as CountryCode], intl)}`);
        }}
        className="h-9 rounded-lg border border-line bg-surface px-2 font-medium text-ink"
      >
        {(Object.keys(COUNTRY_NAME) as CountryCode[]).map((c) => (
          <option key={c} value={c}>{regionName(c, COUNTRY_NAME[c], intl)}</option>
        ))}
      </select>
    </label>
  );
}

function CurrencySelect({ id }: { id: string }) {
  const { currency } = useClientState();
  const t = useT();
  const intl = useIntlLocale();
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted">
        <Tag className="h-4 w-4" aria-hidden="true" /> {t("prefs.currency")}
      </span>
      <select
        id={id}
        value={currency}
        onChange={(e) => actions.setCurrency(e.target.value as CurrencyCode)}
        className="h-9 rounded-lg border border-line bg-surface px-2 font-medium text-ink"
      >
        {DISPLAY_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c} — {currencyName(c, intl)}
          </option>
        ))}
      </select>
    </label>
  );
}


/** Where the conversion rates come from, so shoppers know converted prices are estimates. */
function FxNote() {
  const { fx } = useCatalog();
  const t = useT();
  return <p className="text-xs text-muted">{t("prefs.fxNote", { label: fx.label, date: fx.asOf })}</p>;
}

/** Real interface languages. German and Thai are labelled beta until a native speaker has reviewed them. */
function LanguageSelect({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 text-muted">
          <Globe className="h-4 w-4" aria-hidden="true" /> {t("prefs.language")}
        </span>
        <select
          id={id}
          value={locale}
          onChange={(e) => isLocale(e.target.value) && chooseLocale(e.target.value)}
          className="h-9 rounded-lg border border-line bg-surface px-2 font-medium text-ink"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l} lang={l}>
              {LOCALE_INFO[l].label}{LOCALE_INFO[l].status === "beta" ? ` (${t("prefs.beta")})` : ""}
            </option>
          ))}
        </select>
      </label>
      {locale !== "en" && <p className="text-xs text-muted">{t("prefs.langNote")}</p>}
    </div>
  );
}

function ThemeToggle() {
  const { theme } = useClientState();
  const hydrated = useHydrated();
  const t = useT();
  const next: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
  const Icon = !hydrated || theme === "system" ? Monitor : theme === "light" ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => actions.setTheme(next[theme])}
      className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink hover:bg-surface-2"
      aria-label={t("prefs.themeAria", { cur: t(`theme.${theme}`), next: t(`theme.${next[theme]}`) })}
    >
      <Icon className="h-4 w-4" /> {t(`theme.${hydrated ? theme : "system"}`)}
    </button>
  );
}

/** Delivery country, currency, language and theme in one compact popover. */
function PreferencesMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const hydrated = useHydrated();
  const { location, currency } = useClientState();
  const t = useT();
  const locale = useLocale();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);
  return (
    <div className="relative">
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls="prefs-menu"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm hover:bg-surface-2"
        aria-label={`${t("prefs.title")}: ${COUNTRY_NAME[location.deliveryDestination]}, ${currency}, ${LOCALE_INFO[locale].label}`}
      >
        <Globe className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
        <span className="font-semibold text-ink">{hydrated ? `${location.deliveryDestination} · ${currency}` : "SE · SEK"}</span>
        <span className="hidden text-muted 2xl:inline">· {LOCALE_INFO[locale].label}</span>
        <ChevronDown className={clsx("h-4 w-4 text-muted transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div id="prefs-menu" ref={ref} className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-lift">
          <DestinationSelect id="dest-desktop" />
          <CurrencySelect id="cur-desktop" />
          <FxNote />
          <LanguageSelect id="lang-desktop" />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">{t("prefs.theme")}</span>
            <ThemeToggle />
          </div>
          <p className="border-t border-line pt-3 text-xs text-muted">{t("prefs.deliveryNote")}</p>
        </div>
      )}
    </div>
  );
}

function IconLink({ href, label, count, children, className = "" }: { href: string; label: string; count?: number; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={clsx("relative flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface-2", className)} aria-label={count ? `${label} (${count})` : label}>
      {children}
      {!!count && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-radar px-1 text-[10px] font-bold text-white">{count}</span>
      )}
    </Link>
  );
}

function MegaMenu({ onNavigate }: { onNavigate: () => void }) {
  const grouped = new Set(shopCategories.flatMap((c) => c.departments));
  const others = departments.filter((d) => !grouped.has(d.slug));
  const t = useT();
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_17rem]">
      <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {shopCategories.map((c) => (
          <li key={c.slug}>
            <Link href={shopCategoryHref(c.slug)} onClick={onNavigate} className="font-semibold text-ink hover:text-primary">
              {categoryLabel(t, c.slug, c.name)}
            </Link>
            <ul className="mt-2 space-y-1.5">
              {c.departments.map((slug) => {
                const d = departments.find((x) => x.slug === slug);
                return d ? (
                  <li key={slug}>
                    <Link href={`/departments/${slug}`} onClick={onNavigate} className="text-sm text-muted hover:text-primary">
                      {d.name}
                    </Link>
                  </li>
                ) : null;
              })}
            </ul>
          </li>
        ))}
      </ul>
      <div className="rounded-2xl bg-surface-2 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("nav.moreDepartments")}</p>
        <ul className="space-y-1">
          {others.map((d) => (
            <li key={d.slug}>
              <Link href={`/departments/${d.slug}`} onClick={onNavigate} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-surface">
                <DeptIcon name={d.icon} className="h-4 w-4 text-muted" /> {d.name}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/departments" onClick={onNavigate} className="mt-3 inline-block text-sm font-semibold text-primary-ink hover:underline">
          {t("nav.allDepartments")} →
        </Link>
      </div>
    </div>
  );
}

function ModeBanner() {
  const { mode, notice } = useCatalog();
  const t = useT();
  return (
    <>
      <div className="bg-navy text-[13px] text-white">
        <div className="pa-container flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-1.5 text-center">
          {mode === "sample" ? (
            <>
              <span className="rounded bg-gold px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-navy">{t("banner.test")}</span>
              <span>{t("banner.testText")}</span>
              <Link href="/about#demo" className="underline underline-offset-2 hover:no-underline">Learn more</Link>
            </>
          ) : mode === "demo" ? (
            <>
              <span className="rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">{t("banner.demo")}</span>
              <span>{t("banner.demoText")}</span>
              <Link href="/about#demo" className="underline underline-offset-2 hover:no-underline">Learn more</Link>
            </>
          ) : (
            <>
              <span>{t("banner.liveText")}</span>
              <Link href="/about#disclosure" className="underline underline-offset-2 hover:no-underline">{t("banner.howWeEarn")}</Link>
            </>
          )}
        </div>
      </div>
      {notice && (
        <div role="status" className="border-b border-warning/30 bg-warning-soft text-xs text-warning-ink">
          <div className="pa-container py-1.5 text-center">{notice}</div>
        </div>
      )}
    </>
  );
}

/** Header account control: a clear "Log in" button for guests, the account icon (filled) when signed in. */
function AccountButton() {
  const auth = useAuth();
  const t = useT();
  if (auth.status === "signed_in") {
    return (
      <Link
        href="/account"
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface-2"
        aria-label={t("nav.accountSignedIn", { email: auth.user?.email ?? "" })}
        title={auth.user?.email ?? undefined}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
          <User className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      </Link>
    );
  }
  if (auth.status === "guest") {
    return (
      <>
        <Link href="/login" className="ml-1 hidden h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-semibold text-ink hover:border-primary hover:text-primary sm:inline-flex">
          <LogIn className="h-4 w-4" aria-hidden="true" /> {t("auth.loginButton")}
        </Link>
        <IconLink href="/login" label={t("auth.loginButton")} className="sm:hidden">
          <User className="h-[22px] w-[22px]" aria-hidden="true" />
        </IconLink>
      </>
    );
  }
  return (
    <IconLink href="/account" label={t("nav.account")}>
      <User className="h-[22px] w-[22px]" aria-hidden="true" />
    </IconLink>
  );
}

export function SiteHeader() {
  const { saved, compare, notifications } = useClientState();
  const auth = useAuth();
  const onHome = usePathname() === "/";
  const t = useT();
  const hydrated = useHydrated();
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const megaRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLUListElement>(null);
  const [catFit, setCatFit] = useState(shopCategories.length);
  // Show only the category links that fit completely on one line, in any language and at any width.
  useEffect(() => {
    const ul = catRef.current;
    if (!ul) return;
    const measure = () => {
      const max = ul.getBoundingClientRect().right;
      const items = [...ul.children] as HTMLElement[];
      let n = 0;
      for (const li of items) {
        if (li.getBoundingClientRect().right <= max + 0.5) n++;
        else break;
      }
      setCatFit(n);
    };
    // ResizeObserver also reports once right after observe(), which does the first measurement.
    const ro = new ResizeObserver(measure);
    ro.observe(ul);
    return () => ro.disconnect();
  }, []);
  const megaBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!megaOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMegaOpen(false);
        megaBtn.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!megaRef.current?.contains(e.target as Node) && !megaBtn.current?.contains(e.target as Node)) setMegaOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [megaOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const savedCount = hydrated ? saved.length : 0;
  const compareCount = hydrated ? compare.length : 0;
  const unreadAlerts = hydrated ? notifications.filter((n) => !n.read).length : 0;

  const radarPill = (extra = "") => (
    <Link href="/deals" className={clsx("inline-flex shrink-0 items-center gap-1.5 rounded-full bg-radar-soft px-4 py-2 font-semibold text-radar-ink ring-1 ring-radar/20 hover:bg-radar hover:text-white", extra)}>
      <MapPin className="h-4 w-4" aria-hidden="true" /> {t("nav.localDealRadar")}
    </Link>
  );
  const comparePill = (extra = "") => (
    <Link href="/compare" className={clsx("inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-4 py-2 font-semibold text-primary-ink ring-1 ring-primary/20 hover:bg-primary hover:text-white", extra)}>
      <Globe className="h-4 w-4" aria-hidden="true" /> {t("nav.globalCompare")}
      {compareCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">{compareCount}</span>}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 shadow-[0_1px_0_rgb(14_26_51/0.02)] backdrop-blur supports-[backdrop-filter]:bg-surface/90">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white">
        {t("nav.skip")}
      </a>
      <ModeBanner />

      {/* Row 1: logo · search · location / preferences / favourites / account */}
      <div className="pa-container flex h-[68px] items-center gap-3 lg:h-[84px] lg:gap-6">
        <button
          type="button"
          className="-ml-2 rounded-full p-2 text-ink hover:bg-surface-2 lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label={t("nav.openMenu")}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Logo />
        <SearchBox size="lg" className="hidden flex-1 md:block lg:max-w-3xl" />
        <div className="ml-auto flex items-center gap-0.5 lg:gap-1">
          <AreaButton onOpen={() => setAreaOpen(true)} compact className="hidden max-w-[10.5rem] lg:inline-flex xl:max-w-[15rem]" />
          <div className="hidden lg:block">
            <PreferencesMenu />
          </div>
          <IconLink href="/alerts" label={unreadAlerts ? `${t("nav.priceAlerts")}, ${t("alerts.notifications")}` : t("nav.priceAlerts")} count={unreadAlerts} className="hidden sm:flex">
            <Bell className="h-[22px] w-[22px]" aria-hidden="true" />
          </IconLink>
          <IconLink href="/saved" label={t("nav.favourites")} count={savedCount}>
            <Heart className="h-[22px] w-[22px]" aria-hidden="true" />
          </IconLink>
          <AccountButton />
        </div>
      </div>

      {/* Mobile: search (the homepage hero has its own) and shopping area. Main sections live in the bottom tab bar. */}
      <div className="pa-container space-y-1.5 pb-2.5 md:hidden">
        {!onHome && <SearchBox />}
        <AreaButton onOpen={() => setAreaOpen(true)} className="-ml-3 inline-flex max-w-full" />
      </div>
      <div className="hidden pb-3 md:block lg:hidden">
        <div className="pa-container flex items-center gap-2 text-sm">
          <AreaButton onOpen={() => setAreaOpen(true)} compact className="-ml-3 inline-flex" />
          <div className="ml-auto flex gap-2">
            {radarPill("py-1.5")}
            {comparePill("py-1.5")}
          </div>
        </div>
      </div>

      {/* Row 2 (desktop): All Categories · category links · Local Deal Radar · Global Compare */}
      <div className="hidden border-t border-line lg:block">
        <nav aria-label={t("nav.mainSections")} className="pa-container flex h-14 items-center gap-2 text-[15px]">
          <button
            ref={megaBtn}
            type="button"
            aria-expanded={megaOpen}
            aria-controls="mega-menu"
            onClick={() => setMegaOpen((o) => !o)}
            className={clsx(
              "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 font-semibold",
              megaOpen ? "bg-primary text-white" : "bg-primary-soft text-primary-ink hover:bg-primary hover:text-white",
            )}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" /> {t("nav.allCategories")}
            <ChevronDown className={clsx("h-4 w-4 transition-transform", megaOpen && "rotate-180")} aria-hidden="true" />
          </button>
          {/* Only as many categories as fit without scrolling; the rest are in "All Categories". */}
          <ul ref={catRef} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
            {shopCategories.map((c, i) => (
              // Links that don't fully fit are made invisible (and leave the tab order); they stay in "All Categories".
              <li key={c.slug} className={clsx("shrink-0", i >= catFit && "invisible")} aria-hidden={i >= catFit ? true : undefined}>
                <Link href={shopCategoryHref(c.slug)} className="block whitespace-nowrap rounded-full px-3 py-2 font-medium text-ink hover:bg-surface-2 hover:text-primary">
                  {categoryLabel(t, c.slug, c.name)}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex shrink-0 items-center gap-2 pl-2">
            {radarPill()}
            {comparePill()}
          </div>
        </nav>
        {megaOpen && (
          <div id="mega-menu" ref={megaRef} className="absolute inset-x-0 top-full border-b border-line bg-surface shadow-lift">
            <div className="pa-container max-h-[70vh] overflow-y-auto py-7">
              <MegaMenu onNavigate={() => setMegaOpen(false)} />
            </div>
          </div>
        )}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.menu")} id="mobile-nav">
          <button type="button" className="absolute inset-0 bg-navy/60" aria-label={t("nav.closeMenu")} onClick={() => setMobileOpen(false)} tabIndex={-1} />
          <div className="absolute inset-y-0 left-0 flex w-[min(23rem,90vw)] flex-col overflow-y-auto bg-surface shadow-lift">
            <div className="flex h-[68px] items-center justify-between border-b border-line px-4">
              <Logo tagline={false} />
              <button type="button" autoFocus onClick={() => setMobileOpen(false)} className="rounded-full p-2 hover:bg-surface-2" aria-label={t("nav.closeMenu")}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label={t("nav.mobileLabel")} className="flex-1 space-y-6 p-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {radarPill("justify-center")}
                {comparePill("justify-center")}
              </div>
              <div className="space-y-1">
                {[
                  { href: "/saved", label: `${t("nav.favourites")}${savedCount ? ` (${savedCount})` : ""}`, icon: <Heart className="h-4 w-4" /> },
                  { href: "/alerts", label: t("nav.priceAlerts"), icon: <Bell className="h-4 w-4" /> },
                  { href: "/compare", label: `${t("tools.compare")}${compareCount ? ` (${compareCount})` : ""}`, icon: <Scale className="h-4 w-4" /> },
                  { href: "/account", label: t("nav.account"), icon: <User className="h-4 w-4" /> },
                ].map((l) => (
                  <Link key={l.href} href={l.href} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium hover:bg-surface-2">
                    <span className="text-primary">{l.icon}</span>
                    {l.label}
                  </Link>
                ))}
              </div>
              {auth.status === "guest" && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Link href="/login" onClick={() => setMobileOpen(false)} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-primary font-semibold text-white">
                    <LogIn className="h-4 w-4" aria-hidden="true" /> {t("auth.loginButton")}
                  </Link>
                  <Link href="/signup" onClick={() => setMobileOpen(false)} className="inline-flex h-11 items-center justify-center rounded-full border border-line font-semibold">{t("auth.signupShort")}</Link>
                </div>
              )}
              {auth.status === "signed_in" && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-muted">{auth.user?.email}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      setMobileOpen(false);
                      if (await authActions.logout()) toast(t("auth.loggedOut"), "success");
                      else toast(t("auth.err.unavailable"), "error");
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-semibold hover:bg-surface-2"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" /> {t("auth.logout")}
                  </button>
                </div>
              )}
              <div>
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("nav.allCategories")}</p>
                <ul className="space-y-0.5">
                  {shopCategories.map((c) => (
                    <li key={c.slug}>
                      <Link href={shopCategoryHref(c.slug)} onClick={() => setMobileOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-surface-2">
                        {categoryLabel(t, c.slug, c.name)}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/departments" onClick={() => setMobileOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-semibold text-primary-ink">
                      {t("nav.allDepartments")} →
                    </Link>
                  </li>
                </ul>
              </div>
              <div className="space-y-3 rounded-2xl bg-surface-2 p-3">
                <DestinationSelect id="dest-mobile" />
                <CurrencySelect id="cur-mobile" />
                <FxNote />
                <LanguageSelect id="lang-mobile" />
                <div className="flex items-center justify-between text-sm text-muted">
                  {t("prefs.theme")} <ThemeToggle />
                </div>
              </div>
            </nav>
          </div>
        </div>
      )}

      {areaOpen && <AreaDialog onClose={() => setAreaOpen(false)} />}
    </header>
  );
}
