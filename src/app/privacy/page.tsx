import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { EnglishOnlyNote } from "@/components/t";
import { backdrops } from "@/data/site-backgrounds";

export const metadata: Metadata = { title: "Privacy policy" };

/**
 * Plain-language description of what this version of the site actually does with data.
 * It describes the software's behaviour; it has not been reviewed by a lawyer and names no company details
 * (those must be added by the site owner before public launch).
 */
export default function PrivacyPage() {
  const h2 = "pv-display mt-10 text-xl font-bold text-ink";
  return (
    <div>
      <PageHeader title="Privacy policy" eyebrow="Plain-language summary" icon={<ShieldCheck className="h-6 w-6" />} backdrop={backdrops.calm}>
        What PriceViva stores, what it sends to other services, and how you can delete it.
      </PageHeader>
      <EnglishOnlyNote />
      <div className="pa-container max-w-3xl py-10 text-[15px] leading-relaxed text-ink/90">
        <p className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-ink">
          This page describes how the website software behaves today. It is not yet a legal document: the operator’s name, contact details and legal basis
          must be added and reviewed before PriceViva is opened to the public.
        </p>

        <h2 className={h2}>No account, no tracking</h2>
        <p className="mt-2">You can use PriceViva without an account. There are no analytics, advertising or tracking cookies.</p>

        <h2 className={h2}>Stored only in your browser</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your saved shopping area and radius, delivery country, display currency and colour theme.</li>
          <li>Favourites, the comparison list, price alerts and their notifications.</li>
          <li>A temporary shopping area, kept only for the current browser tab.</li>
          <li>One cookie, <code>pv_locale</code>, that remembers the interface language for a year.</li>
        </ul>
        <p className="mt-2">
          Nothing in this list is sent to PriceViva’s servers. You can export it or delete it at any time on the{" "}
          <Link href="/account" className="text-primary-ink underline">Account</Link> page.
        </p>

        <h2 className={h2}>Location</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your device location is only requested when you press “Use my location”, and your browser asks for permission first.</li>
          <li>The position is rounded to about 1 km before it leaves your device, and only that rounded position is used to look up the town name.</li>
          <li>When you type a town or postcode, only the text you typed is looked up.</li>
          <li>Both lookups go through PriceViva’s server to OpenStreetMap Nominatim; your IP address and cookies are not passed on. Results are cached for 24 hours.</li>
        </ul>

        <h2 className={h2}>Photo and barcode search</h2>
        <p className="mt-2">
          Photos you choose for photo search are analysed inside your browser and are never uploaded. To compare them, your browser downloads the catalogue’s
          product photos through PriceViva’s image proxy. Barcode numbers you type are sent to PriceViva’s server to find the matching product.
        </p>

        <h2 className={h2}>Leaving PriceViva for a shop</h2>
        <p className="mt-2">
          When you click “Visit store”, PriceViva records which offer was clicked and when — not your IP address or identity — and then sends you to the retailer.
          Retailer links may be affiliate links. From then on the retailer’s and the affiliate network’s own privacy policies apply.
        </p>

        <h2 className={h2}>Map</h2>
        <p className="mt-2">Map images on Local Deal Radar are loaded from OpenStreetMap’s tile servers, which receive your IP address as with any web request.</p>

        <h2 className={h2}>Accounts and email</h2>
        <p className="mt-2">Sign-in and email alerts are not available yet. This page will be updated before they are switched on.</p>
      </div>
    </div>
  );
}
