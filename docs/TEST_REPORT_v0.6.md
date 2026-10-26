# PriceViva v0.6 — test report (25 Oct 2026)

All checks below were run in the build workspace on the final code. Checks marked "not run" could not run there; they need your PC.

| Check | Result |
|---|---|
| TypeScript (app + logic projects, strict) | ✅ clean |
| Unit + database tests (`tests/*.test.ts`, Node test runner, PostgreSQL 16) | ✅ 99 / 99 passed |
| Browser — demo mode journeys (`flows.mjs`) | ✅ 25 / 25 |
| Browser — test mode with DummyJSON fixture (`sample-smoke.mjs`), incl. the Kalmar journey | ✅ 30 / 30 |
| Browser — live mode against a real PostgreSQL + PostgREST stand-in (`live-smoke.mjs`) | ✅ 19 / 19 |
| Browser — photo search with real DummyJSON photos (5 queries, no-match case, GIF rejection) | ✅ 12 / 12 |
| Browser — languages: switch, cookie, `<html lang>`, Swedish pages, beta labels, number format (`i18n-smoke.mjs`) | ✅ 17 / 17 |
| Layout — every page at 390 px and 1440 px; languages at 360/390/820/1024 px | ✅ no horizontal overflow, no page errors |
| Header at 820 / 1024 / 1180 / 1280 / 1440 px (English and German) | ✅ nothing outside the viewport |
| `npm install`, ESLint (`npm run lint`), `next build` | ⚠️ **not run**: this workspace cannot reach the npm registry. Run `npm run check` on your PC |
| Live OpenStreetMap place search and map tiles | ⚠️ **not run** live: the sandbox has no internet. The geocoder is unit-tested with recorded responses; tiles were tested with real tiles copied through your browser earlier |

## The 13 user journeys
| # | Journey | Covered by | Result |
|---|---|---|---|
| 1 | Find a product by text search | flows, sample-smoke | ✅ |
| 2 | Pick Kalmar by typing it; header and radar show Kalmar; refresh keeps it | sample-smoke | ✅ |
| 3 | "Use my location" → suggestion only, nothing changes until confirmed | flows, sample-smoke | ✅ |
| 4 | Change radius (5…100 km); it persists | flows | ✅ |
| 5 | Kalmar has no real store offers → honest empty state; demo stores separate | sample-smoke, live-smoke | ✅ |
| 6 | Compare retailer offers for one product (offer table, breakdown) | flows, live-smoke | ✅ |
| 7 | Compare 2–3 products; Remove and Clear all | flows | ✅ |
| 8 | Change currency → converted prices marked ≈, delivery country unchanged | flows, unit | ✅ |
| 9 | Set, pause, edit, delete a price alert; notification appears once | unit (alerts), sample-smoke | ✅ |
| 10 | View price history (enough / not enough data) | unit, sample-smoke | ✅ |
| 11 | Photo search (upload, crop, similar results, no-match) and barcode exact match | photo-test, flows | ✅ |
| 12 | Switch the interface to Swedish and back | i18n-smoke | ✅ |
| 13 | Save favourites; export and import them (account migration path) | flows, unit (portable-data) | ✅ |

## Accessibility and security notes
- **Accessibility:** every control has an accessible name in each language. Dialogs use `<dialog>` with focus and Escape. Map pins are buttons, and the language selector marks each option with its own `lang`.
- **Security:**
  - no secrets in client code;
  - the image proxy is limited to an allow-list of hosts (https only, images only, size and rate limits);
  - the geocoder is rate-limited and cached;
  - imported files and storage are validated with Zod;
  - the locale cookie is validated (unknown values fall back to English).
