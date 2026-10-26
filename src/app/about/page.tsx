import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getRepository } from "@/lib/catalog/repository";
import { STALE_AFTER_DAYS } from "@/lib/pricing";
import { StatusBadge } from "@/components/ui";
import { EnglishOnlyNote } from "@/components/t";

export const metadata: Metadata = { title: "How PriceViva works" };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-40 border-t border-line pt-8">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink/90">{children}</div>
    </section>
  );
}

export const revalidate = 300;

export default async function AboutPage() {
  const repo = getRepository();
  const meta = await repo.meta().catch(() => null);
  const live = repo.mode === "live";
  const sample = repo.mode === "sample";
  const fx = meta?.fx;
  return (
    <div className="pa-container max-w-3xl space-y-10 py-10">
      <EnglishOnlyNote />
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">How PriceViva works</h1>
        <p className="mt-2 text-muted">Plain-English answers about where our data comes from, our prices and your data.</p>
        <nav aria-label="On this page" className="mt-4 flex flex-wrap gap-2 text-sm">
          {[["#demo", live ? "Where data comes from" : sample ? "Test mode" : "Demo data"], ["#status", "What works today"], ["#pricing", "Delivered totals"], ["#disclosure", "Disclosures"], ["#privacy", "Privacy & location"]].map(([h, l]) => (
            <Link key={h} href={`/about${h}`} className="rounded-full border border-line bg-surface px-3 py-1 hover:border-primary">{l}</Link>
          ))}
        </nav>
      </div>

      {live ? (
        <Section id="demo" title="Where our product data comes from">
          <p>
            Products, prices, stock, delivery costs and photos come from retailers’ own product feeds, which they publish through the Awin affiliate network for
            partners like us. We import them on a schedule (typically daily) and show when each offer was last confirmed.
          </p>
          <p>
            We only group listings from different retailers when they are provably the same item: the same barcode (GTIN/EAN) and condition, or the same brand,
            model number, colour and size. Different sizes, colours and conditions are never merged. Photos are shown from the retailer’s image host as supplied
            in its feed.
          </p>
          <p>Prices can change between imports. The retailer’s checkout is always the final price.</p>
        </Section>
      ) : sample ? (
        <Section id="demo" title="Test mode: sample products and demonstration offers">
          <p>
            Products, descriptions, categories and photos come automatically from <strong>DummyJSON</strong>, a free public API of placeholder data made
            for development and testing. Some sample products use real brand names; they are not products we sell or verify.
          </p>
          <p>
            The retailer offers (“Sample Shop …”) come from a local CSV file used to test the price-comparison engine. Their prices, delivery costs and
            availability are <strong>demonstration data</strong>, not real shopping offers, and they have no store links. The API’s generated ratings,
            reviews and discount percentages are deliberately not shown.
          </p>
          <p>Test mode is for local testing. Before any public launch, switch to authorised retailer feeds (Awin) — the sample images carry no usage rights.</p>
        </Section>
      ) : (
        <Section id="demo" title="Demo mode: fictional data">
          <p>
            Every product, brand, retailer, store, price, discount, stock level and promotion you see is invented to test the
            experience. Product pictures are drawn illustrations, not photographs. Barcodes use a restricted number range so they
            can never match real products. Nothing links to a real shop.
          </p>
          <p>Real data appears only when live mode is switched on with approved retailer feeds — labelled with its source and the time it was last checked.</p>
        </Section>
      )}

      <Section id="status" title="What works today">
        <p>Every feature on PriceViva is in one of three states. Nothing is shown as working when it is not.</p>
        <h3 className="pt-2 font-semibold text-ink">Working</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Search with typo tolerance, filters (category, brand, condition, price range) and sorting by delivered total.</li>
          <li>Comparing one product across shops (delivered totals, costs breakdown, currency conversion) and comparing up to three products side by side.</li>
          <li>Choosing any town, municipality or postcode as your shopping area, with a radius from 5 to 100 km.</li>
          <li>Favourites, the comparison list and price-drop alerts — stored in this browser only.</li>
          <li>Photo search (look-alike matching on your device) and exact barcode lookup.</li>
          <li>English and Swedish interface; German and Thai as beta translations. Ten display currencies.</li>
        </ul>
        <h3 className="pt-2 font-semibold text-ink">{live ? "Depends on the data retailers supply" : "Demonstration data only"}</h3>
        <ul className="list-disc space-y-1 pl-5">
          {live ? (
            <>
              <li>Store offers on Local Deal Radar appear only for merchants that have supplied their store locations.</li>
              <li>Price history grows with each feed import; new products start with no history.</li>
            </>
          ) : (
            <>
              <li>{sample ? "Products come from the DummyJSON test API; every shop offer, price, delivery cost and stock level is demonstration data." : "Every product, shop, price and promotion is fictional."}</li>
              <li>Demonstration stores on Local Deal Radar are fictional and kept in a separate, labelled section.</li>
              <li>Price history only shows prices recorded from the demonstration data.</li>
            </>
          )}
        </ul>
        <h3 className="pt-2 font-semibold text-ink">Not available yet</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Accounts and sign-in, and syncing favourites or alerts between devices. You can export and import them on the <Link href="/account" className="text-primary-ink underline">Account</Link> page.</li>
          <li>Email or push notifications for price alerts, and checking alerts while PriceViva is closed.</li>
          {!live && <li>Real retailer offers and real store locations. They need approved retailer feeds.</li>}
        </ul>
      </Section>

      <Section id="pricing" title="What a “delivered total” means">
        <p>We try to show what an item will cost you <em>delivered to your chosen country</em>: item price + shipping + import duty/VAT/handling. Each part is marked:</p>
        <ul className="space-y-2">
          <li className="flex flex-wrap items-center gap-2"><StatusBadge status="verified_total" /> every cost is known from the seller.</li>
          <li className="flex flex-wrap items-center gap-2"><StatusBadge status="estimated_total" /> at least one cost is our labelled estimate.</li>
          <li className="flex flex-wrap items-center gap-2"><StatusBadge status="partial_total" /> some costs are unknown — shown as “+ unknown”, never as zero.</li>
          <li className="flex flex-wrap items-center gap-2"><StatusBadge status="item_price_only" /> no delivery costs are known.</li>
          <li className="flex flex-wrap items-center gap-2"><StatusBadge status="unavailable" /> doesn’t deliver to you, or out of stock.</li>
        </ul>
        <p>Only complete totals can be called “cheapest”. If a seller removes its own VAT for export, we subtract it once so VAT is never counted twice. Prices not refreshed for more than {STALE_AFTER_DAYS} days are marked stale and are not shown as the current best.</p>
        <p>Currency conversion uses {fx?.label ?? "reference rates"}{fx ? ` dated ${fx.asOf}` : ""}. The original price and currency are always shown in the offer details. Your card or bank will use its own rate and may charge fees.</p>
      </Section>

      <Section id="disclosure" title="Disclosures & ranking">
        {live ? (
          <p>
            PriceViva is a comparison service, not a shop. “Visit store” buttons are <strong>affiliate links</strong>: if you buy, the retailer may pay us a
            commission through Awin, at no extra cost to you. Commission never affects which offer is ranked cheapest, and every offer is listed — not only
            retailers that pay. There are no sponsored placements.
          </p>
        ) : (
          <p>PriceViva is a comparison service, not a shop. In demo and test mode there are no affiliate links, no sponsored placements and no paid rankings. When those arrive, sponsored results will be clearly labelled and affiliate relationships disclosed — and payment will never change the organic ranking.</p>
        )}
        <p>
          A discount is shown only with an evidence-backed reference price{live ? " — the lowest price we observed at that retailer in the previous 30 days. Retailer “RRP” or “was” prices are shown as information only" : ""}. We don’t use
          countdown timers or “only 2 left” pressure messages.
        </p>
      </Section>

      <Section id="privacy" title="Privacy, shopping area and delivery country">
        <p>Three separate settings, never mixed up:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Shopping area</strong> — the city and radius for local deals. You can save a default or browse somewhere temporarily without changing it.</li>
          <li><strong>Delivery destination</strong> — the country items are shipped to, which drives the delivered total.</li>
          <li><strong>Device location</strong> — only requested when you press “Use my location”. It is rounded to about 1 km, used once to look up the town name, and shown as a suggestion you confirm. It is never swapped for another city and the coordinates are not stored by us.</li>
        </ul>
        <p>Today your preferences live only in your browser (local storage). You can export or delete them on the <Link href="/account" className="text-primary-ink underline">Account</Link> page. No analytics or tracking cookies are used. When you click “Visit store” we count the click (which offer, when) without storing your IP address or identity; the retailer and Awin then apply their own privacy policies. Full details: <Link href="/privacy" className="text-primary-ink underline">Privacy policy</Link>.</p>
      </Section>
    </div>
  );
}
