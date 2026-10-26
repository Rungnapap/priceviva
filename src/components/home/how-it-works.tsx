import Link from "next/link";
import { ChevronRight, Scale, Search, Store } from "../icons";
import type { TFunction } from "@/i18n";

const STEPS = [
  { icon: Search, title: "home.s1", text: "home.s1Text" },
  { icon: Scale, title: "home.s2", text: "home.s2Text" },
  { icon: Store, title: "home.s3", text: "home.s3Text" },
] as const;

/** Compact, horizontal three-step explainer. The detailed explanation stays on /about. */
export function HowItWorks({ t }: { t: TFunction }) {
  return (
    <section aria-labelledby="how-h" className="pa-container">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:items-center lg:gap-10">
        <div>
          <h2 id="how-h" className="pv-display text-2xl font-bold text-ink sm:text-[1.75rem]">{t("home.howTitle")}</h2>
          <p className="mt-1 text-muted">{t("home.howSub")}</p>
          <Link href="/about#pricing" className="mt-2 inline-block text-sm font-semibold text-primary-ink hover:underline">{t("home.howMore")} →</Link>
        </div>
        <ol className="grid gap-5 sm:grid-cols-3 sm:gap-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative flex items-start gap-3 sm:pr-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-lg font-bold text-primary-ink" aria-hidden="true">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="sr-only">{t("home.step", { n: i + 1 })}: </span>
                <s.icon className="mb-1 h-5 w-5 text-primary" aria-hidden="true" />
                <span className="block font-semibold text-ink">{t(s.title)}</span>
                <span className="mt-0.5 block text-sm text-muted">{t(s.text)}</span>
              </span>
              {i < STEPS.length - 1 && <ChevronRight className="absolute right-0 top-3 hidden h-5 w-5 text-muted sm:block" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
