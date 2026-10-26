import clsx from "clsx";
import type { ReactNode } from "react";

export function DemoBadge({ className, children = "Demo" }: { className?: string; children?: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border border-demo/30 bg-demo-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-demo",
        className,
      )}
    >
      {children}
    </span>
  );
}



export { StatusBadge } from "./status-badge";

export function SectionHeading({
  eyebrow,
  title,
  action,
  id,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary-ink">{eyebrow}</p>}
        <h2 id={id} className="pv-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-surface px-6 py-12 text-center">
      {icon && <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export const CONDITION_LABEL = {
  new: "New",
  open_box: "Open box",
  refurbished: "Refurbished",
  used: "Used",
} as const;
