import type { Metadata } from "next";
import Link from "next/link";
import { getRepository } from "@/lib/catalog/repository";
import { History } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { ProductCard } from "@/components/product-card";
import { EmptyState, SectionHeading } from "@/components/ui";
import { backdrops } from "@/data/site-backgrounds";
import { EnglishOnlyNote } from "@/components/t";

export const metadata: Metadata = { title: "Price history" };
export const dynamic = "force-dynamic";

/** Price history works from recorded observations only; this page explains the rules and lists what can be charted. */
export default async function PriceHistoryPage() {
  const repo = getRepository();
  const mode = repo.mode;
  const listed = await repo.productsWithHistory(24).catch(() => []);
  return (
    <div>
      <PageHeader title="Price history" icon={<History className="h-6 w-6" />} backdrop={backdrops.calm}>
        See how a shop’s price for a product has moved over time, so you can tell a genuine drop from a normal price. Every point on a chart is a price we
        actually recorded, with its date and source.
      </PageHeader>
      <EnglishOnlyNote />
      <div className="pa-container space-y-10 py-10">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { t: "Only real observations", d: "Nothing is back-filled or estimated. Too little data shows a message instead of a line." },
            { t: "Item price, not delivered total", d: "Charts show the shop’s item price; shipping where the source stated it. Import charges at the time were not recorded." },
            {
              t: "Where it comes from",
              d:
                mode === "live"
                  ? "Recorded on every retailer feed import (Awin)."
                  : mode === "sample"
                  ? "Test mode: the demonstration shop prices from data/sample-offers.csv, recorded each time the sample data refreshes."
                  : "Demo mode has no recorded history (the catalogue is fictional).",
            },
          ].map((x) => (
            <div key={x.t} className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
              <p className="font-semibold text-ink">{x.t}</p>
              <p className="mt-1 text-sm text-muted">{x.d}</p>
            </div>
          ))}
        </div>

        <section aria-labelledby="hp-h">
          <SectionHeading id="hp-h" title={mode === "sample" ? "Products with recorded history (demonstration offers)" : "Products with recorded history"} />
          {listed === null ? (
            <p className="text-sm text-muted">Open any product page to see its recorded price history.</p>
          ) : listed.length === 0 ? (
            <EmptyState title="No product has enough history yet" icon={<History className="h-6 w-6" />}>
              {mode === "sample"
                ? "A chart needs the same shop to be recorded at least twice, an hour or more apart. Prices are recorded each time the sample data refreshes (every 6 hours, or Admin → Refresh). Tip: change a price in data/sample-offers.csv and refresh to see a real change."
                : mode === "demo"
                ? "The fictional demo catalogue has no history, and we don’t invent one."
                : "History builds up with each feed import."}{" "}
              <Link href="/search" className="font-semibold text-primary-ink underline">Browse products</Link>
            </EmptyState>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {listed.map((p) => (
                <li key={p.id} className="flex">
                  <ProductCard product={p} className="w-full" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
