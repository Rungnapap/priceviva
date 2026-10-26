# PriceViva

**Discover More. Compare Better.**

A global shopping-mall and price-comparison web app: explore products from local and international stores, compare delivered totals (item + shipping + import charges), and find deals near your shopping area.

Three catalogue modes, always labelled in the UI:
- **Test mode** (default, `CATALOG_SOURCE=sample`): sample products from the free **DummyJSON** API plus demonstration "Sample Shop" offers from `data/sample-offers.csv`. Details: **[docs/SAMPLE_MODE.md](docs/SAMPLE_MODE.md)**.
- **Demo mode** (`CATALOG_SOURCE=demo`): a built-in, fully fictional catalogue.
- **Live mode** (`CATALOG_SOURCE=live`): products and offers imported from approved **Awin** retailer feeds into Supabase. Setup: **[docs/SETUP_REAL_DATA.md](docs/SETUP_REAL_DATA.md)**.

## Run it on your computer

You need **Node.js 20.9 or newer**. Windows step-by-step: **[docs/WINDOWS_POWERSHELL.md](docs/WINDOWS_POWERSHELL.md)**.

```bash
cd priceviva
npm install          # one time, ~1–2 min
npm run dev          # http://localhost:3000
```

Checks:

```bash
npm run typecheck    # TypeScript
npm run lint         # ESLint (Next.js rules)
npm test             # unit tests
npm run build        # production build
npm run check        # all four in a row
```

Other commands:

```bash
npm run admin:hash -- "long password"   # create admin sign-in values
npm run import:feeds                    # import enabled Awin feeds that are due (uses .env.local)
npm run test:db                         # database tests (needs local PostgreSQL; set PA_TEST_PG=host:port:user)
```

## Pages

| Page | What it is |
|---|---|
| `/` | Homepage: hero search with camera button, categories, products worth exploring, Global Compare and Local Deal Radar, shopping tools |
| `/shop/[category]` | Shopper categories (Fashion, Beauty, Home & Living, Electronics …) that group catalogue departments |
| `/departments`, `/departments/[slug]` | Full department structure with subcategories |
| `/search` | Search with typo tolerance, filters and sorting |
| `/product/[slug]` | Gallery, specs, offer comparison with cost breakdown, favourites, compare, price alert, price history |
| `/compare` | Global Compare: A · compare retailer offers for one product, B · compare 2–3 products side by side |
| `/deals` | Local Deal Radar: any town or postcode, radius 5–100 km, real store offers with distances (live mode), separate demo stores, list/map ([docs/LOCAL_DATA.md](docs/LOCAL_DATA.md)) |
| `/saved`, `/account` | Favourites and preferences (stored in this browser); export/import as the path to future accounts ([docs/ACCOUNTS.md](docs/ACCOUNTS.md)) |
| `/alerts`, `/price-history` | Price-drop alerts with in-site notifications (no email yet — [docs/ALERTS.md](docs/ALERTS.md)); price history from real observations only |
| `/stores` | Store transparency: which stores appear and where their data comes from |
| `/about` | How prices work, disclosures, privacy |
| `/admin` | Catalogue source switch, feeds, imports, data quality |

## What's inside

| Path | What it is |
|---|---|
| `src/app/` | Pages (Next.js App Router) |
| `src/components/` | UI: header, search box, product cards, offer table, local deals; `home/` holds the homepage sections |
| `src/data/shop-categories.ts` | Homepage/header categories and site photo paths |
| `public/images/site/` | Site photography (temporary Unsplash placeholders; see `CREDITS.md` and `docs/REPLACE_IMAGES.md`) |
| `src/i18n/` | Interface languages: English, Swedish (complete), German and Thai (beta) |
| `src/lib/` | Logic with no UI: landed-cost engine, search, location rules, money/FX, browser preference store |
| `src/lib/sample/`, `src/lib/catalog/` | Test-mode loader; demo, sample and live catalogue sources behind one interface |
| `src/lib/importers/`, `supabase/migrations/` | Awin feed importer and database schema |
| `tests/` | Unit and database tests (`node:test`, run with `tsx`) |
| `scripts/preview/` | Sandbox-only preview harness used during the build; safe to delete |

Internal identifiers (package name `priceatlas`, `pa_*` database functions, `--pa-*` CSS tokens, the `priceatlas:v1` browser storage key) were kept on purpose so existing data and integrations keep working.

Progress tracking: `PROJECT_PLAN.md`, `FEATURE_CHECKLIST.md`, `CHANGELOG.md`, `docs/V0.6_PROGRESS.md`, `docs/TEST_REPORT_v0.6.md`.

Photo and barcode search: [docs/PHOTO_SEARCH.md](docs/PHOTO_SEARCH.md).
