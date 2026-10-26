import type { ReactNode } from "react";

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <p role="status" className={`mb-6 rounded-xl border px-4 py-3 text-sm ${err ? "border-error/30 bg-error-soft text-error-ink" : "border-success/30 bg-success-soft text-success-ink"}`}>
      {err ?? ok}
    </p>
  );
}

export function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Pill({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: ReactNode }) {
  const cls = { ok: "bg-success-soft text-success-ink", warn: "bg-warning-soft text-warning-ink", bad: "bg-error-soft text-error-ink", muted: "bg-surface-2 text-muted" }[tone];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function statusTone(s: string | null | undefined): "ok" | "warn" | "bad" | "muted" {
  if (s === "succeeded") return "ok";
  if (s === "partial" || s === "running" || s === "skipped") return "warn";
  if (s === "failed") return "bad";
  return "muted";
}

const dt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const when = (iso: string | null | undefined) => (iso ? dt.format(new Date(iso)) : "—");

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
