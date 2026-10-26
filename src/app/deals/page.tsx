import type { Metadata } from "next";
import { LocalDealRadar } from "@/components/local-deals";
import { Radar } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { backdrops } from "@/data/site-backgrounds";
import { DemoBadge } from "@/components/ui";
import { catalogMode } from "@/lib/server/env";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Local Deal Radar" };

export default async function DealsPage() {
  const t = await getT();
  const demo = catalogMode() !== "live"; // demo and test mode both use the labelled fictional stores
  return (
    <div>
      <PageHeader title={t("radar.title")} crumb={t("nav.localDealRadar")} eyebrow={t("nav.localDealRadar")} icon={<Radar className="h-6 w-6" />} tone="radar" backdrop={backdrops.localV7}>
        <p>{t("radar.lead")}</p>
        {demo && (
          <p className="mt-2 text-sm text-muted">
            <DemoBadge className="mr-1.5 align-middle">{t("card.demo")}</DemoBadge>
            {t("radar.demoModeNote")}
          </p>
        )}
      </PageHeader>
      <div className="pa-container py-8">
        <LocalDealRadar />
      </div>
    </div>
  );
}
