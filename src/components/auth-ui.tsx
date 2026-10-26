"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { en } from "@/i18n/messages/en";
import type { MessageKey, TFunction } from "@/i18n";
import { Eye, EyeOff, Lock } from "./icons";
import { useT } from "./i18n-provider";

/** Text for an error code or message key from the server or the form rules; unknown codes get a generic message. */
export function errorText(t: TFunction, code: unknown): string {
  const key = typeof code === "string" ? (code.startsWith("auth.") ? code : `auth.err.${code}`) : "auth.err.unavailable";
  return t((key in en ? key : "auth.err.unavailable") as MessageKey);
}

/** Centered card used by the log in, sign up and password pages. */
export function AuthCard({ title, lead, children, footer }: { title: string; lead?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="pa-container flex justify-center py-10 sm:py-14">
      <div className="w-full max-w-md">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-card sm:p-8">
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary" aria-hidden="true">
            <Lock className="h-5 w-5" />
          </span>
          <h1 className="pv-display text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
          {lead && <div className="mt-1.5 text-sm text-muted">{lead}</div>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border bg-surface px-3 text-base text-ink placeholder:text-muted focus:outline-none focus:ring-4 sm:text-sm aria-[invalid=true]:border-error aria-[invalid=true]:focus:ring-error/15 border-line focus:border-primary focus:ring-primary/15";

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  hint?: ReactNode;
  autoFocus?: boolean;
}

export function Field({ label, name, type = "text", value, onChange, error, autoComplete, hint, autoFocus }: FieldProps) {
  const id = useId();
  const t = useT();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={inputClass}
        spellCheck={false}
        autoCapitalize="none"
      />
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs font-medium text-error-ink">{errorText(t, error)}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function PasswordField(props: Omit<FieldProps, "type">) {
  const [show, setShow] = useState(false);
  const id = useId();
  const t = useT();
  const { label, name, value, onChange, error, autoComplete, hint, autoFocus } = props;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={`${inputClass} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
          aria-pressed={show}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs font-medium text-error-ink">{errorText(t, error)}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy || undefined}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-wait disabled:opacity-70"
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
      {busy ? t("auth.pleaseWait") : children}
    </button>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const cls = tone === "error" ? "border-error/30 bg-error-soft text-error-ink" : tone === "success" ? "border-success/30 bg-success-soft text-success-ink" : "border-primary/20 bg-primary-soft text-primary-ink";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`mb-4 rounded-xl border px-3.5 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}

/** Shown when Supabase isn't configured: the rest of the site keeps working without accounts. */
export function AccountsUnavailable() {
  const t = useT();
  return (
    <AuthCard title={t("auth.unconfiguredTitle")} lead={t("auth.unconfiguredLead")}>
      <Link href="/" className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold hover:bg-surface-2">{t("auth.backHome")}</Link>
    </AuthCard>
  );
}

export function AuthLoading() {
  const t = useT();
  return (
    <div className="pa-container flex justify-center py-14">
      <div className="h-80 w-full max-w-md animate-pulse rounded-[var(--radius-card)] bg-surface-2" aria-label={t("common.loading")} />
    </div>
  );
}
