"use client";

import clsx from "clsx";
import { useId, useState, type FormEvent } from "react";
import { cities } from "@/data/places";
import type { AreaPlace } from "@/lib/location";
import { normalize } from "@/lib/search";
import { MapPin, Navigation } from "./icons";
import { useT } from "./i18n-provider";

type Found = { key: string; place: AreaPlace; detail: string };
type Lookup = { kind: "idle" } | { kind: "loading" } | { kind: "done"; list: Found[]; note?: string } | { kind: "error"; message: string };
type Device =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "naming" }
  | { kind: "detected"; place: AreaPlace; named: boolean }
  | { kind: "error"; message: string };

interface GeoJson {
  status: string;
  message?: string;
  results?: { label: string; detail: string; lat: number; lng: number; country: string }[];
}

/**
 * Choose any real place: type a city, town or postcode (looked up with OpenStreetMap Nominatim via /api/geocode),
 * pick a quick city, or — only when asked — use the device position, which is shown as a suggestion first.
 * The chosen place is passed to `onChoose` exactly as found; it is never swapped for a "supported" city.
 */
export function LocationSearch({
  onChoose,
  tone = "radar",
  quickPicks = true,
  selectedLabel,
}: {
  onChoose: (place: AreaPlace) => void;
  tone?: "radar" | "primary";
  quickPicks?: boolean;
  /** Highlights the quick pick that matches the current choice. */
  selectedLabel?: string | null;
}) {
  const id = useId();
  const t = useT();
  const [q, setQ] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ kind: "idle" });
  const [device, setDevice] = useState<Device>({ kind: "idle" });
  const btn = tone === "radar" ? "bg-radar hover:bg-radar-hover" : "bg-primary hover:bg-primary-hover";
  const ring = tone === "radar" ? "focus:border-radar focus:ring-radar/15" : "focus:border-primary focus:ring-primary/15";

  const quick = (text: string): Found[] => {
    const n = normalize(text);
    return cities
      .filter((c) => n.length >= 2 && normalize(c.name).startsWith(n))
      .map((c) => ({ key: `city-${c.id}`, detail: t("loc.quickPick"), place: { label: c.name, lat: c.lat, lng: c.lng, country: c.country, source: "city" as const } }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (text.length < 2) return setLookup({ kind: "error", message: t("loc.tooShort") });
    const local = quick(text);
    setLookup({ kind: "loading" });
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`);
      const data = (await r.json()) as GeoJson;
      if (data.status !== "ok") {
        return setLookup(
          local.length
            ? { kind: "done", list: local, note: `${t("loc.unavailable")} ${t("loc.quickMatches")}` }
            : { kind: "error", message: t("loc.unavailable") },
        );
      }
      const found: Found[] = (data.results ?? []).map((g, i) => ({
        key: `geo-${i}`,
        detail: g.detail,
        place: { label: g.label, lat: g.lat, lng: g.lng, country: g.country, source: "search" },
      }));
      setLookup(found.length ? { kind: "done", list: found } : { kind: "error", message: t("loc.notFound", { q: text }) });
    } catch {
      setLookup(
        local.length
          ? { kind: "done", list: local, note: `${t("loc.unreachableShort")} ${t("loc.quickMatches")}` }
          : { kind: "error", message: t("loc.unreachable") },
      );
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return setDevice({ kind: "error", message: t("loc.noGeo") });
    setDevice({ kind: "asking" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Math.round(pos.coords.latitude * 100) / 100;
        const lng = Math.round(pos.coords.longitude * 100) / 100;
        setDevice({ kind: "naming" });
        try {
          const data = (await (await fetch(`/api/geocode?lat=${lat}&lng=${lng}`)).json()) as GeoJson;
          const g = data.status === "ok" ? data.results?.[0] : undefined;
          setDevice(
            g
              ? { kind: "detected", named: true, place: { label: g.label, lat, lng, country: g.country, source: "device" } }
              : { kind: "detected", named: false, place: { label: t("loc.approx"), lat, lng, source: "device" } },
          );
        } catch {
          setDevice({ kind: "detected", named: false, place: { label: t("loc.approx"), lat, lng, source: "device" } });
        }
      },
      (err) =>
        setDevice({
          kind: "error",
          message: err.code === err.PERMISSION_DENIED ? t("loc.denied") : t("loc.notFoundDevice"),
        }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  return (
    <div className="space-y-2.5">
      <form onSubmit={submit} className="flex flex-wrap gap-2" role="search" aria-label={t("loc.formLabel")}>
        <label htmlFor={`${id}-loc`} className="sr-only">{t("loc.inputLabel")}</label>
        <div className="relative min-w-0 flex-1 basis-full sm:basis-56">
          <MapPin className={clsx("pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2", tone === "radar" ? "text-radar" : "text-primary")} aria-hidden="true" />
          <input
            id={`${id}-loc`}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (lookup.kind !== "idle") setLookup({ kind: "idle" });
            }}
            placeholder={t("loc.placeholder")}
            autoComplete="off"
            className={clsx("h-11 w-full rounded-full border border-line bg-surface pl-10 pr-3 text-[15px] focus:outline-none focus:ring-4", ring)}
          />
        </div>
        <button type="submit" className={clsx("h-11 flex-1 whitespace-nowrap rounded-full px-5 text-sm font-semibold text-white sm:flex-none", btn)}>
          {t("loc.find")}
        </button>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={device.kind === "asking" || device.kind === "naming"}
          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-line px-4 text-sm font-semibold hover:bg-surface-2 disabled:opacity-60 sm:flex-none"
        >
          <Navigation className="h-4 w-4" aria-hidden="true" />
          {device.kind === "asking" ? t("loc.waiting") : device.kind === "naming" ? t("loc.naming") : t("loc.useMine")}
        </button>
      </form>

      <div aria-live="polite" className="space-y-2">
        {lookup.kind === "loading" && <p className="text-sm text-muted">{t("loc.searching")}</p>}
        {lookup.kind === "error" && <p className="text-sm text-warning-ink">{lookup.message}</p>}
        {lookup.kind === "done" && (
          <div className="rounded-2xl border border-line bg-surface p-1.5 shadow-card">
            {lookup.note && <p className="px-2.5 py-1.5 text-sm text-muted">{lookup.note}</p>}
            <ul>
              {lookup.list.map((f) => (
                <li key={f.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onChoose(f.place);
                      setLookup({ kind: "idle" });
                      setQ("");
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{f.place.label}</span>
                      <span className="block truncate text-xs text-muted">{f.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-primary-ink">{t("loc.choose")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {device.kind === "error" && <p role="alert" className="text-sm text-warning-ink">{device.message}</p>}
        {device.kind === "detected" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm">
            <p>
              <strong>{t("loc.detected", { place: device.place.label })}</strong>
              <span className="block text-xs text-muted">
                {t("loc.detectedNote")}{device.named ? "" : ` ${t("loc.unnamed")}`}
              </span>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { onChoose(device.place); setDevice({ kind: "idle" }); }} className={clsx("rounded-full px-4 py-2 text-sm font-semibold text-white", btn)}>
                {device.named ? t("loc.use", { place: device.place.label }) : t("loc.useThis")}
              </button>
              <button type="button" onClick={() => setDevice({ kind: "idle" })} className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface">
                {t("loc.dismiss")}
              </button>
            </div>
          </div>
        )}
      </div>

      {quickPicks && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t("loc.quickPicks")}</span>
          {cities.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={selectedLabel === c.name}
              onClick={() => onChoose({ label: c.name, lat: c.lat, lng: c.lng, country: c.country, source: "city" })}
              className={clsx(
                "rounded-full border px-3 py-1 text-sm",
                selectedLabel === c.name ? "border-primary bg-primary-soft font-medium text-primary-ink" : "border-line hover:bg-surface-2",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">{t("loc.privacy")}</p>
    </div>
  );
}
