import type { Metadata } from "next";
import Link from "next/link";
import { retailers as demoRetailers } from "@/data/catalog";
import { getRepository } from "@/lib/catalog/repository";
import { COUNTRY_NAME } from "@/lib/tax";
import type { CountryCode } from "@/lib/types";
import { ShieldCheck, Store } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { backdrops } from "@/data/site-backgrounds";
import { DemoBadge, EmptyState } from "@/components/ui";
import { EnglishOnlyNote } from "@/components/t";

export const metadata: Metadata = { title: "Stores & data sources" };
export const revalidate = 300;

/**
 * "Store transparency": which stores appear on PriceViva and where their data comes from.
 * Deliberately no "trusted retailer" badges — we have no evidence base for rating stores yet.
 */
export default async function StoresPage() {
  const repo = getRepository();
  const meta = await repo.meta();
  const live = meta.mode === "live";
  const sample = meta.mode === "sample";
  return (
    <div>
      <PageHeader title="Stores & data sources" eyebrow="Store transparency" icon={<ShieldCheck className="h-6 w-6" />} backdrop={backdrops.calm}>
        Every price on PriceViva comes from a named source. Here is where each store’s data comes from and what we can and cannot vouch for.
      </PageHeader>
      <EnglishOnlyNote />
      <div className="pa-container space-y-8 py-10">
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6 text-sm text-muted shadow-card">
          <h2 className="pv-display mb-2 text-xl font-bold text-ink">Current data source</h2>
          {live ? (
            <p>Products and offers come from retailers’ product feeds supplied through the Awin affiliate network. We show the price, delivery and stock the retailer states, and mark any cost we cannot confirm.</p>
          ) : sample ? (
            <p>
              <strong className="text-ink">Test mode.</strong> Product names, photos and descriptions come from the free DummyJSON sample API (placeholder
              data). The shop offers come from <code>data/sample-offers.csv</code> and are demonstration data — every sample shop is labelled “Sample”.
            </p>
          ) : (
            <p><strong className="text-ink">Demo mode.</strong> Every store, product and price below is fictional and exists only to demonstrate the site.</p>
          )}
          <p className="mt-3">
            We do not rate stores as “trusted”: we don’t yet have independent evidence (such as verified reviews or complaint data) to support such a
            label. Check each store’s returns policy and contact details before you buy.
          </p>
        </section>

        <section aria-labelledby="list-h">
          <h2 id="list-h" className="pv-display mb-4 text-xl font-bold">{live ? "Connected stores" : sample ? "Sample stores" : "Demo stores"}</h2>
          {meta.retailers.length === 0 ? (
            <EmptyState title="No stores connected yet" icon={<Store className="h-6 w-6" />}>
              Stores appear here once a retailer feed has been imported.
            </EmptyState>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {meta.retailers.map((r) => {
                const demo = live ? undefined : demoRetailers.find((x) => x.id === r.id);
                const country = r.country && r.country in COUNTRY_NAME ? COUNTRY_NAME[r.country as CountryCode] : r.country;
                return (
                  <li key={r.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{r.name}</p>
                        <p className="text-sm text-muted">{country ?? "Country not stated"}</p>
                      </div>
                      {!live && <DemoBadge>{sample ? "Sample" : "Fictional"}</DemoBadge>}
                    </div>
                    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                      <dt className="text-muted">Data source</dt>
                      <dd>{live ? "Awin product feed" : sample ? "Sample offers CSV" : "Built-in demo catalogue"}</dd>
                      <dt className="text-muted">Physical stores</dt>
                      <dd>{demo ? (demo.hasPhysicalStores ? "Yes (demo locations)" : "Online only") : "Not stated"}</dd>
                      <dt className="text-muted">Returns</dt>
                      <dd>{demo?.returnsPolicy ?? "Not available — check on the store’s website"}</dd>
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <p className="text-sm text-muted">
          Questions about how prices are calculated? <Link href="/about#pricing" className="font-semibold text-primary-ink hover:underline">Read how prices work</Link>.
        </p>
      </div>
    </div>
  );
}
