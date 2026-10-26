"use client";

import clsx from "clsx";
import type { TotalStatus } from "@/lib/types";
import { useT } from "./i18n-provider";

const STATUS_STYLE: Record<TotalStatus, string> = {
  verified_total: "bg-success-soft text-success-ink border-success/25",
  estimated_total: "bg-primary-soft text-primary-ink border-primary/25",
  partial_total: "bg-warning-soft text-warning-ink border-warning/30",
  item_price_only: "bg-warning-soft text-warning-ink border-warning/30",
  unavailable: "bg-surface-2 text-muted border-line",
};

/**
 * `demo` = the offer is demonstration/sample data: a complete total is then called "complete (demo data)",
 * never "verified", because nobody verified a real retailer's costs.
 */
export function StatusBadge({ status, long = false, demo = false }: { status: TotalStatus; long?: boolean; demo?: boolean }) {
  const t = useT();
  const longLabel = t(`statusLong.${status}`);
  const text = demo && status === "verified_total" ? (long ? t("status.demoCompleteLong") : t("status.demoComplete")) : long ? longLabel : t(`status.${status}`);
  return (
    <span
      className={clsx("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium sm:text-xs", STATUS_STYLE[status])}
      title={demo ? t("status.demoTitle", { label: longLabel }) : longLabel}
    >
      {text}
    </span>
  );
}
