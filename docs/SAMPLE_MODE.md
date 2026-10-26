# Free test mode (DummyJSON) — how it works

Test mode lets you run PriceViva with **automatically imported sample products** before you have an Awin account. It is the **default** when no `CATALOG_SOURCE` is set.

| Part | Where it comes from | Shown as |
|---|---|---|
| Products, descriptions, categories, photos | Public **DummyJSON** API: `https://dummyjson.com/products?limit=0` (≈194 products), fetched automatically and refreshed every 6 h | "Sample data" / "Sample product · DummyJSON test data" |
| One "sample list price" per product | DummyJSON `price` (the API states no currency; shown as **USD**) | Information only. Delivery costs unknown, so it is never used as a cheapest total |
| Sample retailer offers | Local file `data/sample-offers.csv` (fictional "Sample Shop …" retailers) | "Demonstration data · no store link"; complete totals say "Complete (demo data)", never "Verified" |
| Exchange rates | ECB daily reference rates when reachable; otherwise labelled demo rates | Source and date shown in the offer details |
| Local Deal Radar | The built-in fictional demo stores, labelled "(demo)" | Unchanged |
| Homepage, category and promo photos | Free Unsplash photos in `public/images/site/` (temporary) | See `docs/REPLACE_IMAGES.md` |

## Honesty rules built in
- DummyJSON's `rating`, `reviews` and `discountPercentage` are **generated**, so they are never shown. No discounts appear in test mode.
- DummyJSON barcodes are random, so they are shown as "sample, not a real GTIN" and never used for matching.
- `availabilityStatus` is shown only as "Stock status (sample, unverified)". Offers always have stock "not stated".
- Sample retailers **must** have "Sample" in their name; the importer rejects any row without it. They never get outbound links, and no real retailer URLs are invented.

## Usage terms and image rights (checked 24 Oct 2026)
- DummyJSON describes itself as placeholder data "for development, testing, and prototyping". Its code is MIT-licensed.
- It publishes **no licence for its product images**, and some sample products use real brand names.
- So test mode is fine for local testing and private demos. **Do not use it for a public launch.** Before going public, switch to authorised retailer feeds (Awin), whose image use is covered by the advertisers' programme terms.
- No rate limit is documented. PriceViva fetches once, caches the result in memory and on disk (`.data/dummyjson-products.json`), and refreshes every 6 hours, or when you press **Refresh** in admin.

## Failure handling
| Situation | What visitors see |
|---|---|
| API reachable | Sample catalogue |
| API down, saved copy on disk | Saved copy + a notice under the header |
| API down, no saved copy | The built-in fictional catalogue + a notice under the header |
| A photo fails to load | "Photo not available" placeholder |
| Pages loading | Skeleton placeholders |

## Sample offers CSV (`data/sample-offers.csv`)
| Column | Meaning |
|---|---|
| `dummyjson_id` | DummyJSON product id |
| `retailer` | Must contain "Sample" |
| `retailer_country` | `SE`, `DE` or `GB` (ships from) |
| `price`, `currency` | Currency is `SEK`, `EUR`, `GBP` or `USD` |
| `vat_included` | `yes` / `no` |
| `ship_SE`, `ship_DE`, `ship_GB` | number = delivery cost · blank = **unknown** · `x` = does not deliver |
| `import_SE`, `import_DE`, `import_GB` | Import-charge estimate for non-EU cross-border orders: number = estimate · blank = unknown. Domestic and intra-EU are automatically 0 |
| `delivery_days` | e.g. `2-5` |

The shipped CSV deliberately ends with **two invalid rows**: an unknown product id, and a retailer name without "Sample". Admin → *Test data* shows how errors are reported. Edit the file, then press **Refresh sample data now**.

## Switching modes
- **Admin → Overview → Catalogue source** has three options:
  - **DEMO API (test mode)**;
  - **REAL FEED (Awin)** — only selectable once Supabase is configured;
  - **Built-in fictional demo**.
- The choice is saved in `.data/catalog-source.json`. On hosting with a read-only disk, set `CATALOG_SOURCE=sample|live|demo` instead.
- The Awin importer (`src/lib/importers/`, `supabase/`) is untouched and separate. See `docs/SETUP_REAL_DATA.md`.
