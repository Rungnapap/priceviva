"use client";

import { useEffect, useRef, useState } from "react";
import { useClientState, useHydrated } from "@/lib/client-store";
import { parsePriceInput } from "@/lib/listing-price";
import { useT } from "./i18n-provider";

/**
 * Minimum / maximum price inside the search filter form (a plain GET form, so filters stay in the URL and survive
 * paging and sharing). Checks the values before the form is sent: no negative or invalid numbers, minimum not
 * above maximum, either side may stay empty. Also records which currency the range was typed in.
 */
export function PriceRangeFields({ min, max }: { min: number | null; max: number | null }) {
  const t = useT();
  const hydrated = useHydrated();
  const { currency } = useClientState();
  const wrap = useRef<HTMLFieldSetElement>(null);
  const [error, setError] = useState<"invalid" | "order" | null>(null);

  useEffect(() => {
    const form = wrap.current?.form;
    if (!form) return;
    const onSubmit = (e: SubmitEvent) => {
      const minEl = form.elements.namedItem("min") as HTMLInputElement | null;
      const maxEl = form.elements.namedItem("max") as HTMLInputElement | null;
      const lo = parsePriceInput(minEl?.value ?? "");
      const hi = parsePriceInput(maxEl?.value ?? "");
      if (Number.isNaN(lo) || Number.isNaN(hi)) {
        e.preventDefault();
        setError("invalid");
        (Number.isNaN(lo) ? minEl : maxEl)?.focus();
        return;
      }
      if (lo !== null && hi !== null && lo > hi) {
        e.preventDefault();
        setError("order");
        minEl?.focus();
        return;
      }
      setError(null);
      // Normalise "1 299,50" → "1299.5" so the URL is clean.
      if (minEl) minEl.value = lo === null ? "" : String(lo);
      if (maxEl) maxEl.value = hi === null ? "" : String(hi);
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  const errId = "price-range-error";
  return (
    <fieldset ref={wrap} className="min-w-0">
      <legend className="mb-1 block text-xs font-medium text-muted">
        {t("search.priceRange")} {hydrated && <span className="font-normal">({currency})</span>}
      </legend>
      <div className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor="smin">{t("search.minPrice", { cur: currency })}</label>
        <input
          id="smin"
          name="min"
          inputMode="decimal"
          defaultValue={min ?? ""}
          placeholder={t("search.minShort")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className="h-10 w-24 rounded-lg border border-line bg-surface px-2 text-sm aria-[invalid=true]:border-error"
        />
        <span className="text-sm text-muted" aria-hidden="true">–</span>
        <label className="sr-only" htmlFor="smax">{t("search.maxPrice", { cur: currency })}</label>
        <input
          id="smax"
          name="max"
          inputMode="decimal"
          defaultValue={max ?? ""}
          placeholder={t("search.maxShort")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className="h-10 w-24 rounded-lg border border-line bg-surface px-2 text-sm aria-[invalid=true]:border-error"
        />
        <input type="hidden" name="cur" value={hydrated ? currency : ""} />
      </div>
      {error && (
        <p id={errId} role="alert" className="mt-1 max-w-[16rem] text-xs font-medium text-error-ink">
          {t(error === "order" ? "search.rangeOrder" : "search.rangeInvalid")}
        </p>
      )}
    </fieldset>
  );
}
