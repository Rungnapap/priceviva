import type { Metadata } from "next";
import { AlertsManager } from "@/components/alerts";
import { BellRing } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { backdrops } from "@/data/site-backgrounds";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Price drop alerts" };

export default async function AlertsPage() {
  const t = await getT();
  return (
    <div>
      <PageHeader title={t("alerts.title")} icon={<BellRing className="h-6 w-6" />} tone="gold" backdrop={backdrops.calm}>
        {t("alerts.lead")}
      </PageHeader>
      <div className="pa-container space-y-8 py-10">
        <AlertsManager />
        <section aria-labelledby="how-alerts-h" className="rounded-[var(--radius-card)] border border-line bg-surface p-5 text-sm text-muted shadow-card">
          <h2 id="how-alerts-h" className="font-semibold text-ink">{t("alerts.howTitle")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t("alerts.how1")}</li>
            <li>{t("alerts.how2")}</li>
            <li>{t("alerts.how3")}</li>
            <li>{t("alerts.how5")}</li>
            <li>
              <strong className="text-ink">{t("alerts.notYet")}</strong> {t("alerts.how4")}
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
