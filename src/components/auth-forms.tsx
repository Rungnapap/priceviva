"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { fieldErrors, forgotSchema, loginSchema, PASSWORD_MIN, resetSchema, safeNext, signupSchema, type FieldErrors } from "@/lib/auth-rules";
import { authActions, postJson, useAuth, type SessionUser } from "@/lib/auth-client";
import { AccountsUnavailable, AuthCard, AuthLoading, errorText, Field, Notice, PasswordField, SubmitButton } from "./auth-ui";
import { Check, Mail } from "./icons";
import { useT } from "./i18n-provider";

const NOTICES: Record<string, { tone: "info" | "error" | "success"; key: "auth.notice.confirmed" | "auth.notice.linkExpired" | "auth.notice.linkInvalid" | "auth.notice.otherBrowser" | "auth.notice.signedOut" }> = {
  confirmed: { tone: "success", key: "auth.notice.confirmed" },
  link_expired: { tone: "error", key: "auth.notice.linkExpired" },
  link_invalid: { tone: "error", key: "auth.notice.linkInvalid" },
  other_browser: { tone: "info", key: "auth.notice.otherBrowser" },
  signed_out: { tone: "info", key: "auth.notice.signedOut" },
};

function QueryNotice({ notice }: { notice?: string }) {
  const t = useT();
  const n = notice ? NOTICES[notice] : undefined;
  return n ? <Notice tone={n.tone}>{t(n.key)}</Notice> : null;
}

/** Supabase's older e-mail links put tokens after "#": never leave them in the address bar or history. */
function useStripTokenFragment() {
  useEffect(() => {
    if (/access_token|refresh_token/.test(window.location.hash)) history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
}

function AlreadySignedIn({ user }: { user: SessionUser }) {
  const t = useT();
  return (
    <AuthCard title={t("auth.alreadyTitle")} lead={t("auth.alreadyLead", { email: user.email ?? "" })}>
      <div className="flex flex-wrap gap-2">
        <Link href="/account" className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">{t("auth.goToAccount")}</Link>
        <LogoutButton />
      </div>
    </AuthCard>
  );
}

export function LogoutButton({ className = "" }: { className?: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const ok = await authActions.logout();
          setBusy(false);
          if (!ok) return setFailed(true);
          router.push("/login?notice=signed_out");
        }}
        className={`inline-flex h-11 items-center gap-2 rounded-full border border-line px-5 text-sm font-semibold hover:bg-surface-2 disabled:opacity-60 ${className}`}
      >
        {busy ? t("auth.pleaseWait") : t("auth.logout")}
      </button>
      {failed && <span role="alert" className="text-xs text-error-ink">{t("auth.err.unavailable")}</span>}
    </span>
  );
}

// --- Log in ---------------------------------------------------------------------------------------------------
export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const t = useT();
  const router = useRouter();
  const auth = useAuth();
  useStripTokenFragment();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const target = safeNext(next);

  if (auth.status === "unconfigured") return <AccountsUnavailable />;
  if (auth.status === "signed_in" && auth.user && !busy) return <AlreadySignedIn user={auth.user} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const v = loginSchema.safeParse({ email, password });
    if (!v.success) return setErrors(fieldErrors(v.error));
    setErrors({});
    setBusy(true);
    const r = await postJson("/api/auth/login", { email: v.data.email, password, next: target });
    if (r.status === 200 && r.json.ok) {
      authActions.signedIn(r.json.user as SessionUser);
      router.push(String(r.json.next ?? target));
      return;
    }
    setBusy(false);
    setFormError(String(r.json.error ?? "unavailable"));
  };

  const resend = async () => {
    const r = await postJson("/api/auth/resend", { email: email.trim() });
    if (r.status === 200) setResent(true);
    else setFormError(String(r.json.error ?? "unavailable"));
  };

  return (
    <AuthCard
      title={t("auth.loginTitle")}
      lead={t("auth.loginLead")}
      footer={
        <>
          {t("auth.newHere")}{" "}
          <Link href={next ? `/signup?next=${encodeURIComponent(target)}` : "/signup"} className="font-semibold text-primary-ink hover:underline">{t("auth.createAccount")}</Link>
        </>
      }
    >
      <QueryNotice notice={notice} />
      {formError && (
        <Notice tone="error">
          {errorText(t, formError)}
          {formError === "email_not_confirmed" && (
            <span className="mt-2 block">
              {resent ? (
                <span className="inline-flex items-center gap-1 font-semibold"><Check className="h-4 w-4" aria-hidden="true" /> {t("auth.resent")}</span>
              ) : (
                <button type="button" onClick={resend} className="font-semibold underline">{t("auth.resend")}</button>
              )}
            </span>
          )}
        </Notice>
      )}
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label={t("auth.email")} name="email" type="email" value={email} onChange={setEmail} error={errors.email} autoComplete="email" autoFocus />
        <PasswordField label={t("auth.password")} name="password" value={password} onChange={setPassword} error={errors.password} autoComplete="current-password" />
        <div className="-mt-1 text-right text-sm">
          <Link href="/forgot-password" className="font-medium text-primary-ink hover:underline">{t("auth.forgotLink")}</Link>
        </div>
        <SubmitButton busy={busy}>{t("auth.loginButton")}</SubmitButton>
      </form>
      <p className="mt-4 text-xs text-muted">{t("auth.staySignedIn")}</p>
    </AuthCard>
  );
}

// --- Sign up --------------------------------------------------------------------------------------------------
export function SignupForm({ next }: { next?: string }) {
  const t = useT();
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  if (auth.status === "unconfigured") return <AccountsUnavailable />;
  if (auth.status === "signed_in" && auth.user && !busy) return <AlreadySignedIn user={auth.user} />;

  if (sentTo) {
    return (
      <AuthCard title={t("auth.checkEmailTitle")} lead={t("auth.checkEmailLead", { email: sentTo })}>
        <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-4 text-sm">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <ul className="list-disc space-y-1 pl-4 text-muted">
            <li>{t("auth.checkEmail1")}</li>
            <li>{t("auth.checkEmail2")}</li>
            <li>{t("auth.checkEmail3")}</li>
          </ul>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
          {resent ? (
            <span role="status" className="inline-flex items-center gap-1 font-semibold text-success-ink"><Check className="h-4 w-4" aria-hidden="true" /> {t("auth.resent")}</span>
          ) : (
            <button
              type="button"
              onClick={async () => {
                const r = await postJson("/api/auth/resend", { email: sentTo });
                if (r.status === 200) setResent(true);
                else setFormError(String(r.json.error ?? "unavailable"));
              }}
              className="font-semibold text-primary-ink underline"
            >
              {t("auth.resend")}
            </button>
          )}
          <Link href="/login" className="font-semibold text-primary-ink hover:underline">{t("auth.goToLogin")}</Link>
        </div>
        {formError && <p role="alert" className="mt-3 text-sm text-error-ink">{errorText(t, formError)}</p>}
      </AuthCard>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const v = signupSchema.safeParse({ email, password, confirm });
    if (!v.success) return setErrors(fieldErrors(v.error));
    setErrors({});
    setBusy(true);
    const r = await postJson("/api/auth/signup", { email: v.data.email, password, confirm });
    if (r.status === 200 && r.json.ok) {
      if (r.json.signedIn) {
        authActions.signedIn(r.json.user as SessionUser);
        router.push(next ? safeNext(next) : "/account?welcome=1");
        return;
      }
      setBusy(false);
      setSentTo(v.data.email);
      return;
    }
    setBusy(false);
    setFormError(String(r.json.error ?? "unavailable"));
  };

  return (
    <AuthCard
      title={t("auth.signupTitle")}
      lead={t("auth.signupLead")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(safeNext(next))}` : "/login"} className="font-semibold text-primary-ink hover:underline">{t("auth.loginButton")}</Link>
        </>
      }
    >
      {formError && <Notice tone="error">{errorText(t, formError)}</Notice>}
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label={t("auth.email")} name="email" type="email" value={email} onChange={setEmail} error={errors.email} autoComplete="email" autoFocus />
        <PasswordField label={t("auth.password")} name="new-password" value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" hint={t("auth.passwordRules", { n: PASSWORD_MIN })} />
        <PasswordField label={t("auth.confirmPassword")} name="confirm-password" value={confirm} onChange={setConfirm} error={errors.confirm} autoComplete="new-password" />
        <p className="text-xs text-muted">
          {t("auth.signupPrivacy")} <Link href="/privacy" className="underline">{t("auth.privacyLink")}</Link>
        </p>
        <SubmitButton busy={busy}>{t("auth.signupButton")}</SubmitButton>
      </form>
    </AuthCard>
  );
}

// --- Forgot password ------------------------------------------------------------------------------------------
export function ForgotForm({ notice }: { notice?: string }) {
  const t = useT();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (auth.status === "unconfigured") return <AccountsUnavailable />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const v = forgotSchema.safeParse({ email });
    if (!v.success) return setErrors(fieldErrors(v.error));
    setErrors({});
    setBusy(true);
    const r = await postJson("/api/auth/forgot", { email: v.data.email });
    setBusy(false);
    if (r.status === 200 && r.json.ok) setSentTo(v.data.email);
    else setFormError(String(r.json.error ?? "unavailable"));
  };

  return (
    <AuthCard
      title={t("auth.forgotTitle")}
      lead={sentTo ? undefined : t("auth.forgotLead")}
      footer={<Link href="/login" className="font-semibold text-primary-ink hover:underline">{t("auth.backToLogin")}</Link>}
    >
      {sentTo ? (
        <Notice tone="success">
          <p className="font-semibold">{t("auth.forgotSentTitle")}</p>
          <p className="mt-1">{t("auth.forgotSent", { email: sentTo })}</p>
        </Notice>
      ) : (
        <>
          <QueryNotice notice={notice} />
          {formError && <Notice tone="error">{errorText(t, formError)}</Notice>}
          <form onSubmit={submit} noValidate className="space-y-4">
            <Field label={t("auth.email")} name="email" type="email" value={email} onChange={setEmail} error={errors.email} autoComplete="email" autoFocus />
            <SubmitButton busy={busy}>{t("auth.forgotButton")}</SubmitButton>
          </form>
        </>
      )}
    </AuthCard>
  );
}

// --- Choose a new password (after the reset link) --------------------------------------------------------------
export function ResetForm() {
  const t = useT();
  const auth = useAuth();
  useStripTokenFragment();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (auth.status === "unconfigured") return <AccountsUnavailable />;
  if (auth.status === "loading") return <AuthLoading />;
  if (done) {
    return (
      <AuthCard title={t("auth.resetDoneTitle")} lead={t("auth.resetDoneLead")}>
        <Link href="/account" className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">{t("auth.goToAccount")}</Link>
      </AuthCard>
    );
  }
  if (auth.status !== "signed_in") {
    return (
      <AuthCard title={t("auth.resetTitle")} lead={t("auth.resetNoSession")}>
        <Link href="/forgot-password" className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">{t("auth.requestNewLink")}</Link>
      </AuthCard>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const v = resetSchema.safeParse({ password, confirm });
    if (!v.success) return setErrors(fieldErrors(v.error));
    setErrors({});
    setBusy(true);
    const r = await postJson("/api/auth/reset", { password, confirm });
    setBusy(false);
    if (r.status === 200 && r.json.ok) return setDone(true);
    if (r.status === 401) void authActions.refresh();
    setFormError(String(r.json.error ?? "unavailable"));
  };

  return (
    <AuthCard title={t("auth.resetTitle")} lead={t("auth.resetLead", { email: auth.user?.email ?? "" })}>
      {formError && <Notice tone="error">{errorText(t, formError)}</Notice>}
      <form onSubmit={submit} noValidate className="space-y-4">
        <PasswordField label={t("auth.newPassword")} name="new-password" value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" hint={t("auth.passwordRules", { n: PASSWORD_MIN })} autoFocus />
        <PasswordField label={t("auth.confirmPassword")} name="confirm-password" value={confirm} onChange={setConfirm} error={errors.confirm} autoComplete="new-password" />
        <SubmitButton busy={busy}>{t("auth.resetButton")}</SubmitButton>
      </form>
    </AuthCard>
  );
}
