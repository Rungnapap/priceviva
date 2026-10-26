"use client";

import Link from "next/link";
import { useState } from "react";
import { postJson } from "@/lib/auth-client";
import { AuthCard, errorText, Notice } from "./auth-ui";
import { useT } from "./i18n-provider";

/** One click to stop e-mails for one alert. A button (not the link itself), so mail scanners can't trigger it. */
export function UnsubscribeForm({ token }: { token: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  return (
    <AuthCard title={t("unsub.title")} lead={t("unsub.lead")}>
      {state === "done" ? (
        <Notice tone="success">{t("unsub.done")}</Notice>
      ) : (
        <>
          {state !== "idle" && state !== "busy" && <Notice tone="error">{errorText(t, state)}</Notice>}
          <button
            type="button"
            disabled={!token || state === "busy"}
            onClick={async () => {
              setState("busy");
              const r = await postJson("/api/alerts/unsubscribe", { token });
              setState(r.status === 200 && r.json.ok ? "done" : String(r.json.error ?? "unavailable"));
            }}
            className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {t("unsub.button")}
          </button>
        </>
      )}
      <p className="mt-4 text-sm text-muted">
        {t("unsub.manage")} <Link href="/alerts" className="font-semibold text-primary-ink underline">{t("nav.priceAlerts")}</Link>
      </p>
    </AuthCard>
  );
}
