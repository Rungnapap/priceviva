# Local Deal Radar — data model and merchant imports

Local Deal Radar renders only `LocalOfferView` objects (`src/lib/local-offers.ts`). Every field the source does not supply stays empty and is shown as "not available" or "not stated". Nothing is filled in.

## Data sources and how they are labelled

| `status` | Meaning | Shown as | Allowed on the real map? |
|---|---|---|---|
| `verified` | Store address and promotion checked by PriceViva against the merchant | "Verified offer" | Yes |
| `merchant` | Supplied by an approved merchant (feed/API) and not yet checked | "Merchant-supplied" | Yes |
| `demo` | Fictional demo data (`src/data/places.ts`) | "Demo" badge, "fictional store", "demo distance" | **No.** Positions are invented, so demo stores are listed but never pinned |

- Demo data is used only in demo and test mode.
- Live mode (`CATALOG_SOURCE=live`) never loads `src/data/places.ts`. It shows an empty state until merchant data exists.

## Fields

| View field | Source column (Supabase) | Notes |
|---|---|---|
| store.retailerName | `retailers.name` | |
| store.name | `stores.name` | |
| store.address, city | `stores.address_line`, `postal_code`, `city` | Required for `verified`/`merchant` |
| store.lat / lng | `stores.lat`, `lng` | Only from the merchant or a geocoded address; never estimated |
| store.website | *proposed* `stores.website_url` | Shown as "Retailer website" (affiliate rules apply) |
| title, departmentSlug | `promotions.title`, `department_slug` | |
| productSlug | `promotions.variant_id` → `variants.slug` | Links to the online comparison for the exact variant |
| price, reference | `promo_price_minor`, `currency`, `reference_price_minor`, `reference_evidence` | Discount % only with reference evidence |
| validFrom / validTo | `starts_at`, `ends_at` | Expired offers are never shown |
| scope, pickup, terms | `scope`, `pickup`, `terms` | |
| availability | *proposed* `promotion_stores.availability` (`in_stock`/`limited`/`out_of_stock`/`unknown`) | Defaults to `unknown` |
| updatedAt | *proposed* `promotion_stores.observed_at` | Data freshness ("updated 2 h ago") |
| status | `promotions.verification` (`pending` → `merchant`, `verified` → `verified`) | `rejected` rows are never shown |

*Proposed* columns are not in the current migration. They would be added together with the first real merchant import, as a new migration file; the existing tables stay unchanged.

## Importing merchant locations and offers (planned)
1. **Merchant identity:** `retailers` row, plus the merchant's own store IDs (proposed `stores.external_id`, unique per retailer).
2. **Store locations:** from the merchant's store-locator feed. Store each address exactly as supplied. Coordinates come from the merchant; if the merchant gives none, geocode the address once and mark the source.
3. **Offers:** product identifiers (GTIN/EAN/MPN) match `variants` exactly, with the same rules as online offers. Price, currency, validity and availability are stored as supplied, with `observed_at`.
4. **Freshness:** offers not seen in the latest import are deactivated. Availability older than 24 h is shown as "not stated".
5. **Verification:** spot-check new merchants before switching `verification` to `verified`.

## Location search
- **Supported cities** match instantly in the browser.
- **Places and postcodes** go through `GET /api/geocode?q=…` (`src/lib/server/geocode.ts`), which uses OpenStreetMap Nominatim:
  - free and no key, but limited to 1 request/second, which the server enforces;
  - 20 lookups per minute per visitor, 24 h cache, results limited to SE/DE/GB;
  - only the typed text is sent.
  - Set `GEOCODER_CONTACT` (an email address for the User-Agent, as Nominatim's policy asks).
  - For production traffic set `GEOCODER_URL` to a paid or self-hosted Nominatim-compatible service; `GEOCODER=off` disables lookups.
- **"Use my location"** runs only when clicked. It is rounded to about 1 km, kept in the browser tab (temporary area) and never sent to the server.

## Map tiles
`src/components/tile-map.tsx` is a small built-in map with no extra dependency. By default it uses OpenStreetMap's standard tiles, which are free but meant for light use, with attribution. For a public launch, use a tile provider and set:

```
NEXT_PUBLIC_MAP_TILE_URL=https://{provider}/{z}/{x}/{y}.png?key=...
NEXT_PUBLIC_MAP_ATTRIBUTION=© Provider © OpenStreetMap contributors
NEXT_PUBLIC_MAP_ATTRIBUTION_URL=https://...
```
