# Feature checklist

Legend: ✅ working & tested here · 🧪 built, needs your PC/real account to confirm · 🟡 partial / honest placeholder · ⬜ not started

## v0.5 review build — Phases A–C
| Area | Requirement | Status |
|---|---|---|
| Audit | Real vs demo features; cause of blank photos | ✅ The sandbox has no internet. DummyJSON photos load on a normal connection (checked in a real browser) |
| Images | Correct photo, thumbnails for cards, stable size, lazy loading, consistent fallback | ✅ |
| Homepage | Five sections, shorter hero, requested copy, camera action, view-all, not too long | ✅ Camera explains "coming soon" (Phase E) |
| Mobile | Bottom tabs (Search/Compare/Local/Saved), fewer header items, no overflow at 360/390/820 px | ✅ |
| Local Deal Radar | City/postcode search, optional location, radius, product search, categories, list/map, sort | ✅ Postcode lookup 🧪 needs internet (unit-tested with a stub; sandbox shows the honest "unavailable" state) |
| Local Deal Radar | Map with area and radius; pins only for real store positions | ✅ Built-in OSM map; demo stores are never pinned |
| Local Deal Radar | Offer cards show only supported fields, with source labels (verified/merchant/demo) | ✅ |
| Local Deal Radar | Data model for merchant stores/offers | ✅ `LocalOfferView` + docs/LOCAL_DATA.md · ⬜ no real merchant import yet |
| Photo search, retention features | Phases E–F | ⬜ waiting for design approval |

## PriceViva redesign (v0.4)
| Area | Requirement | Status |
|---|---|---|
| Brand | PriceViva name, logo, tagline, favicon, titles, footer | ✅ no visible "PriceAtlas" left (browser-checked); internal identifiers kept on purpose |
| Header | Logo + tagline, big search, location, currency, language, favourites, account | ✅ language: English only, others marked "coming soon" |
| Category bar | All Categories … Pets, Deals; red Local Deal Radar, blue Global Compare | ✅ desktop bar + mobile chips/drawer |
| Hero | Full-width mall photo with adult shopper, headline, text, working search, 4 feature links | ✅ · 🟡 photo is a temporary Unsplash placeholder (docs/REPLACE_IMAGES.md) |
| Category tiles | 10 photographic, clickable tiles (not brands) | ✅ link to `/shop/[category]`; empty categories say "Opening soon" |
| Benefits strip | Best Value Picks, Price History, Price Drop Alerts, Global vs Local, Store Transparency | ✅ every item links to a real page; History/Alerts marked "Soon". "Trusted Stores" renamed "Store Transparency" (no evidence for a trust rating) |
| Product grid | Photo, name, brand/model, price + currency, favourite, offer count, Compare Offers, retailer info | ✅ |
| Promos | Global Compare and Local Deal Radar panels | ✅ |
| Global Compare | Polished page, unknown costs as "Not available"/"Not stated", sorting where supported | ✅ side-by-side + multi-shop products; sorting on search page |
| Local Deal Radar | Red accent, location, radius, map link, cards, category filter, empty states, demo labels | ✅ |
| Product page | Gallery, specs, retailer comparison, favourite, price alert (honest), related | ✅ price alert disabled + "Coming soon" |
| Favourites | Restyled | ✅ browser storage |
| Responsive | No horizontal overflow | ✅ 23 routes × desktop 1440 + mobile 390 checked |
| Accessibility | Labels, focus, keyboard mega menu, alt text | ✅ automated flows; 🧪 full screen-reader pass not done |
| Images | Optimised, no layout shift | ✅ `next/image` with fixed boxes · 🧪 optimisation runs only in a real Next server |

## Free test mode — DummyJSON (v0.3)
| # | Requirement | Status |
|---|---|---|
| 1 | Auto-fetch sample products | ✅ fixture-tested · 🧪 real API on your PC |
| 2 | Homepage, departments, search, product pages populated | ✅ |
| 3–7 | Photos, clickable cards, gallery with zoom, detail pages, search/filters/sorting | ✅ |
| 8 | Comparison, location selector, local deals preserved | ✅ |
| 9–12 | Sample offer CSV importer, labelled demonstration data, nothing invented, expandable offers | ✅ |
| 13 | Awin importer kept separate | ✅ DB tests pass |
| 14 | Admin switch DEMO API ↔ REAL FEED | ✅ · 🧪 in a real Next server |
| 15–18 | Failure/loading states, API terms checked, tests, PowerShell commands | ✅ |

## Real data integration — Awin (v0.2)
All 20 requirements built. Database tests and the live-mode browser check pass against synthetic fixtures. 🧪 Needs your Awin approval, API key and a Supabase project (docs/SETUP_REAL_DATA.md).

## v0.6 (25 Oct 2026)
| Phase | Requirement | Status |
|---|---|---|
| 1 | Any town/postcode; optional geolocation as a suggestion; no silent city swap; persistent radius 5–100 km | ✅ · 🧪 live OpenStreetMap lookup on your PC |
| 1 | Real store offers with real distances; map ↔ cards in sync; demo stores separate; Kalmar empty state | ✅ · ⛔ real store data needs merchant approval |
| 2 | Compare retailer offers vs compare products; Remove / Clear all; hidden empty counter; GTIN/model matching; original + display currency; unknown ≠ 0 | ✅ |
| 3 | Data-source overview, feed validation, steps to real feeds; no scraping, nothing invented | ✅ · ⛔ Awin approval |
| 4 | Price history from real observations; ranges; insufficient-data state; item vs delivered | ✅ |
| 5 | Alerts: watch, target, pause/edit/delete, no duplicates, in-app notifications, preferences | ✅ · ⛔ email (accounts + provider + scheduler) |
| 6 | Photo upload/camera/crop/remove, visual similarity with confidence, no-match state, barcode exact match, size/type limits, privacy | ✅ free, on device |
| 7 | 10 currencies with dated rates; ≈ labels; delivery country unchanged | ✅ |
| 7 | Real interface languages | ✅ English, Swedish · 🧪 German, Thai (beta, needs native review) · info pages English-only (labelled) |
| 8 | Accounts | ⛔ Supabase Auth + email provider · ✅ export/import migration path |
| 9 | Six category cards + View all; product page single price + consistent buttons + matching confidence; header at intermediate widths | ✅ |
| 10 | Typecheck, tests, browser checks at all widths, 13 journeys | ✅ (see docs/TEST_REPORT_v0.6.md) · 🧪 lint + `next build` on your PC |

## v0.7 (25 Oct 2026)
| Area | Status |
|---|---|
| Owner photography: hero, 11 categories, Global Compare, Local Deal Radar | ✅ · 🟡 Beauty & Personal Care photo missing |
| 12 categories incl. Travel & Luggage, Kitchen & Appliances, Garden & Outdoor Living | ✅ |
| TypeScript errors from `npm run check` (9) | ✅ fixed · 🧪 confirm on your PC |
| Global Compare: inline delivery country, offer ordering | ✅ |
| Side-by-side compare: sticky column, add-more link | ✅ |
| Local Deal Radar: municipalities, area-safe loading | ✅ · 🧪 live OpenStreetMap on your PC |
| Search price-range filter | ✅ |
| Alerts: validation, currency rule, "no email or push" wording | ✅ · ⛔ email/push need accounts + provider |
| Contact page (`CONTACT_EMAIL`) | ✅ · needs your address |
| About "What works today", Privacy policy | ✅ · legal review needed before launch |
| Accessibility audit, dark-mode contrast, tablet page headers | ✅ |
| Search-engine control (`ALLOW_INDEXING`), security headers | ✅ |
| ESLint, `next build`, `npm audit` | 🧪 run on your PC (no registry access here) |

## Not started / later phases
- ⛔ Accounts / login (needs Supabase Auth + email provider — docs/ACCOUNTS.md)
- ⛔ Email price alerts (needs accounts + email provider + scheduler — docs/ALERTS.md)
- ⛔ Verified real store locations and promotions (needs merchant data)
- ⬜ Native review of German and Thai; translation of the long information pages
- ⬜ eBay/Amazon/direct connectors

## Known limitations
- Delivery cost is known only for the feed's home country; other destinations show no total (by design, nothing is guessed).
- Admin login is a single shared password until Supabase Auth roles arrive.
- Not run here: `npm install`, `next build`, ESLint, a real Awin download and real Supabase (no network access in the build sandbox).
