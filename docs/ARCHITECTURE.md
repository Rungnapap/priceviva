# PriceViva (formerly PriceAtlas) — Architecture

## In plain English

PriceViva is a website with three "doors" into **one shared catalogue**:

1. **Shopping Mall** — departments → categories → products, like walking a mall.
2. **Global Compare** — for one exact product, every retailer offer across countries, turned into a *delivered total* (item + shipping + import charges) in your currency.
3. **Local Deal Radar** — promotions at stores within a radius of the city you choose.

Phase 1 has **no server database**. The catalogue is TypeScript files in `src/data/`, and your preferences (shopping area, delivery country, currency, saved items) live in your browser. That keeps the prototype free and simple, while the code is shaped so Phase 2 can swap the data source for Supabase/PostgreSQL without rewriting the pages.

```
Browser ──► Next.js pages (server-rendered) ──► src/lib (pricing, search, location)
   │                                              ▲
   └─ preferences in localStorage                 └── src/data (demo) → Phase 2: Supabase
```

## Key rules built into the code

| Rule | Where |
|---|---|
| Unknown costs are never zero; only complete totals can be "cheapest" | `src/lib/pricing.ts` |
| Statuses: `verified_total`, `estimated_total`, `partial_total`, `item_price_only`, `unavailable` | `src/lib/pricing.ts` |
| Seller VAT removed on export is subtracted once (no double VAT) | `computeLandedCost` |
| Stale prices (> 7 days) flagged and excluded from "best" | `STALE_AFTER_DAYS` |
| Original price & currency stored; conversion separate, dated | `src/lib/money.ts`, `src/data/fx.ts` |
| Variants/conditions/pack sizes are separate products — never merged | `src/data/catalog.ts` |
| Discount % only with a same-currency reference price + evidence | `discountPercent` |
| `shopping_area`, `delivery_destination`, `current_device_location` kept separate | `src/lib/location.ts` |
| Temporary area never overwrites saved area (session storage vs local storage) | `src/lib/client-store.ts` |
| Device location only on button press; coordinates discarded after picking nearest city | `area-dialog.tsx` |
| Expired promotions never shown; radius respected | `nearbyPromotions` |
| Search never invents results; GTIN exact match; typo + synonym tolerant | `src/lib/search.ts` |
| Preferences read from storage are validated (Zod) | `client-store.ts` |

## Stack

Next.js (App Router) · React · TypeScript (strict) · Tailwind CSS v4 · Lucide icons · Zod. Phase 2 adds Supabase (PostgreSQL, Auth, Storage, RLS), PostGIS, scheduled jobs. Hosting suggestion: Vercel (note: Hobby plan is non-commercial — a paid plan is needed once the site earns money).

## Planned data model (Phase 2, PostgreSQL)

Mirrors `src/lib/types.ts`:

- `departments`, `categories` (self-referencing tree, sort order), `brands`
- `products` (brand, model, variant, condition, unit) · `product_identifiers` (GTIN/EAN/UPC/MPN, unique) · `product_specs` · `product_images` (licence, attribution, source)
- `retailers`, `stores` (PostGIS `geography(Point)`), `retailer_policies`
- `offers` (product, retailer, price_minor, currency, vat_included, ship_from, stock, source, source_url, observed_at) · `offer_destinations` (shipping & import components each with `amount_minor NULL = unknown` + `basis`)
- `price_observations` (append-only history) · `fx_rates` (base, quote, rate, as_of, source)
- `promotions` (+ `promotion_stores`, reference price + evidence, starts_at/ends_at, scope, verification_status)
- `profiles`, `user_roles`, `saved_areas` (Home/Work/Favourite; city + radius, no raw coordinates), `user_preferences` (delivery_destination, currency, language)
- `wishlists`, `saved_searches`, `alerts`, `notifications`, `notification_deliveries`
- `feeds`, `import_jobs`, `import_errors`, `match_reviews`
- `affiliate_links`, `click_events`, `commission_reports`, `sponsored_campaigns`, `merchant_accounts`
- `audit_logs`, `settings`

Every user-owned table gets row-level security (`user_id = auth.uid()`); merchant tables scope by merchant membership; admin by role.

## Risks & costs to know about

- **Data access is the hard part.** No free worldwide price API exists. Real offers need approval from affiliate networks (e.g. Awin, CJ) or retailers, each with its own terms on caching, images and geography. Nothing is assumed approved.
- **Tax/duty accuracy** varies by product category and country; until a licensed provider is used, import charges must stay labelled "estimated".
- **Maps/geocoding** (Phase 4) have usage fees and attribution rules.
- **Legal**: GDPR consent for location, consumer-law rules on reference prices and discount claims (e.g. EU Omnibus "lowest price in prior 30 days"), affiliate disclosure. Legal review recommended before public launch.
- **Costs today: €0.** Likely early costs later: Supabase (free tier → ~$25/month), hosting (Vercel Pro ~$20/month for commercial use), transactional email, domain, map provider. Nothing paid is set up without your approval.


## Real data integration (v0.2)

```
Awin feed list ──discover──► feeds (disabled)            Admin /admin (password, same-origin)
Awin product feed (CSV.gz) ──► importer (src/lib/importers) ──► pa_import_batch (SQL: match + upsert)
        ▲ cron / CLI / "Run now"          │ errors ► import_errors      │ offers, variants, images, price_observations
ECB daily XML ─────────────────► pa_fx_upsert                           ▼
Pages (server) ── getRepository() ── demo-repo | live-repo ── pa_catalog_* (anon, read-only)
"Visit store" ── /go/[offerId] ── pa_offer_redirect (service) ── allowlisted awin1.com link
```

- **Identity & matching**: `variants.identity_key` is the merge key. It is built from:
  - `gtin:<GTIN-14>|<condition>`, or
  - `mpn:<brand>|<mpn>|<colour>|<size>|<condition>`, or
  - `src:<source>:<retailer>:<id>` (never merged).
  If a GTIN arrives with a different colour/size, it is kept separate and written to `match_reviews`.
- **Families**: variants that share a retailer's parent/group id form one `products` row, shown as "other variants".
- **Freshness**: `offers.last_seen_at` (our import) and `source_updated_at` (the retailer's own timestamp) are stored. Offers older than 7 days are stale. Offers missing from a complete run become `is_active=false`.
- **Discounts**: only computed from our own `price_observations` (30-day low, needs at least 30 days of history). RRP is shown as information only.
- **Security**: RLS is enabled with no table grants for anon/authenticated. Read functions are `security definer` and return active, public columns only. The service-role key is used only server-side. Admin uses a scrypt hash, an HMAC session cookie and same-origin checks.
