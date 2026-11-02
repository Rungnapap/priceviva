# Changelog

## 0.7.5 — 2 Nov 2026 — automatic updates fixed
- Fix: feed imports failed with "canceling statement due to statement timeout". Batches are now 50 rows (was 250), and a batch that times out is split and retried automatically.
- The nightly import now runs in GitHub Actions (02:37 UTC, 100-minute budget). Vercel no longer schedules it because its function time limit cut full feeds short.
- A failed or partial nightly import fails the GitHub job, so GitHub emails you.
- Setup steps: `docs/AUTO_UPDATE.md`.

### Speed
- New database migration `20261102120000_catalog_speed.sql` (paste into the Supabase SQL editor). Search, suggestions, lists and counts do far less work per request; rankings are unchanged (tested on an 18,000-product copy). Search returns the top 96 matches (was 240). Typo-tolerant matching runs only when exact words find fewer than one page of results; suggestions are ranked from at most 600 candidates.
  - Local test copy: search "hörlurar" 106 → 17 ms, common word "strumpor" 129 → 58 ms, suggestions 132–144 → 4–6 ms, homepage list 131 → 33 ms.
- The homepage loads 24 products to pick its featured ones (was 120).

### Search engines (ready to switch on — `docs/GOOGLE_SETUP.md`)
- Sitemap lists every product with an active offer (new read-only function `pa_catalog_sitemap`, migration `20261102130000_sitemap.sql`), plus home, info and category pages with products.
- Product pages: brand named once in the title, own description from real prices (not the shop's copied text), canonical address, share preview, schema.org Product/Offer data with real prices only (no ratings or reviews; none for demo/test data).
- Search results and Global Compare are `noindex, follow`. Department and category pages have canonical addresses.
- `robots.txt` reads the indexing setting on every request. The site address falls back to Vercel's production domain, and a localhost value is ignored on Vercel, so search engines never get "localhost" addresses.

### Categories
- New category rules (`src/lib/importers/categories.ts`), checked against all 18,100 products in the live feeds: uncategorised products 2,286 → 37.
  - Every category field in the feed is used, most reliable first: Bazta's Swedish path, Awin's own category (Strumpor-online), product type (Deluxehomeartshop). Product names are used only when a row has no category at all, because names contain brands and colours ("Olivia Garden" hairbrush, "Green Tea" deodorant).
  - Swedish rules, with å/ä/ö treated as letters: "tv" no longer matches "tvätt"/"tvål" (laundry and soap had filled Electronics › TVs).
  - The main section decides: "Husdjurstillbehör > Leksak" is Pets, "Auto & cykel > Rengöring" is Automotive, "Klockor & Smartwatches" is Watches.
- Adult products (sex toys, condoms, lubricants) are no longer imported (owner decision); they had been listed under Toys. Import logs show them as "excluded by policy", not as errors. Existing ones are switched off by the next full import.

## 0.7.0 — 25 Oct 2026

### Accounts, saved products in the account, price-range filter (26 Oct)
- **Log in / Sign up / Forgot & reset password / Log out** with Supabase Auth.
  - Sessions are httpOnly cookies and are refreshed automatically.
  - E-mail links use PKCE.
  - No account enumeration; Origin (CSRF) checks; form validation shared by the browser and the server.
  - Header: "Log in" button for guests, account button when logged in; same in the mobile menu.
- **Account dashboard** (`/account`): e-mail, saved products, price alerts (edit, pause/resume, e-mail on/off, delete), log out.
  - The browser-only "delete everything" button is hidden when logged in. It would have deleted the account's lists; "Log out" clears the browser instead.
- **Saved products and alerts in the account**:
  - new tables `user_saved_products`, `price_alerts`, `price_alert_events`, with row-level security `user_id = auth.uid()`;
  - migration `20261026130000_accounts.sql`; `supabase/apply/priceviva_apply_all.sql` rebuilt (19 tables, 36 functions, more checks);
  - signed-in users can only write the alert fields they manage (column-level privileges + `pa_alerts_guard` trigger); `email_notified_*`, `created_at`, `updated_at`, `user_id`, `product_id`, `destination` are server-managed; re-runs tighten older grants and correct our policies; a pre-check stops on a conflicting leftover table;
  - a guest's lists merge on first login; another account's lists are never copied; logging out clears the browser.
- **Price-alert e-mails prepared but OFF**: never in test mode, verified feed prices only, one e-mail per drop, signed unsubscribe, no marketing. See `docs/ALERTS.md`.
- **Price-range filter**:
  - filtering and price sorting use exactly the price shown on each card (delivered total when known, else offer price, else sample list price), so DummyJSON products with only a list price are found too;
  - before, products without a complete delivered total couldn't be found by price at all;
  - minimum-above-maximum and invalid values are stopped with a message; "1 299,50" is understood; the range remembers its currency and is converted with the same rates;
  - placeholder while prices load; "TEST DATA" label; "Apply filters" and a clear "Clear filters" button.
- Clearer **TEST DATA** labels on sample/demo prices and offers.
- Tests:
  - `tests/accounts.db.test.ts` (14), `tests/account-sync.test.ts`, `tests/alert-emails.test.ts`;
  - browser: `scripts/preview/accounts-flow.mjs` (39) and `price-filter.mjs` (18);
  - a Supabase stand-in (Auth + PostgREST + RLS) for local tests.

### Supabase: clean setup for a reused project (prepared, not run)
- `docs/SUPABASE_CLEAN_SETUP.md`: step-by-step (PowerShell) to remove the previous website's database objects, its Auth user and old keys, then install PriceViva.
- `supabase/one-off/old-site-cleanup/`: read-only preview + guarded removal of exactly 4 old tables and 2 old functions (no CASCADE, one transaction, stops if anything else depends on them or the row counts don't match).
- `supabase/apply/priceviva_apply_all.sql` (generated by `npm run db:bundle`): all migrations in one transaction with pre-checks (PostgreSQL 15+, extension schemas) and post-checks (16 tables, RLS, 29 functions, public key limited to the 9 read functions). A test fails if it gets out of date.
- New migration `20261026120000_lock_helper_functions.sql`: the public key can no longer call the internal helpers `pa_norm`, `pa_slugify`, `pa_conflicts` (Supabase grants EXECUTE on new functions by default).
- Database tests: localhost-only safety guard (refuses remote hosts and redirecting libpq variables before any connection); migrations are now read from the folder.
- `npm run db:ping`: read-only connection test — public key reads the catalogue (counts only), public key is refused by server-only functions, secret key reads the admin overview. Writes nothing; sample mode unchanged.
- `npm run env:check` and an `/admin` warning for dangerous key mix-ups (secret key in a `NEXT_PUBLIC_` variable, swapped keys, connection strings); values are never printed.

### Featured products and categories (reference proportions)
- "Featured Products" (renamed from "Products to compare"; no popularity claim): 5 compact horizontal cards per row on wide screens (3 / 2 / 1 on smaller), larger photo on the left, full product name (no cropping), "From" price only when a complete delivered total exists, offer count only when more than one shop. Sample/demo label kept.
- "Browse by category": 8 photo cards in one row on wide screens (4 on tablet, 2 on phones) with wide 3:2 thumbnails and the name centred underneath; the other 4 main categories and Pets are links in a "More categories" row, plus "View all categories".
- The two sections are grouped closer together.

### Homepage layout from the mockup
- Hero: pill "Compare prices from multiple stores and countries", headline, bold tagline, large search, popular-category chips, Global Compare / Local Deal Radar as small secondary links.
- Wide screens (1280 px+): a small **example comparison card** on the right, built from a real catalogue product with offers from at least two shops (item price, delivery when known, "Delivery cost unknown" otherwise). Labelled "Example · Demonstration data" / "Example · Sample data" outside live mode. No logos, ratings, review counts or invented prices.
- Four benefits in one light panel; horizontal three-step "How PriceViva works" (Search → Compare → Choose a retailer).
- "Products to compare": five compact product cards ("From" only when a complete delivered total exists, "Compare N offers").
- "Browse by category": all 12 owner photos as small cards with the name underneath, plus Pets.

### Homepage simplification (beta launch)
- **New wording:** headline "Compare Prices. Find Better Value." with "Discover More. Compare Better." as the brand line above it, and a short description, in all four languages.
- **Search:** large hero search with "What product would you like to compare?". The photo-search icon is muted, so it stays secondary to the main search.
- **Global Compare and Local Deal Radar:** now quiet "Or explore" links under the search. The hero pill repeating the test-mode notice is gone; the site-wide banner still shows it.
- **New sections:**
  - three compact benefits (Compare store prices / Check total costs / Find better value);
  - a slim How PriceViva works (Search → Compare → Choose) that links to the detailed page.
- **Removed from the homepage only:**
  - "Shop near you or around the world" cards;
  - "Your shopping tools" cards.
  These features are still in the header, phone tab bar and footer.
- **Page order now:** hero, benefits, the 12 category photos, how it works, labelled example products.

### Homepage search focus (pre-beta)
- **Search box:** wider and more prominent, reaching toward the centre of the photo below the couple's faces, with a stronger shadow.
- New line above the search: "Find a product. Compare prices across stores." (all four languages).
- **Phones and tablets:** shorter photo band, so the search shows on the first screen.
- **Build warning:** fixed Turbopack's whole-project file-tracing warning (`turbopackIgnore` on the run-time paths in `src/lib/sample/io.ts` and `src/lib/server/catalog-source.ts`). Sample-data loading and `SAMPLE_OFFERS_CSV` are unchanged.

### Fixed (from your `npm run check`)
- 9 TypeScript errors: admin menu typing, photo-search effect clean-up, and the test exchange-rate tables.
- Patterns flagged by the new React lint rules: state reset in effects, impure render.
- Dark-mode button contrast raised to WCAG AA.
- Page-header text no longer covers people in the photos on tablets.

### Added (parts 2–5)
- **Global Compare:** inline delivery country and offer ordering.
- **Side-by-side:** sticky first column on phones, and an "Add another product" link.
- **Local Deal Radar:** municipality search (e.g. "Mönsterås kommun"); offers can't show for the wrong area.
- **Alerts:** stricter target validation; clear "no email or push notifications" wording; currency rule explained.
- **Contact page:** address from `CONTACT_EMAIL` only, never invented.
- **About:** "What works today" (working / demonstration / not available).
- **Search engines:** robots and sitemap controlled by `ALLOW_INDEXING`, live data only.
- **Security headers:** COOP, HSTS, stricter Permissions-Policy.
- **Translations:** map controls, notices and navigation labels.
- **Checks:** automated accessibility audit, and new tests for contact, SEO, municipalities and alert validation.

## 0.7.0 part 1

### Added
- **Your v0.7 photography:**
  - new homepage hero (mall with shoppers);
  - photos for 11 of the 12 categories;
  - city-skyline photo for Global Compare;
  - mall photo for Local Deal Radar.
  Beauty & Personal Care keeps the earlier handbag photo until a new one is supplied.
- **Three new categories:** Travel & Luggage, Kitchen & Appliances, Garden & Outdoor Living. Beauty, Health and Cars categories renamed. All translated.
- **Privacy policy page** describing what the site actually stores and sends. It still needs the operator's details and a legal review.
- **Search:** price range filter on the delivered total, in your display currency. Products without a complete total are counted and hidden, never guessed.
- **Product offers (Global Compare):** inline "Deliver to" country selector and "Order offers by" (delivered total, item price, fastest delivery).

### Changed
- **Hero:** photo band above the text up to 1279 px, so text never covers the shoppers; separate crop for phones.
- **Header:** category links are measured at runtime. Any that don't fit are hidden from view and tab order, in every language.
- **Footer:** About, How PriceViva works, Disclosures, Privacy policy.

### Fixed
- The About page still described the old "nearest supported city" location behaviour.
- Duplicate footer link (React key warning) in live mode.

## 0.6.0 — 25 Oct 2026

### Added
- **Any town or postcode as a shopping area** (Kalmar stays Kalmar):
  - OpenStreetMap lookup, rate-limited and cached;
  - optional "Use my location" shown as a suggestion only;
  - radius 5–100 km, which persists.
- **Local Deal Radar:**
  - real merchant/verified store offers from the database, with real distances;
  - map and cards stay in sync;
  - demo stores kept in a separate, switchable section;
  - honest empty states.
- **Global Compare:** split into "Compare retailer offers" and "Compare products", with Remove and Clear all.
- **Currencies:** 10 display currencies with dated rates. Converted prices are marked ≈.
- **Price history:** real observations only, step chart with time ranges and an insufficient-data state.
- **Price-drop alerts in this browser:** set, pause, edit, delete; in-app notifications, once per drop.
- **Photo search and barcode lookup:**
  - photo search is on the device, labelled "visually similar" with confidence;
  - barcode lookup gives an exact match.
- **Interface languages:** English and Swedish complete; German and Thai as beta. Numbers and dates follow the language.
- **Account page:** export/import of favourites and alerts as the migration path to future accounts.
- **Database:** additive migration `20261025120000_local_offers_price_history.sql` (store coordinates, offer availability, local-offer and price-history functions).
- **Importer validation:** implausible prices; invalid, future and old timestamps.

### Changed
- Homepage: six large category cards and View all.
- Product page: a single headline price, consistent blue primary buttons, matching explanation.
- Header: no crowding at 1024–1279 px.

### Not available (blocked — see docs)
- **Sign-in and accounts:** need Supabase Auth and an email provider (`docs/ACCOUNTS.md`).
- **Email alerts:** need accounts, an email provider and a scheduler (`docs/ALERTS.md`).
- **Real retailer offers and store locations:** need Awin/merchant approval (`docs/SETUP_REAL_DATA.md`).

## 0.5.0 (in progress) — Phases A–C: audit, homepage, Local Deal Radar

### Fixed
- **Blank product photos in screenshots:** the build sandbox has no internet, so DummyJSON photos could not load there. On a normal connection they do load: checked through a real browser on 25 Oct 2026, the API returned 194 products with WebP photos.
- **Real image problems fixed:**
  - Cards now load DummyJSON's small thumbnail (~10 KB) instead of the full-size photo (~63 KB).
  - The thumbnail is no longer repeated as an extra gallery photo.
  - The missing-photo placeholder is clearer and consistent.

### Changed
- **Homepage cut to five sections:**
  1. Hero and search
  2. Shop by category
  3. Products worth exploring
  4. Global Compare and Local Deal Radar
  5. Your shopping tools
- **Homepage details:**
  - shorter hero with the requested copy;
  - the camera button now explains that photo search is coming, instead of being disabled;
  - removed the how-it-works strip, the extra shelves, the stores list and the guides.
- **"Products worth exploring"** puts products sold by 2+ shops first and alternates departments. It makes no "trending" or "best-selling" claim.
- **Phones:**
  - new bottom tab bar (Home, Search, Compare, Local deals, Saved);
  - the 12 header shortcut chips are removed;
  - tighter product cards with an offer count and shop names.
- **Local Deal Radar redesigned ("Discover deals around you"):**
  - city, district or postcode search: supported cities instantly, other places via `/api/geocode` (OpenStreetMap Nominatim, rate-limited and cached);
  - optional "Use my location" (rounded to ~1 km, kept for the tab only);
  - radius, product search ("running shoes near me"), category chips, sort by distance or ending date, and a List/Map switch;
  - a built-in map (OpenStreetMap tiles, no new dependency) showing the area and radius;
  - demo stores are listed but never pinned on the real map, because their positions are invented;
  - offer cards show retailer, store, address (or "not available"), distance, price, validity, scope, availability and directions only where real data exists, each with a source label;
  - honest empty states that never fill in unrelated offers.
- **Shopping area** can now be a searched place, not only one of the 8 cities. Old saved areas still work.

### Added
- `src/lib/local-offers.ts`: one view model for demo, merchant and verified local data.
- `docs/LOCAL_DATA.md`: field mapping and merchant import plan.
- `src/lib/server/geocode.ts` and `src/app/api/geocode/route.ts`.
- `src/components/tile-map.tsx`, `src/components/mobile-tab-bar.tsx`, `src/components/home/shopping-tools.tsx`, `src/lib/featured.ts`.
- 10 new unit tests (73 total) and 7 new browser checks in test mode.
- New optional env vars: `GEOCODER_CONTACT`, `GEOCODER_URL`, `GEOCODER`, `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION`, `NEXT_PUBLIC_MAP_ATTRIBUTION_URL`.

### Earlier in 0.5 (Phase 2)
- The owner-supplied background images, with phone crops, are used per page type.

## 0.4.0 — 2026-10-25 — PriceViva redesign

### Changed
- **Rebrand to PriceViva** with the tagline "Discover More. Compare Better.":
  - new logo, favicon, page titles, footer and all visible text;
  - internal identifiers (package name, `pa_*` database functions, `--pa-*` CSS tokens, the `priceatlas:v1` browser storage key, env var names) are unchanged, so saved preferences and integrations keep working.
- **Design system:** white/warm-grey surfaces, confident blue for actions, navy text and footer, gold used sparingly (headline accent, "coming soon"), red for Local Deal Radar, green for value/compare actions. Display headings use Plus Jakarta Sans and body text Inter.
- **Header:**
  - logo with tagline, large search, shopping area, and a delivery/currency/language menu (only English is available; other languages are shown as "coming soon");
  - price alerts, favourites and account icons;
  - an All Categories mega menu, a category bar, a red Local Deal Radar pill and a blue Global Compare pill;
  - mobile layout with quick-link chips and a drawer.
- **Homepage:**
  - full-width photo hero with a working search and four feature links (Compare Prices, Global Compare, Local Deal Radar, Price Alerts — marked "Coming soon");
  - ten photographic category tiles;
  - a benefits strip, a featured products grid with Global Compare and Local Deal Radar promo panels, evidence-only price drops (hidden when there are none), shelves, local deals, stores and guides.
- **Product cards:** square photo, favourite heart, brand · model, delivered total with its status, a green "Compare N offers" action, an icon-only add-to-comparison button and the retailer names.
- **Product page:**
  - "Best delivered total" box with a jump to the offer comparison;
  - favourite and compare buttons;
  - a disabled **Price alert — Coming soon** control with an explanation;
  - breadcrumb through the shopper category.
- **Global Compare** (`/compare`): feature explainer, side-by-side table ("Not available"/"Not stated" instead of blanks), and products sold by several shops.
- **Local Deal Radar** (`/deals`): red accent throughout; demo stores remain labelled.
- Favourites page restyled. The account export file is now `priceviva-preferences.json`.

### Added
- `/shop/[category]` pages that group catalogue departments (for example, Electronics = TV & audio + phones + computers), with empty states that explain why.
- `/alerts` and `/price-history` "coming soon" pages that state plainly that nothing is sent and no history is invented.
- `/stores` store-transparency page. It shows where each store's data comes from and deliberately gives no "trusted retailer" rating.
- Site photography in `public/images/site/`: free Unsplash photos, credited in `CREDITS.md`, served through `next/image`. Replacement guide: `docs/REPLACE_IMAGES.md`.
- Sandbox browser checks: `scripts/preview/sample-smoke.mjs` and horizontal-overflow detection in `smoke.mjs`.

### Not verified here
- `npm install`, `next build`, ESLint, and `next/image` optimisation in a real Next.js server could not run in the build sandbox (no npm registry access). Run `npm run check` locally.

## 0.3.0 — 2026-10-24 — Free test mode (DummyJSON)

### Added
- Test mode (now the default):
  - sample products from the DummyJSON API, cached in memory and on disk, refreshed every 6 h, with a visible fallback notice;
  - demonstration "Sample Shop" offers from `data/sample-offers.csv`, with an import report.
- Admin catalogue-source switch (test mode / real feed / built-in demo) and a test-data page with refresh.
- Product gallery hover zoom and full-screen viewer, and loading skeletons.
- Search filters by department/subcategory; multi-expand offer details.
- `docs/SAMPLE_MODE.md`, `docs/WINDOWS_POWERSHELL.md`, and 8 sample-mode tests (63 total).

## 0.2.0 — 2026-10-24 — Real product data integration (Awin)

### Added
- **Supabase schema** (`supabase/migrations/20261024120000_catalog.sql`):
  - tables for retailers, products (model families), variants, images, offers, price observations, FX rates, feeds, import runs/errors, category mappings, match reviews, click events, and verified stores/promotions;
  - row-level security on every table; public reads only through read-only `pa_catalog_*` functions; writes through service-role `pa_import_*` / `pa_admin_*` functions.
- **Awin importer** (`src/lib/importers/`):
  - streaming gzip CSV parser;
  - Legacy and Enhanced column support;
  - GTIN check-digit validation, price/condition/stock normalisation, https-only images, Awin-only tracking links;
  - per-row error log;
  - batch upserts with matching in SQL, done in this order: GTIN+condition → brand+MPN+colour+size+condition → never merged;
  - flags a GTIN reused with a different colour/size for review;
  - price history;
  - safe deactivation of offers missing from a feed (complete runs only).
- Feed discovery from the Awin feed list (API key stripped before storage), ECB exchange rates, a scheduled import (Vercel Cron route + GitHub Actions workflow), and a CLI (`npm run import:feeds`, including importing from a local file).
- **Live/demo catalogue switch** (`CATALOG_SOURCE`) behind one repository interface. The homepage shelves, departments, search, product pages, saved items and compare all read from it, and demo and live data are never mixed.
- Product photo gallery with clickable thumbnails and a fallback; real photos on cards.
- **Visit store** on every offer via `/go/[offerId]`: allowlisted, logs an anonymous click, `rel="sponsored"`. Affiliate disclosure in the header, offers and About page.
- **Admin** (`/admin`):
  - scrypt password sign-in with a signed HttpOnly session and same-origin checks;
  - configuration status, feeds (discover/enable/settings/run), import runs and errors;
  - stale offers, missing photos, possible duplicates, match reviews and category mapping;
  - "test one feed before enabling another" rule.
- Tests: 42 unit tests and 13 database integration tests against PostgreSQL 16 using synthetic fixtures. A live-mode browser check passes 19/19, and the demo-mode browser regression passes 23/23.

### Changed
- Pricing engine is generic over offer types; the "no delivery" reason now says the retailer has not stated delivery, rather than claiming it does not deliver.
- Comparison groups are stored with the comparison (department/subcategory), and saved/compare ids accept database UUIDs.
- Local Deal Radar shows an honest empty state in live mode until verified store data exists.

### Not yet verified
- `npm install`, `next build`, ESLint and a run against a real Awin account/Supabase project could not run in the build sandbox (no npm registry or internet access to those services). Follow `docs/SETUP_REAL_DATA.md`.


## 0.1.0 — 2026-10-24 — Phase 1 prototype

### Added
- Next.js App Router + TypeScript (strict) + Tailwind v4 project with PriceAtlas design tokens and light/dark themes.
- Shopping-mall homepage, departments index and department pages, product pages, search, compare, Local Deal Radar, saved items, account (guest), about/disclosures, 404 and error pages.
- Fictional demo catalogue: 12 brands, 9 retailers, 36 products, 90 offers across Sweden, Germany and the UK; 17 fictional stores, 9 promotions (incl. one expired, one upcoming).
- Landed-cost engine with verified/estimated/partial/item-only/unavailable statuses, export-VAT handling and demo FX conversion.
- In-memory search with synonyms, typo tolerance, GTIN lookup, filters, sorting, pagination.
- Location model separating shopping area, delivery destination and device location; validated browser persistence.
- 26 unit tests; sandbox preview harness with page smoke test and 23 interaction checks.

### Known limitations
- `npm install`, `npm run lint` and `next build` could not run in the build sandbox (no npm registry access). Run `npm run check` locally.
- No database, auth, real data, maps, alerts or price history yet (by design for Phase 1).
