"use client";

import type { MessageKey, Vars } from "@/i18n";
import { useLocale, useT } from "./i18n-provider";

/** Translated text for use inside server components (renders on the client tree with the chosen language). */
export function T({ k, vars }: { k: MessageKey; vars?: Vars }) {
  return <>{useT()(k, vars)}</>;
}

/** Shown on information pages that have not been translated yet, so no language is over-claimed. */
export function EnglishOnlyNote() {
  const locale = useLocale();
  const t = useT();
  if (locale === "en") return null;
  return (
    <p lang={locale} className="pa-container mt-4 rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-muted">
      {t("prefs.englishOnlyPage")}
    </p>
  );
}
