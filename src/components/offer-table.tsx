"use client";

import { Fragment, useState, type ReactNode } from "react";
import { rankingFor } from "@/lib/catalog-queries";
import { actions, useClientState, useHydrated } from "@/lib/client-store";
import { convertMinor, discountPercent, type formatMoney } from "@/lib/money";
import { COUNTRY_NAME } from "@/lib/tax";
import type { CountryCode } from "@/lib/types";
import { STALE_AFTER_DAYS, type RankedOffer } from "@/lib/pricing";
import type { CatalogOffer, CatalogProduct, CostComponent } from "@/lib/types";
import { useCatalog } from "./catalog-context";
import { AlertTriangle, ChevronDown, Info } from "./icons";
import { unitPrice } from "./price-summary";
import { DemoBadge, StatusBadge } from "./ui";
import { useFormatMoney, useIntlLocale, useT } from "./i18n-provider";
import { regionName } from "@/i18n/display-names";

/** Country name in the interface language for any ISO code (ship-from countries go beyond the delivery list). */
function useI18nBits() {
  const t = useT();
  const intl = useIntlLocale();
  const money = useFormatMoney();
  const countryName = (c: string | null | undefined) => (c ? regionName(c, c, intl) : t("offer.unknownCountry"));
  const dateTime = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return { t, money, countryName, dateTime };
}

function Cost({ c, currency }: { c: CostComponent | null; currency: Parameters<typeof formatMoney>[1] }) {
  const t = useT();
  const money = useFormatMoney();
  if (!c) return <span className="text-muted">—</span>;
  if (c.amountMinor === null || c.basis === "unknown") return <span className="font-medium text-warning-ink">{t("offer.unknown")}</span>;
  const label = c.amountMinor === 0 ? t("offer.free") : money(c.amountMinor, currency);
  return (
    <span>
      {label}
      {c.basis === "estimated" && <span className="ml-1 text-xs text-primary-ink">{t("offer.est")}</span>}
    </span>
  );
}

/** Outbound link. Always via /go/[offerId], which re-checks the stored URL against an allowlist and logs the click. */
export function VisitStoreLink({ offer, compact = false }: { offer: CatalogOffer; compact?: boolean }) {
  const t = useT();
  if (!offer.clickable || offer.source === "demo") return null;
  return (
    <a
      href={`/go/${offer.id}`}
      target="_blank"
      rel="sponsored nofollow noopener"
      className={
        compact
          ? "inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover"
          : "inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
      }
      aria-label={t("offer.visitLabel", { name: offer.retailer.name })}
    >
      {t("offer.visit")}
    </a>
  );
}

function Breakdown({ r }: { r: RankedOffer<CatalogOffer> }) {
  const { fx, mode } = useCatalog();
  const { t, money, countryName, dateTime } = useI18nBits();
  const l = r.landed;
  const cur = l.currency;
  const o = r.offer;
  const rows: [string, ReactNode, string | undefined][] = [
    [t("offer.listed"), money(l.listedPriceMinor, cur), o.vatIncluded ? t("offer.inclVat", { country: countryName(o.shipFrom) }) : undefined],
  ];
  if (l.sellerVatRemovedMinor > 0) rows.push([t("offer.vatRemoved"), `−${money(l.sellerVatRemovedMinor, cur)}`, t("offer.vatRemovedNote")]);
  rows.push([t("offer.shipping"), <Cost key="s" c={l.shipping} currency={cur} />, l.shipping?.note]);
  rows.push([t("offer.import"), <Cost key="i" c={l.importCharges} currency={cur} />, l.importCharges?.note]);
  return (
    <div className="space-y-3 rounded-xl bg-surface-2 p-4 text-sm">
      <dl className="space-y-2">
        {rows.map(([k, v, note]) => (
          <div key={k} className="grid grid-cols-[1fr_auto] gap-x-4">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
            {note && <dd className="col-span-2 text-xs text-muted">{note}</dd>}
          </div>
        ))}
        <div className="grid grid-cols-[1fr_auto] gap-x-4 border-t border-line pt-2">
          <dt className="font-semibold">{l.totalMinor !== null ? t("offer.deliveredTotal") : t("offer.knownSoFar")}</dt>
          <dd className="text-right font-semibold">
            {money(l.totalMinor ?? l.knownSubtotalMinor, cur)}
            {l.totalMinor === null && <span className="ml-1 font-normal text-warning-ink">{t("offer.plusUnknown")}</span>}
          </dd>
        </div>
      </dl>
      {o.rrp && (
        <p className="text-xs text-muted">
          {t("offer.rrp", { price: money(o.rrp.minor, o.rrp.currency) })}
        </p>
      )}
      {o.deliveryTime && <p className="text-xs text-muted">{t("offer.deliveryTime", { time: o.deliveryTime })}</p>}
      {r.displayCurrency !== cur && (
        <p className="text-xs text-muted">
          {t("offer.convertedWith", { cur: r.displayCurrency, label: fx.label, date: fx.asOf })}
        </p>
      )}
      <p className="text-xs text-muted">
        {mode === "demo" ? (
          <>{t("offer.observedDemo", { when: o.observedDaysAgo === 0 ? t("offer.today") : o.observedDaysAgo === 1 ? t("offer.dayAgo") : t("offer.daysAgo", { n: o.observedDaysAgo ?? 0 }) })}</>
        ) : o.source === "sample" ? (
          o.retailerId === "dummyjson" ? (
            <>{t("offer.sampleDummy", { when: o.observedAt ? dateTime.format(new Date(o.observedAt)) : "—" })}</>
          ) : (
            <>{t("offer.sampleCsv", { when: o.observedAt ? dateTime.format(new Date(o.observedAt)) : "—" })}</>
          )
        ) : (
          <>
            {t("offer.liveObserved", { when: o.observedAt ? dateTime.format(new Date(o.observedAt)) : "—" })}
            {o.sourceUpdatedAt ? ` · ${t("offer.retailerUpdated", { when: dateTime.format(new Date(o.sourceUpdatedAt)) })}` : ""} · {t("offer.source", { src: o.source === "awin" ? t("offer.awinFeed") : o.source })}
          </>
        )}
      </p>
    </div>
  );
}

/** The one headline price on a product page: the best complete delivered total, or an honest "no complete total". */
export function BestOfferSummary({ product, shopCount }: { product: CatalogProduct; shopCount: number }) {
  const hydrated = useHydrated();
  const { location, currency } = useClientState();
  const { fx, mode } = useCatalog();
  const { t, money, countryName } = useI18nBits();
  if (!hydrated) return <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface-2" aria-label={t("common.loading")} />;
  const dest = location.deliveryDestination;
  const ranking = rankingFor(product, dest, currency, fx);
  const b = ranking.best;
  const unit = b ? unitPrice(product, b.displayTotalMinor as number, currency, t, money) : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card sm:p-5">
      {b ? (
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {t(b.landed.status === "verified_total" && mode === "live" ? "offer.lowestVerified" : "offer.lowestComplete", { country: countryName(dest) })}
            {mode !== "live" ? t("offer.demoSuffix") : ""}
          </p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight text-ink">
            {b.offer.price.currency !== currency && <span className="mr-1 text-lg font-medium text-muted" title={t("offer.convertedTitle")}>≈</span>}
            {money(b.displayTotalMinor as number, currency)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusBadge status={b.landed.status} demo={b.offer.source !== "awin"} />
            <span>{t("offer.from", { retailer: b.offer.retailer.name, country: countryName(b.offer.shipFrom) })}{unit ? ` · ${unit}` : ""}</span>
          </p>
        </div>
      ) : (
        <p className="flex min-w-0 items-start gap-2 text-sm text-warning-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("offer.noComplete", { country: countryName(dest) })}
        </p>
      )}
      <a href="#offers" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">
        {shopCount > 1 ? t("offer.compareShops", { n: shopCount }) : t("offer.seeDetails")}
      </a>
    </div>
  );
}

export function OfferTable({ product }: { product: CatalogProduct }) {
  const hydrated = useHydrated();
  const { location, currency } = useClientState();
  const { fx, mode } = useCatalog();
  const { t, money, countryName } = useI18nBits();
  // Several offers can be expanded at once, so they can be compared side by side.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [sortBy, setSortBy] = useState<"total" | "item" | "fastest">("total");

  if (!hydrated) return <div className="h-72 animate-pulse rounded-[var(--radius-card)] bg-surface-2" aria-label={t("common.loading")} />;

  const dest = location.deliveryDestination;
  const ranking = rankingFor(product, dest, currency, fx);
  // Optional re-ordering. The recommended order (complete totals first) stays the default and the headline price never changes.
  const rows = [...ranking.offers];
  if (sortBy === "item") rows.sort((a, b) => convertMinor(a.offer.price.minor, a.offer.price.currency, currency, fx) - convertMinor(b.offer.price.minor, b.offer.price.currency, currency, fx));
  if (sortBy === "fastest") rows.sort((a, b) => (a.landed.deliveryDays?.[0] ?? Infinity) - (b.landed.deliveryDays?.[0] ?? Infinity) || a.tier - b.tier);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">{t("offer.deliverTo")}</span>
          <select
            value={dest}
            onChange={(e) => actions.location({ type: "setDeliveryDestination", country: e.target.value as CountryCode })}
            className="h-10 rounded-lg border border-line bg-surface px-2 text-sm"
          >
            {(Object.keys(COUNTRY_NAME) as CountryCode[]).map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">{t("offer.sortBy")}</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value="total">{t("offer.sortTotal")}</option>
            <option value="item">{t("offer.sortItem")}</option>
            <option value="fastest">{t("offer.sortFastest")}</option>
          </select>
        </label>
      </div>
      {sortBy === "item" && <p className="text-xs text-muted">{t("offer.sortItemNote")}</p>}
      {/* The headline best total is shown once, above the table (BestOfferSummary). Here only caveats. */}
      {ranking.best && ranking.bestIsUncertain && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("offer.uncertain")}
        </p>
      )}

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t("offer.caption", { name: product.name, country: countryName(dest), cur: currency })}</caption>
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">{t("offer.retailer")}</th>
              <th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">{t("offer.item")}</th>
              <th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">{t("offer.shipping")}</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">{t("offer.delivered", { cur: currency })}</th>
              <th scope="col" className="px-2 py-3"><span className="sr-only">{t("offer.details")}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const retailer = r.offer.retailer;
              const isOpen = open.has(r.offer.id);
              const pct = discountPercent(r.offer.price, r.offer.reference?.price);
              const dim = r.tier >= 2;
              const toggle = () =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(r.offer.id)) next.delete(r.offer.id);
                  else next.add(r.offer.id);
                  return next;
                });
              return (
                <Fragment key={r.offer.id}>
                  <tr className={`border-t border-line align-top transition-colors hover:bg-primary-soft/30 ${dim ? "opacity-80" : ""}`}>
                    <td className="px-4 py-3">
                      <button type="button" aria-expanded={isOpen} aria-controls={`bd-${r.offer.id}`} onClick={toggle}
                        className="group inline-flex items-center gap-1.5 text-left font-semibold text-ink underline-offset-4 hover:text-primary hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-primary">
                        {retailer.name}
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      <p className="text-xs text-muted">{t("offer.shipsFrom", { country: countryName(r.offer.shipFrom) })}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <StatusBadge status={r.landed.status} demo={r.offer.source !== "awin"} />
                        {r.landed.stale && (
                          <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-xs text-warning-ink" title={t("offer.staleTitle", { n: STALE_AFTER_DAYS })}>
                            {t("offer.stale")}
                          </span>
                        )}
                        {r.offer.stock === "low_stock" && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{t("offer.lowStock")}{mode === "demo" ? t("offer.demoTag") : ""}</span>}
                        {r.offer.stock === "unknown" && mode !== "demo" && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{t("offer.stockNotStated")}</span>}
                        {r.landed.reason && <span className="text-xs text-muted">{r.landed.reason}</span>}
                      </div>
                      <div className="mt-2 sm:hidden"><VisitStoreLink offer={r.offer} compact /></div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {money(r.offer.price.minor, r.offer.price.currency)}
                      {pct !== null && <span className="ml-1.5 rounded bg-success-soft px-1 text-xs font-semibold text-success-ink" title={r.offer.reference?.evidence}>−{pct}%</span>}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Cost c={r.landed.shipping} currency={r.landed.currency} />
                      {r.landed.deliveryDays && <p className="text-xs text-muted">{t("offer.days", { a: r.landed.deliveryDays[0], b: r.landed.deliveryDays[1] })}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.landed.status === "unavailable" ? (
                        <span className="text-muted">—</span>
                      ) : r.displayTotalMinor !== null ? (
                        <button type="button" onClick={toggle} className="font-semibold text-ink underline-offset-4 hover:text-primary hover:underline" aria-label={t("offer.viewDetails", { name: retailer.name })}>
                          {money(r.displayTotalMinor, currency)}
                        </button>
                      ) : (
                        <span>
                          <span className="font-semibold text-ink">{money(r.displayKnownMinor, currency)}</span>
                          <span className="block text-xs text-warning-ink">{t("offer.unknownParts", { parts: r.landed.unknownParts.map((x) => t(`offer.part.${x}`)).join(" & ") })}</span>
                        </span>
                      )}
                      {r.landed.status !== "unavailable" && r.offer.price.currency !== currency && (
                        <span className="block text-[11px] text-muted" title={t("offer.convertedFromTitle")}>
                          {t("offer.convertedFrom", { cur: r.offer.price.currency })}
                        </span>
                      )}
                      <div className="mt-2 hidden sm:block"><VisitStoreLink offer={r.offer} compact /></div>
                    </td>
                    <td className="px-2 py-3">
                      <button type="button" aria-expanded={isOpen} aria-controls={`bd-${r.offer.id}`} onClick={toggle}
                        className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label={t("offer.detailsFor", { name: retailer.name })}>
                        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr id={`bd-${r.offer.id}`} className="border-t border-line">
                      <td colSpan={5} className="px-4 pb-4 pt-1">
                        <Breakdown r={r} />
                        {mode === "demo" ? (
                          <p className="mt-3"><DemoBadge>{t("offer.fictionalNoLink")}</DemoBadge></p>
                        ) : r.offer.source === "sample" ? (
                          <p className="mt-3"><DemoBadge>{t("offer.demoNoLink")}</DemoBadge></p>
                        ) : r.offer.clickable ? (
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <VisitStoreLink offer={r.offer} />
                            <span className="text-xs text-muted">{t("offer.affiliate")}</span>
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-muted">{t("offer.noLink")}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">{t("offer.everySelectable")}</p>
      <p className="flex items-start gap-2 text-xs text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t("offer.ranking")} {mode === "live" ? t("offer.rankingLive") : t("offer.rankingDemo")}
      </p>
    </div>
  );
}
