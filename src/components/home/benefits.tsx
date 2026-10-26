import { ClipboardCheck, Globe, Scale, Truck } from "../icons";
import type { TFunction } from "@/i18n";

/** Four short promises under the hero. Factual only: no prices, ratings, savings or offer counts. */
const ITEMS = [
  { icon: Scale, title: "home.b1", text: "home.b1Text" },
  { icon: Truck, title: "home.b2", text: "home.b2Text" },
  { icon: Globe, title: "home.b4", text: "home.b4Text" },
  { icon: ClipboardCheck, title: "home.b3", text: "home.b3Text" },
] as const;

export function Benefits({ t }: { t: TFunction }) {
  return (
    <section aria-label={t("home.benefitsLabel")} className="pa-container">
      <ul className="grid grid-cols-1 gap-4 rounded-[var(--radius-card)] bg-primary-soft/60 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-primary/15 lg:px-2">
        {ITEMS.map((b) => (
          <li key={b.title} className="flex items-start gap-3 lg:px-5">
            <b.icon className="mt-0.5 h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-semibold text-ink">{t(b.title)}</span>
              <span className="mt-0.5 block text-sm text-muted">{t(b.text)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
