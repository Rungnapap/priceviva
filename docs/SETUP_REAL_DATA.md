# Connecting real product data (Awin) — step by step

The site keeps running in **demo mode** until you finish these steps and switch `CATALOG_SOURCE=live`.
Nothing here is pre-filled: you supply every key, and only feeds from advertisers you are approved by are imported.

## Where PriceViva's data comes from today
| Data | Demo mode | Test mode (default) | Live mode |
|---|---|---|---|
| Products, photos | Fictional, drawn | DummyJSON sample API (placeholder, private testing only) | Approved Awin advertiser feeds |
| Shop offers / prices | Fictional | "Sample Shop" CSV (`data/sample-offers.csv`), labelled demonstration | Feed prices, with "last confirmed" time |
| Local stores and promotions | Fictional (labelled, separate) | Fictional demo stores, off by default | Only merchant-supplied (`stores`, `promotions`); none until a merchant supplies them |
| Price history | None | Recorded from the sample CSV prices | Recorded on every import |
| Exchange rates | Demo table (labelled) | ECB, or the labelled demo table | ECB (imported daily) |

**What the importer validates and reports** (Admin → Runs → errors):
- missing id/title, invalid or implausible price, missing/mismatched currency, missing Awin tracking link;
- unknown condition, invalid GTIN (check digit), missing https image, unreadable shipping;
- duplicate product ids in one feed, unreadable/future/very old `last_updated`.

Offers missing from a complete feed run are deactivated; an empty or broken feed never wipes the catalogue. Offers not confirmed for 7+ days are marked "Stale price".

## The exact steps to get real retailer feeds
1. **Awin publisher account.** Apply at awin.com as a publisher, describing PriceViva as a price-comparison site for Sweden, Germany and the UK. Approval is manual and can take days.
2. **Join advertisers.** In Awin, browse advertisers in SE/DE/GB that offer **product feeds**, and apply to each programme. Each advertiser approves you separately.
3. **Check each programme's terms** for comparison-site use, image use and the required disclosure.
4. Then follow steps 1–6 below: Supabase, keys, test **one** feed, check it, then enable more.
5. **Local store offers** (Local Deal Radar) are not part of Awin product feeds. They need a separate agreement with each retailer for store locations and in-store promotions (see `docs/LOCAL_DATA.md`).

I can't sign up, apply or accept terms for you. Every approval and key must come from your own accounts.

## 0. Before you start
- An **Awin publisher account** with at least one advertiser that has **approved** you and offers a product feed.
- Read that advertiser's programme terms. Check that it allows price-comparison promotion and use of its product images, and note any required disclosure wording.
- Node.js 20.9+ and the project installed (`npm install`).

## 1. Supabase (database)
1. Create a project at supabase.com (the free tier is fine for testing).
2. Open the **SQL editor**. Paste the whole of `supabase/apply/priceviva_apply_all.sql` and run it. It contains every migration in `supabase/migrations/`, runs them in one transaction and verifies tables, permissions and extensions before committing (safe to run again later). Reusing a project from another website? See `docs/SUPABASE_CLEAN_SETUP.md` first.
3. In **Project Settings → API Keys** (URL: **Connect** button), copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - publishable key (`sb_publishable_…`, or legacy anon) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - secret key (`sb_secret_…`, or legacy service_role) → `SUPABASE_SERVICE_ROLE_KEY` (**server only**)
   - then run `npm run env:check` (never prints values)

## 2. Awin keys
- `AWIN_DATAFEED_API_KEY`: in Awin go to **Toolbox → Create-a-Feed** and build any feed. The generated link looks like `https://productdata.awin.com/datafeed/download/apikey/XXXXXXXX/…`; the `XXXXXXXX` part is your key.
- `AWIN_PUBLISHER_ID`: shown in your Awin account menu.

## 3. Local settings
```bash
cp .env.example .env.local
npm run admin:hash -- "choose a long admin password"   # prints two lines; paste them into .env.local
openssl rand -hex 32                                     # paste as CRON_SECRET
```
Fill in the Supabase and Awin values. Keep `CATALOG_SOURCE=demo` for now.

## 4. Test ONE feed first
1. Run `npm run dev` and open http://localhost:3000/admin. Sign in.
2. **Overview**: every configuration line should say "Set" (except "Live catalogue", which is expected to be off at this point).
3. **Feeds → Discover feeds from Awin**. Your joined feeds appear. All of them start **disabled**.
4. Pick **one** approved feed from SE, DE or GB:
   - open **Settings** and check its country (this also sets its currency), refresh interval and the "prices include VAT" box;
   - press **Enable**, then **Run import now**.
   - For a large feed (more than about 50,000 products) use the command line instead, which has no time limit:
     ```bash
     npm run import:feeds -- --feed <feed-id-from-admin-url-or-table>
     ```
5. Open the run page. Check the counts and every error or warning code:
   - `missing_link`, `invalid_price`, `currency_mismatch`, `unknown_condition`, `duplicate_row` → the row was **rejected**;
   - `invalid_gtin`, `missing_image`, `unparsed_shipping` → the row was **imported**, with the problem noted.
6. Check **Category mapping** and assign any unmapped categories you care about. **Missing photos**, **Possible duplicates** and **Match reviews** show data-quality issues.
7. Switch on live mode: set `CATALOG_SOURCE=live` in `.env.local` and restart. The homepage, departments, search and product pages now show only imported data. Click a few **Visit store** buttons; they go through `/go/<offer>` to the Awin tracking link.

Only after that first feed has **succeeded** can a second feed be enabled. Raise `AWIN_MAX_ENABLED_FEEDS` when you are ready.

## 5. Automatic refresh
- **Vercel**: `vercel.json` schedules `/api/cron/import-feeds` daily at 04:17 UTC. Add all the env vars in Vercel, including `CRON_SECRET`; Vercel sends it automatically. Each run:
  - refreshes the ECB exchange rates;
  - imports enabled feeds whose refresh interval has passed;
  - skips feeds that Awin reports as unchanged since your last successful import.
- **GitHub Actions** (better for big feeds): `.github/workflows/import-feeds.yml`. Add these repository secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AWIN_DATAFEED_API_KEY`.
- Respect the provider: the default is once every 24 hours per feed (allowed range 6–168 hours, set per feed in admin). Feeds Awin hasn't refreshed are skipped.

## How the data is handled
| Rule | Where |
|---|---|
| Same product across retailers only if GTIN + condition match, or brand + MPN + colour + size + condition match | `pa_import_batch` (SQL) |
| GTIN reused with a different colour/size → kept separate and flagged in **Match reviews** | `pa_import_batch` |
| Unknown delivery cost stays unknown, never 0. Delivery outside the feed's home country is unknown → no "cheapest" claim | `map-row.ts`, `pricing.ts` |
| Original price, currency, source, last-seen and source-updated timestamps stored; price changes recorded | `offers`, `price_observations` |
| Offers missing from a **complete** run are deactivated. Partial, failed or suspiciously short runs deactivate nothing | `pa_import_finish`, `run.ts` |
| "Visit store" only to `https://www.awin1.com` tracking links stored by the importer; anonymous click count | `/go/[offerId]`, `pa_offer_redirect` |
| Retailer "RRP"/"was" prices are shown as information, never as a discount. Price drops need 30 days of our own observations | `pa_variant_json` |
| Photos are hot-linked from the feed's image URLs (https only); images not seen for 30 days are hidden | `variant_images` |
| API keys only in server env vars; stored feed URLs have the key replaced by `{API_KEY}`; error messages are redacted | `env.ts`, `feed-list.ts` |
| Local Deal Radar shows nothing in live mode until verified store addresses/promotions exist (tables `stores`, `promotions`) | `local-deals.tsx` |

## Adding eBay, Amazon or a direct retailer later
Each source gets its own mapper that produces the same `NormalizedRow` (`src/lib/importers/types.ts`) and calls the same database functions. Matching, offers, history, admin and the UI then work unchanged. The `retailers.source`, `feeds.provider` and `offers.source` columns already allow `ebay`, `amazon` and `direct`. Each new source also needs its own outbound-link allowlist in `/go/[offerId]`. Use only official, approved APIs or feeds — no scraping.
