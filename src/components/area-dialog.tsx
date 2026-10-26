"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { cities } from "@/data/places";
import { actions, useClientState } from "@/lib/client-store";
import { RADIUS_OPTIONS_KM, activeArea, areaCenter, areaFromPlace, areaName, type AreaPlace, type RadiusKm } from "@/lib/location";
import { MapPin, X } from "./icons";
import { LocationSearch } from "./location-search";
import { toast } from "./toast";
import { useCountryName, useT } from "./i18n-provider";

/**
 * Shopping-area picker. Rules:
 *  - Any real town, city or postcode can be chosen (OpenStreetMap lookup); quick picks are just shortcuts.
 *  - Location permission is only requested when the user presses "Use my location"; the detected place is a
 *    suggestion that the user confirms. It is never replaced by another city.
 *  - "Set as my area" changes the saved default; "Browse here for now" is temporary (this tab only).
 *  - This never changes the delivery destination.
 */
export function AreaDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { location } = useClientState();
  const t = useT();
  const countryName = useCountryName();
  const { area } = activeArea(location);
  const current = area ? areaCenter(area, cities) : null;
  const [pending, setPending] = useState<AreaPlace | null>(
    current ? { label: areaName(area!, cities) ?? current.label, lat: current.lat, lng: current.lng, source: area?.place?.source ?? "city" } : null,
  );
  const [radius, setRadius] = useState<RadiusKm>(area?.radiusKm ?? 10);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const commit = (mode: "saved" | "temporary") => {
    if (!pending) return;
    const next = areaFromPlace(pending, radius, cities);
    actions.location(mode === "saved" ? { type: "setSavedArea", area: next } : { type: "setTemporaryArea", area: next });
    toast(mode === "saved" ? t("area.setToast", { place: pending.label }) : t("area.browseToast", { place: pending.label }));
    onClose();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="area-title"
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-lift backdrop:bg-[#101828]/50"
    >
      <div className="max-h-[88vh] overflow-y-auto p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="area-title" className="pv-display text-xl font-bold">{t("area.title")}</h2>
            <p className="mt-1 text-sm text-muted">{t("area.lead", { country: countryName(location.deliveryDestination) })}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label={t("common.close")}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <LocationSearch tone="primary" onChoose={setPending} selectedLabel={pending?.label ?? null} />

        <div className="mt-5 rounded-2xl border border-line p-4">
          <p className="text-sm">
            <span className="text-muted">{t("area.selected")} </span>
            {pending ? (
              <strong>
                {pending.label}
                {pending.source === "device" && <span className="ml-1 font-normal text-muted">{t("radar.fromDevice")}</span>}
              </strong>
            ) : (
              <span className="text-muted">{t("area.nothing")}</span>
            )}
          </p>
          <fieldset className="mt-3">
            <legend className="mb-2 text-sm font-semibold">{t("radar.radius")}</legend>
            <div className="flex flex-wrap gap-2">
              {RADIUS_OPTIONS_KM.map((r) => (
                <label
                  key={r}
                  className={clsx(
                    "cursor-pointer rounded-full border px-3.5 py-1.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary",
                    radius === r ? "border-primary bg-primary-soft font-medium text-primary-ink" : "border-line hover:bg-surface-2",
                  )}
                >
                  <input type="radio" name="radius" value={r} checked={radius === r} onChange={() => setRadius(r)} className="sr-only" />
                  {r} km
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={!pending} onClick={() => commit("temporary")} className="rounded-full border border-line px-4 py-2.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50">
            {t("area.browse")}
          </button>
          <button
            type="button"
            disabled={!pending}
            onClick={() => commit("saved")}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            <MapPin className="h-4 w-4" aria-hidden="true" /> {t("area.set")}
          </button>
        </div>
        {location.savedArea && (
          <p className="mt-3 text-right text-xs text-muted">
            {t("area.saved", { place: areaName(location.savedArea, cities) ?? "", km: location.savedArea.radiusKm })}
          </p>
        )}
      </div>
    </dialog>
  );
}
