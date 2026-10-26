"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cities, promotions, stores } from "@/data/places";
import { shopCategories } from "@/data/shop-categories";
import { actions, useClientState, useHydrated } from "@/lib/client-store";
import { demoLocalOffers, filterLocalOffers, fromLocalJson, productQueryTerms, type LocalOfferJson, type LocalOfferView, type LocalSort } from "@/lib/local-offers";
import { RADIUS_OPTIONS_KM, activeArea, areaCenter, areaFromPlace, areaName, distanceKm, type AreaPlace } from "@/lib/location";
import { discountPercent } from "@/lib/money";
import { useCatalog } from "./catalog-context";
import { Clock, LayoutGrid, MapPin, Navigation, Search, Store, Tag, X } from "./icons";
import { LocationSearch } from "./location-search";
import { TileMap } from "./tile-map";
import { DemoBadge, EmptyState } from "./ui";
import { toast } from "./toast";
import { useFormatMoney, useIntlLocale, useT } from "./i18n-provider";
import { categoryLabel } from "@/i18n";

const STATUS_LABEL = {
  verified: { key: "radar.verifiedOffer", cls: "bg-success-soft text-success-ink" },
  merchant: { key: "radar.merchantSupplied", cls: "bg-primary-soft text-primary-ink" },
  demo: { key: "card.demo", cls: "" },
} as const;

const AVAILABILITY = { in_stock: "radar.inStock", limited: "radar.limited", out_of_stock: "radar.outOfStock", unknown: "radar.availabilityUnknown" } as const;

// ---------------------------------------------------------------------------------------------
// Offer card
// ---------------------------------------------------------------------------------------------
export function LocalOfferCard({
  o,
  linkProduct,
  selected = false,
  onSelect,
}: {
  o: LocalOfferView;
  linkProduct: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const t = useT();
  const money = useFormatMoney();
  const intl = useIntlLocale();
  const dateFmt = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short" });
  const timeFmt = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const pct = o.price ? discountPercent(o.price, o.reference?.price) : null;
  const real = o.status !== "demo" && o.store.lat !== null && o.store.lng !== null;
  const directions = real ? `https://www.openstreetmap.org/directions?to=${o.store.lat}%2C${o.store.lng}` : null;
  return (
    <article
      id={`offer-${o.id}`}
      onMouseEnter={onSelect}
      onFocus={onSelect}
      className={clsx(
        "flex h-full scroll-mt-40 flex-col gap-3 rounded-[var(--radius-card)] border bg-surface p-4 shadow-card transition-colors sm:p-5",
        selected ? "border-primary ring-2 ring-primary/20" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{o.store.retailerName}</p>
          <p className="truncate text-xs text-muted">{o.store.name}</p>
        </div>
        {o.status === "demo" ? <DemoBadge>{t("card.demo")}</DemoBadge> : <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_LABEL[o.status].cls}`}>{t(STATUS_LABEL[o.status].key)}</span>}
      </div>

      <div>
        <h3 className="font-semibold leading-snug text-ink">{o.title}</h3>
        {o.price ? (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
            <span className="text-xl font-bold text-ink">{money(o.price.minor, o.price.currency)}</span>
            {o.reference && <span className="text-sm text-muted line-through">{money(o.reference.price.minor, o.reference.price.currency)}</span>}
            {pct !== null && <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-xs font-semibold text-success-ink">−{pct}%</span>}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">{t("radar.priceNotStated")}</p>
        )}
        {o.reference && <p className="mt-1 text-xs text-muted">{t("radar.referencePrice", { evidence: o.reference.evidence })}</p>}
      </div>

      <dl className="grid grid-cols-[1.25rem_1fr] gap-x-2 gap-y-1.5 text-sm">
        <dt><Clock className="mt-0.5 h-4 w-4 text-muted" aria-label={t("radar.valid")} /></dt>
        <dd>
          {o.timing === "upcoming" ? <span className="font-medium text-warning-ink">{t("radar.starts", { date: dateFmt.format(o.validFrom) })}</span> : <span>{t("radar.validUntil", { date: dateFmt.format(o.validTo) })}</span>}
          <span className="text-muted"> · {o.scope === "in_store" ? t("radar.inStoreOnly") : o.scope === "online" ? t("radar.onlineOnly") : t("radar.both")}{o.pickup ? ` · ${t("radar.pickup")}` : ""}</span>
        </dd>
        <dt><MapPin className="mt-0.5 h-4 w-4 text-muted" aria-label={t("radar.location")} /></dt>
        <dd>
          {o.store.address ?? <span className="text-muted">{o.status === "demo" ? t("radar.fictionalStore", { city: o.store.city ?? t("radar.aDemoCity") }) : t("radar.noAddress")}</span>}
          {real && o.distanceKm !== null && <span className="text-muted"> · {t("radar.away", { km: o.distanceKm < 1 ? "<1" : o.distanceKm.toFixed(1) })}</span>}
        </dd>
        <dt><Tag className="mt-0.5 h-4 w-4 text-muted" aria-label={t("radar.availability")} /></dt>
        <dd className={o.availability === "unknown" ? "text-muted" : ""}>
          {t(AVAILABILITY[o.availability])}
          {o.updatedAt && <span className="text-muted"> · {t("radar.updated", { time: timeFmt.format(new Date(o.updatedAt)) })}</span>}
        </dd>
      </dl>

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {directions && (
          <a href={directions} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-radar px-4 text-sm font-semibold text-white hover:bg-radar-hover">
            <Navigation className="h-4 w-4" aria-hidden="true" /> {t("radar.directions")}
          </a>
        )}
        {o.store.website && (
          <a href={o.store.website} target="_blank" rel="noopener noreferrer sponsored" className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:bg-surface-2">
            {t("radar.website")}
          </a>
        )}
        {linkProduct && o.productSlug && (
          <Link href={`/product/${o.productSlug}`} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-semibold text-primary-ink hover:bg-surface-2">
            {t("radar.compareOnlinePrices")}
          </Link>
        )}
        {o.status === "demo" && <span className="inline-flex min-h-10 items-center text-xs text-muted">{t("radar.noDirectionsDemo")}</span>}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
type Remote = { key: string; state: "idle" | "ready" | "error"; supported: boolean; offers: LocalOfferView[]; error?: string; failed?: boolean };

/** One shared empty list, so "no offers" is the same value on every render. */
const EMPTY_OFFERS: LocalOfferView[] = [];

export function LocalDealRadar() {
  const hydrated = useHydrated();
  const { location } = useClientState();
  const { area, isTemporary } = activeArea(location);
  const { mode } = useCatalog();
  const t = useT();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [sort, setSort] = useState<LocalSort | "">("");
  const [view, setView] = useState<"list" | "map">("list");
  const [showDemo, setShowDemo] = useState(mode === "demo");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  const [remote, setRemote] = useState<Remote>({ key: "", state: "idle", supported: false, offers: [] });
  const live = mode === "live";
  const center = area ? areaCenter(area, cities) : null;
  const name = area ? areaName(area, cities) : null;
  // Merchant / verified offers near the chosen centre (live mode has a data source; demo/test report "not connected").
  // The result is tagged with the area it belongs to, so a changed area shows "loading" until its own answer arrives.
  const fetchKey = center && area ? `${center.lat},${center.lng},${area.radiusKm}` : "";
  useEffect(() => {
    if (!fetchKey) return;
    const [lat, lng, radius] = fetchKey.split(",");
    let cancelled = false;
    fetch(`/api/local-offers?lat=${lat}&lng=${lng}&radius=${radius}`)
      .then((r) => r.json() as Promise<{ supported: boolean; offers: LocalOfferJson[]; error?: string }>)
      .then((d) => {
        if (!cancelled) setRemote({ key: fetchKey, state: d.error ? "error" : "ready", supported: d.supported, offers: (d.offers ?? []).map(fromLocalJson), error: d.error });
      })
      .catch(() => {
        if (!cancelled) setRemote({ key: fetchKey, state: "error", supported: true, offers: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchKey]);
  const remoteLoading = fetchKey !== "" && remote.key !== fetchKey;
  const remoteOffers = remoteLoading ? EMPTY_OFFERS : remote.offers;

  // Plain derived values (no manual useMemo): the lists are small (tens of offers), so recomputing them on a
  // render is cheap, and it keeps every dependency visible to React / the React Compiler.
  const demoAll = area && !live && showDemo ? demoLocalOffers(area, cities, stores, promotions, now) : EMPTY_OFFERS;
  // Demo stores have invented positions: hide their distances (they are never pinned either).
  const demoList = demoAll.map((o) => ({ ...o, distanceKm: null }));
  const opts = { query, group, sort: sort || undefined };
  const real = filterLocalOffers(remoteOffers, opts);
  const demo = filterLocalOffers(demoAll, opts).map((o) => ({ ...o, distanceKm: null }));
  const groupsInRange = shopCategories.filter((c) => [...remoteOffers, ...demoList].some((o) => filterLocalOffers([o], { group: c.slug }).length > 0));
  const demoCitiesNear = center ? cities.map((c) => ({ c, km: distanceKm(center, c) })).sort((x, y) => x.km - y.km) : [];

  if (!hydrated) return <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-surface-2" aria-label={t("common.loading")} />;

  const choose = (place: AreaPlace) => {
    const next = areaFromPlace(place, area?.radiusKm ?? 25, cities);
    const temp = Boolean(location.savedArea);
    actions.location(temp ? { type: "setTemporaryArea", area: next } : { type: "setSavedArea", area: next });
    toast(temp ? t("radar.showingForNow", { place: place.label }) : t("area.setToast", { place: place.label }));
  };

  const terms = productQueryTerms(query);
  const pins = real.filter((o) => o.store.lat !== null && o.store.lng !== null).map((o) => ({ id: o.id, lat: o.store.lat!, lng: o.store.lng!, label: `${o.store.name}: ${o.title}` }));
  const select = (id: string) => {
    setSelectedId(id);
    if (view === "map") document.getElementById(`offer-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const mapNote = pins.length
    ? undefined
    : showDemo && demo.length
    ? t("radar.demoNotPinned")
    : t("radar.noLocations");
  const map = center && area && (
    <TileMap
      center={center}
      radiusKm={area.radiusKm}
      pins={pins}
      selectedId={selectedId}
      onSelect={(id) => {
        setSelectedId(id);
        document.getElementById(`offer-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }}
      label={t("radar.mapLabel", { km: area.radiusKm, place: name ?? "" })}
      note={mapNote}
      className={view === "map" ? "h-[60vh] min-h-[22rem] lg:h-[32rem]" : "h-[26rem]"}
    />
  );
  const searchOnline = terms.length > 0 && (
    <Link href={`/search?q=${encodeURIComponent(terms.join(" "))}`} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover">
      {t("radar.searchOnline", { q: terms.join(" ") })}
    </Link>
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <section aria-label={t("radar.controlsLabel")} className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {name ? (
              <>
                <span className="text-muted">{isTemporary ? t("radar.browsing") : t("radar.shoppingArea")}: </span>
                <strong>{name}</strong>
                {area?.place?.source === "device" && <span className="text-muted"> {t("radar.fromDevice")}</span>}
                <span className="text-muted"> · {area?.radiusKm} km</span>
                {isTemporary && <span className="ml-1.5 rounded bg-warning-soft px-1.5 text-xs text-warning-ink">{t("nav.temporary")}</span>}
              </>
            ) : (
              <span className="text-muted">{t("radar.chooseWhere")}</span>
            )}
          </p>
          {isTemporary && area && (
            <div className="flex flex-wrap gap-3 text-sm">
              <button type="button" onClick={() => actions.location({ type: "setSavedArea", area })} className="font-semibold text-radar-ink hover:underline">{t("radar.saveAsMine")}</button>
              <button type="button" onClick={() => actions.location({ type: "clearTemporaryArea" })} className="text-muted hover:text-ink hover:underline">{t("radar.backToSaved")}</button>
            </div>
          )}
        </div>

        <LocationSearch onChoose={choose} selectedLabel={name} quickPicks={false} />

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-line pt-4 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto] lg:items-center lg:gap-4">
          <div className="pv-scroll-x flex items-center gap-2" role="group" aria-label={t("radar.radiusLabel")}>
            <span className="shrink-0 text-sm text-muted max-[380px]:sr-only">{t("radar.radius")}</span>
            {RADIUS_OPTIONS_KM.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={area?.radiusKm === r}
                disabled={!area}
                onClick={() => actions.location({ type: "setRadius", radiusKm: r })}
                className={clsx("min-h-9 shrink-0 whitespace-nowrap rounded-full border px-2.5 text-sm disabled:opacity-50 sm:px-3", area?.radiusKm === r ? "border-radar bg-radar-soft font-semibold text-radar-ink" : "border-line hover:bg-surface-2")}
              >
                {r} km
              </button>
            ))}
          </div>
          <div className="relative min-w-0">
            <label htmlFor="local-q" className="sr-only">{t("radar.qLabel")}</label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              id="local-q"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("radar.searchPlaceholder")}
              className="h-10 w-full rounded-full border border-line bg-surface pl-10 pr-9 text-sm focus:border-radar focus:outline-none focus:ring-4 focus:ring-radar/15"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label={t("radar.clearQ")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-surface-2">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 lg:contents">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm lg:flex-none">
              <span className="text-muted">{t("radar.sort")}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as LocalSort | "")} className="h-10 w-full min-w-0 rounded-full border border-line bg-surface px-3 text-sm lg:w-auto">
                <option value="">{terms.length ? t("radar.bestMatch") : t("radar.nearest")}</option>
                <option value="distance">{t("radar.nearest")}</option>
                <option value="ending">{t("radar.ending")}</option>
              </select>
            </label>
            <div className="flex shrink-0 rounded-full border border-line p-0.5" role="group" aria-label={t("radar.view")}>
              {(["list", "map"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={clsx("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold", view === v ? "bg-ink text-surface" : "text-muted hover:text-ink")}
                >
                  {v === "list" ? <LayoutGrid className="h-4 w-4" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
                  {v === "list" ? t("radar.list") : t("radar.map")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {groupsInRange.length > 1 && (
          <div className="pv-scroll-x -mx-1 flex gap-2 px-1" role="group" aria-label={t("radar.category")}>
            {[{ slug: "", name: t("radar.allCategories") }, ...groupsInRange.map((c) => ({ slug: c.slug, name: categoryLabel(t, c.slug, c.name) }))].map((g) => (
              <button
                key={g.slug || "all"}
                type="button"
                aria-pressed={group === g.slug}
                onClick={() => setGroup(g.slug)}
                className={clsx("min-h-9 shrink-0 rounded-full border px-3.5 text-sm", group === g.slug ? "border-ink bg-ink text-surface" : "border-line bg-surface hover:bg-surface-2")}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}

        {!live && (
          <label className="flex items-start gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
            <input type="checkbox" checked={showDemo} onChange={(e) => setShowDemo(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--pa-radar)]" />
            <span>
              <strong>{t("radar.showDemo")}</strong>
              <span className="block text-xs text-muted">{t("radar.showDemoNote", { cities: cities.map((c) => c.name).join(", ") })}</span>
            </span>
          </label>
        )}
      </section>

      {/* Results */}
      {!area || !center ? (
        <EmptyState title={t("radar.whereTitle")} icon={<MapPin className="h-6 w-6" />}>
          {t("radar.whereText")}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {view === "map" && map}
          <div className={clsx("grid gap-6", view === "list" && "lg:grid-cols-[minmax(0,1fr)_24rem]")}>
            <div className="space-y-8">
              {/* 1. Merchant / verified offers */}
              <section aria-labelledby="real-h" className="space-y-3">
                <h2 id="real-h" className="pv-display text-lg font-bold">
                  {t("radar.storeOffersNear", { place: name ?? "" })} <span className="font-normal text-muted">· {area.radiusKm} km</span>
                </h2>
                {remoteLoading ? (
                  <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface-2" aria-label={t("radar.loadingOffers")} />
                ) : real.length > 0 ? (
                  <ul className={clsx("grid gap-4", view === "list" ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
                    {real.map((o) => (
                      <li key={o.id}>
                        <LocalOfferCard o={o} linkProduct selected={o.id === selectedId} onSelect={() => select(o.id)} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title={terms.length ? t("radar.noForQuery", { q: terms.join(" "), place: name ?? "" }) : t("radar.noVerified", { place: name ?? "" })}
                    icon={<Store className="h-6 w-6" />}
                  >
                    <p>
                      {remote.failed
                        ? t("radar.loadError")
                        : remote.error
                        ? remote.error
                        : remote.supported
                        ? t("radar.noVerifiedLive")
                        : t("radar.noVerifiedTest")}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {area.radiusKm < 100 && remote.supported && (
                        <button type="button" onClick={() => actions.location({ type: "setRadius", radiusKm: 100 })} className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2">
                          {t("radar.try100")}
                        </button>
                      )}
                      {searchOnline || (
                        <Link href="/search" className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2">
                          {t("radar.compareOnline")}
                        </Link>
                      )}
                    </div>
                  </EmptyState>
                )}
              </section>

              {/* 2. Demonstration stores — clearly separate */}
              {!live && showDemo && (
                <section aria-labelledby="demo-h" className="space-y-3 rounded-[var(--radius-card)] border border-dashed border-demo/40 bg-demo-soft/40 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="demo-h" className="pv-display text-lg font-bold">{t("radar.demoStores")}</h2>
                    <DemoBadge>{t("radar.demoBadge")}</DemoBadge>
                  </div>
                  {demo.length > 0 ? (
                    <ul className={clsx("grid gap-4", view === "list" ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
                      {demo.map((o) => (
                        <li key={o.id}>
                          <LocalOfferCard o={o} linkProduct={mode === "demo"} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">
                      {terms.length ? t("radar.noDemoMatch", { q: terms.join(" ") }) : t("radar.noDemoHere", { km: area.radiusKm, place: name ?? "" })} {t("radar.demoOnlyNear")}{" "}
                      {demoCitiesNear.slice(0, 3).map((x, i) => (
                        <span key={x.c.id}>
                          {i > 0 ? ", " : ""}
                          <button type="button" className="font-semibold text-radar-ink underline" onClick={() => choose({ label: x.c.name, lat: x.c.lat, lng: x.c.lng, country: x.c.country, source: "city" })}>
                            {x.c.name}
                          </button>{" "}
                          {t("radar.kmAway", { km: Math.round(x.km) })}
                        </span>
                      ))}
                      {demoCitiesNear.length > 3 ? t("radar.andOthers") : "."}
                    </p>
                  )}
                </section>
              )}
            </div>
            {view === "list" && <aside className="hidden lg:sticky lg:top-40 lg:block lg:self-start">{map}</aside>}
          </div>
          <p className="text-xs text-muted">
            {t("radar.footer")}
          </p>
        </div>
      )}
    </div>
  );
}
