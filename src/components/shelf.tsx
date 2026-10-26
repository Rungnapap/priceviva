"use client";

import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "./icons";
import { useT } from "./i18n-provider";

/** Horizontal product shelf with keyboard-scrollable region and prev/next buttons. */
export function Shelf({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  };
  return (
    <div className="relative">
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="pa-shelf -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 sm:[scroll-padding-inline:1.5rem]"
      >
        {children}
      </div>
      <div className="pointer-events-none absolute -top-14 right-0 flex items-center gap-2">
        {action && <span className="pointer-events-auto mr-2">{action}</span>}
        <button type="button" onClick={() => scroll(-1)} aria-label={t("shelf.left", { label })}
          className="pointer-events-auto hidden h-9 w-9 sm:flex items-center justify-center rounded-full border border-line bg-surface text-ink shadow-card hover:bg-surface-2">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => scroll(1)} aria-label={t("shelf.right", { label })}
          className="pointer-events-auto hidden h-9 w-9 sm:flex items-center justify-center rounded-full border border-line bg-surface text-ink shadow-card hover:bg-surface-2">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
