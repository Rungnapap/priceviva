"use client";

import clsx from "clsx";
import { actions, useClientState } from "@/lib/client-store";
import { Check, Heart, Scale } from "./icons";
import { toast } from "./toast";
import { useT } from "./i18n-provider";

export function SaveButton({ productId, name, compact = false }: { productId: string; name: string; compact?: boolean }) {
  const { saved } = useClientState();
  const t = useT();
  const on = saved.includes(productId);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t("card.unsave", { name }) : t("card.save", { name })}
      onClick={() => {
        actions.toggleSaved(productId);
        toast(on ? t("action.removedToast") : t("action.savedToast"));
      }}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-full border text-sm font-medium shadow-card transition-colors",
        compact ? "h-9 w-9" : "h-11 px-5",
        on ? "border-radar/30 bg-radar-soft text-radar-ink" : "border-line bg-surface/95 text-ink hover:bg-surface-2",
      )}
    >
      <Heart className={clsx("h-[18px] w-[18px]", on && "fill-current")} aria-hidden="true" />
      {!compact && (on ? t("action.savedFav") : t("action.saveFav"))}
    </button>
  );
}

/** `group` = department/subcategory; comparison is only allowed within one group. */
export function CompareButton({ productId, group, compact = false, iconOnly = false }: { productId: string; group: string; compact?: boolean; iconOnly?: boolean }) {
  const { compare } = useClientState();
  const t = useT();
  const on = compare.includes(productId);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={iconOnly ? (on ? t("action.removeCompare") : t("card.addCompare")) : undefined}
      title={iconOnly ? (on ? t("card.inCompare") : t("card.addCompare")) : undefined}
      onClick={() => {
        const err = actions.toggleCompare(productId, group);
        if (err) toast(t(err === "max" ? "action.compareMax" : "action.compareSameType"), "error");
        else if (!on) toast(t("action.addedCompare", { n: compare.length + 1 }));
      }}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-full border text-sm font-medium transition-colors",
        iconOnly ? "h-9 w-9" : compact ? "h-9 px-3" : "h-11 px-5",
        on ? "border-primary/40 bg-primary-soft text-primary-ink" : "border-line bg-surface text-ink hover:bg-surface-2",
      )}
    >
      {on ? <Check className="h-4 w-4" aria-hidden="true" /> : <Scale className="h-4 w-4" aria-hidden="true" />}
      {!iconOnly && (on ? t("action.inCompare") : t("action.addCompare"))}
    </button>
  );
}
