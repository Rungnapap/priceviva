"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { useClientState, useHydrated } from "@/lib/client-store";
import { convertMinor } from "@/lib/money";
import { summarizeHistory, type HistoryRange, type PriceObservation } from "@/lib/price-history";
import { useCatalog } from "./catalog-context";
import { History } from "./icons";
import { DemoBadge } from "./ui";
import { useFormatMoney, useIntlLocale, useT } from "./i18n-provider";

const RANGE_LABEL = { "30d": "history.r30", "90d": "history.r90", "1y": "history.r1y", all: "history.rAll" } as const satisfies Record<HistoryRange, string>;
const COLORS = ["var(--pa-primary)", "var(--pa-radar)", "var(--pa-gold-ink)", "var(--pa-success)", "var(--pa-navy)"];

/**
 * Recorded item prices per shop over time. Only real observations are drawn; with too little data the
 * component says so instead of drawing a line. Item price ≠ delivered total (see note under the chart).
 */
export function PriceHistoryChart({ observations }: { observations: PriceObservation[] }) {
  const hydrated = useHydrated();
  const { currency } = useClientState();
  const { fx } = useCatalog();
  const t = useT();
  const formatMoney = useFormatMoney();
  const intl = useIntlLocale();
  const day = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short" });
  const dayTime = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const [range, setRange] = useState<HistoryRange>("all");
  const summary = useMemo(() => summarizeHistory(observations, range), [observations, range]);
  const all = useMemo(() => summarizeHistory(observations, "all"), [observations]);

  if (!hydrated) return <div className="h-56 animate-pulse rounded-[var(--radius-card)] bg-surface-2" aria-label={t("common.loading")} />;

  const sample = all.source === "sample";
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="hist-h" className="flex items-center gap-2 font-semibold">
        <History className="h-4 w-4" aria-hidden="true" /> {t("tools.history")}
      </h2>
      {sample && <DemoBadge>{t("history.demoBadge")}</DemoBadge>}
    </div>
  );

  if (!all.sufficient) {
    return (
      <section aria-labelledby="hist-h" className="rounded-[var(--radius-card)] border border-dashed border-line p-5">
        {header}
        <p className="mt-2 text-sm text-muted">
          {all.observationCount === 0
            ? t("history.none")
            : t("history.notEnough", { n: all.observationCount, date: new Intl.DateTimeFormat(intl, { day: "numeric", month: "long" }).format(new Date(all.firstAt!)) })}
          {sample && ` ${t("history.sampleNote")}`}
        </p>
      </section>
    );
  }

  // Convert each point to the display currency with TODAY's reference rate (labelled below).
  const conv = (minor: number, from: (typeof summary.series)[number]["currency"]) => convertMinor(minor, from, currency, fx);
  const series = summary.series.filter((s) => s.points.length > 0);
  const pts = series.flatMap((s) => s.points.map((p) => ({ t: p.t, v: conv(p.priceMinor, s.currency) })));
  const tMin = Math.min(...pts.map((p) => p.t));
  const tMax = Math.max(...pts.map((p) => p.t));
  const vMin = Math.min(...pts.map((p) => p.v));
  const vMax = Math.max(...pts.map((p) => p.v));
  const pad = (vMax - vMin) * 0.15 || vMax * 0.05 || 100;
  const lo = Math.max(0, vMin - pad);
  const hi = vMax + pad;
  const W = 640;
  const H = 220;
  const L = 64;
  const B = 28;
  const x = (t: number) => L + (tMax === tMin ? (W - L) / 2 : ((t - tMin) / (tMax - tMin)) * (W - L - 12));
  const y = (v: number) => 10 + (1 - (v - lo) / (hi - lo)) * (H - B - 10);
  const converted = series.some((s) => s.currency !== currency);
  const ticks = [lo, (lo + hi) / 2, hi];

  return (
    <section aria-labelledby="hist-h" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      {header}
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t("history.timeRange")}>
        {(["30d", "90d", "1y", "all"] as HistoryRange[]).map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            disabled={!all.ranges.includes(r)}
            onClick={() => setRange(r)}
            className={clsx("min-h-8 rounded-full border px-3 text-xs font-semibold disabled:opacity-40", range === r ? "border-ink bg-ink text-surface" : "border-line hover:bg-surface-2")}
          >
            {t(RANGE_LABEL[r])}
          </button>
        ))}
      </div>
      <figure className="mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("history.chartLabel", { n: series.length })}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--pa-line)" />
              <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--pa-muted)">{formatMoney(v, currency, { compact: true })}</text>
            </g>
          ))}
          <text x={L} y={H - 6} fontSize="11" fill="var(--pa-muted)">{day.format(new Date(tMin))}</text>
          <text x={W} y={H - 6} fontSize="11" textAnchor="end" fill="var(--pa-muted)">{day.format(new Date(tMax))}</text>
          {series.map((s, i) => {
            const color = COLORS[i % COLORS.length]!;
            // Step line: a price holds until the next observation.
            const d = s.points
              .map((p, j) => {
                const px = x(p.t);
                const py = y(conv(p.priceMinor, s.currency));
                return j === 0 ? `M${px},${py}` : `H${px} V${py}`;
              })
              .join(" ");
            return (
              <g key={s.offerId}>
                <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
                {s.points.map((p) => (
                  <circle key={p.t} cx={x(p.t)} cy={y(conv(p.priceMinor, s.currency))} r="3.5" fill={color}>
                    <title>
                      {t("history.point", { retailer: s.retailer, price: formatMoney(p.priceMinor, s.currency) })}{p.shippingMinor !== null ? t("history.plusShipping", { price: formatMoney(p.shippingMinor, s.currency) }) : ""} · {dayTime.format(new Date(p.t))}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {series.map((s, i) => {
            const last = s.points[s.points.length - 1]!;
            return (
              <span key={s.offerId} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />
                {t("history.legend", { retailer: s.retailer, price: formatMoney(last.priceMinor, s.currency), n: s.points.length })}
              </span>
            );
          })}
        </figcaption>
      </figure>
      <p className="mt-3 text-xs text-muted">
        {t("history.footnote", { n: summary.observationCount, from: day.format(new Date(summary.firstAt!)), to: day.format(new Date(summary.lastAt!)) })}
        {converted ? ` ${t("history.convNote", { cur: currency, label: fx.label, date: fx.asOf })}` : ""}
      </p>
    </section>
  );
}
