/**
 * Sample retailer-offer importer (FREE TEST MODE).
 * Reads a local CSV of DEMONSTRATION offers and attaches them to DummyJSON sample products so the
 * comparison engine (delivered totals, unknown costs, ranking, currency conversion) can be tested.
 *
 * The retailers and prices in the CSV are fictional. They never get outbound links.
 *
 * Columns:
 *   dummyjson_id      DummyJSON product id the offer belongs to
 *   retailer          Sample retailer name (must contain the word "Sample")
 *   retailer_country  SE | DE | GB   (where the sample retailer ships from)
 *   price             e.g. 109.00
 *   currency          SEK | EUR | GBP | USD
 *   vat_included      yes | no
 *   ship_SE, ship_DE, ship_GB   delivery cost to that country: number = known, blank = unknown, x = does not deliver
 *   import_SE, import_DE, import_GB   import charges estimate for cross-border outside the EU: number = estimate, blank = unknown
 *   delivery_days     e.g. 2-4 (optional)
 */
import { csvObjects } from "@/lib/importers/csv";
import { parsePriceMinor } from "@/lib/importers/normalize";
import { EU_MEMBER } from "@/lib/tax";
import { SUPPORTED_COUNTRIES, type CatalogOffer, type CostComponent, type CountryCode, type CurrencyCode, type DestinationTerms } from "@/lib/types";

export interface SampleOfferRowIssue {
  row: number;
  code: string;
  message: string;
}

export interface SampleOfferImport {
  rows: number;
  imported: number;
  offersByProduct: Map<string, CatalogOffer[]>;
  retailers: { id: string; name: string; country: CountryCode }[];
  issues: SampleOfferRowIssue[];
}

const CURRENCIES: CurrencyCode[] = ["SEK", "EUR", "GBP", "USD"];
const NOTE = "Sample CSV value — demonstration data, not a real retailer quote.";

function cost(raw: string | undefined, basis: "verified" | "estimated", note: string): CostComponent | "none" | "invalid" {
  const v = (raw ?? "").trim();
  if (v === "") return { amountMinor: null, basis: "unknown", note: "Not given in the sample CSV." };
  if (v.toLowerCase() === "x") return "none";
  const p = parsePriceMinor(v);
  if (!p) return "invalid";
  return { amountMinor: p.minor, basis, note };
}

export async function importSampleOffers(text: string, knownProductIds: Set<string>, observedAt: string): Promise<SampleOfferImport> {
  const offersByProduct = new Map<string, CatalogOffer[]>();
  const retailers = new Map<string, { id: string; name: string; country: CountryCode }>();
  const issues: SampleOfferRowIssue[] = [];
  let rows = 0;
  let imported = 0;
  const seen = new Set<string>();

  for await (const { row, values } of csvObjects([text])) {
    rows++;
    const fail = (code: string, message: string) => issues.push({ row, code, message });
    const pid = `dj-${(values.dummyjson_id ?? "").trim()}`;
    if (!/^dj-\d+$/.test(pid)) { fail("invalid_product_ref", "dummyjson_id must be a number."); continue; }
    if (!knownProductIds.has(pid)) { fail("unknown_product", `DummyJSON product ${pid.slice(3)} is not in the fetched catalogue.`); continue; }
    const name = (values.retailer ?? "").trim();
    if (!/sample/i.test(name)) { fail("unlabelled_retailer", "Retailer name must contain “Sample” so it can never be mistaken for a real shop."); continue; }
    const country = (values.retailer_country ?? "").trim().toUpperCase() as CountryCode;
    if (!SUPPORTED_COUNTRIES.includes(country)) { fail("invalid_country", `retailer_country must be one of ${SUPPORTED_COUNTRIES.join(", ")}.`); continue; }
    const currency = (values.currency ?? "").trim().toUpperCase() as CurrencyCode;
    if (!CURRENCIES.includes(currency)) { fail("invalid_currency", `Currency must be one of ${CURRENCIES.join(", ")}.`); continue; }
    const price = parsePriceMinor(values.price);
    if (!price || price.minor <= 0) { fail("invalid_price", `Price "${values.price ?? ""}" is not a valid amount.`); continue; }
    const key = `${pid}|${name.toLowerCase()}`;
    if (seen.has(key)) { fail("duplicate_offer", "This retailer already has an offer for this product."); continue; }

    const destinations: Partial<Record<CountryCode, DestinationTerms>> = {};
    let bad = false;
    for (const dest of SUPPORTED_COUNTRIES) {
      const ship = cost(values[`ship_${dest}`], "verified", NOTE);
      if (ship === "none") continue;
      if (ship === "invalid") { fail("invalid_shipping", `ship_${dest} "${values[`ship_${dest}`]}" is not a number, blank or x.`); bad = true; break; }
      let importCharges: CostComponent;
      if (dest === country) importCharges = { amountMinor: 0, basis: "verified", note: "Domestic delivery — no import charges." };
      else if (EU_MEMBER[dest] && EU_MEMBER[country]) importCharges = { amountMinor: 0, basis: "verified", note: "Within the EU customs union — no import duty or import VAT." };
      else {
        const imp = cost(values[`import_${dest}`], "estimated", "Sample estimate of import VAT/duty — demonstration only.");
        if (imp === "invalid" || imp === "none") { fail("invalid_import", `import_${dest} must be a number or blank.`); bad = true; break; }
        importCharges = imp;
      }
      const dd = (values.delivery_days ?? "").match(/^(\d+)\s*-\s*(\d+)$/);
      destinations[dest] = { shipping: ship, importCharges, ...(dd ? { deliveryDays: [Number(dd[1]), Number(dd[2])] as [number, number] } : {}) };
    }
    if (bad) continue;
    if (Object.keys(destinations).length === 0) { fail("no_destinations", "Offer delivers nowhere (all ship_ columns are x)."); continue; }

    seen.add(key);
    const retailerId = `sample-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
    retailers.set(retailerId, { id: retailerId, name, country });
    const vat = (values.vat_included ?? "").trim().toLowerCase();
    const offer: CatalogOffer = {
      id: `${pid}-${retailerId}`,
      productId: pid,
      retailerId,
      retailer: { id: retailerId, name, country },
      price: { minor: price.minor, currency },
      vatIncluded: vat === "yes" || vat === "true" || vat === "1",
      shipFrom: country,
      stock: "unknown", // never claim availability for sample data
      destinations,
      observedDaysAgo: 0,
      observedAt,
      sourceUpdatedAt: null,
      sourceUrl: null, // no real retailer URLs are ever invented
      source: "sample",
      clickable: false,
    };
    offersByProduct.set(pid, [...(offersByProduct.get(pid) ?? []), offer]);
    imported++;
  }
  return { rows, imported, offersByProduct, retailers: [...retailers.values()], issues };
}
