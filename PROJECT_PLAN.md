# PriceViva — Project plan

Status as of 2026-10-25: **v0.6 built** (`priceviva-v0.6.zip`). It adds real locations (Kalmar), local store offers, the split Global Compare, 10 currencies, price history, browser price alerts, photo/barcode search, English + Swedish interface (German/Thai beta), and an account export/import path. **Blocked on external accounts:** sign-in, email alerts, real retailer and store data.

| Phase | Goal | Status |
|---|---|---|
| 0 — Planning | Architecture, data model, risks, costs | ✅ Done |
| 1 — Mall prototype | Demo mall, search, compare, local radar, demo labels | ✅ Done (kept as demo mode) |
| 2 — Functional MVP | Supabase schema + RLS, secure admin, imports, normalised offers, FX | ✅ Built (needs your Supabase project) |
| 2b — Free test mode | DummyJSON sample products + sample offers | ✅ Done (v0.3) |
| 2c — PriceViva redesign | Brand, design system, homepage, category pages, feature pages | ✅ Done (v0.4) |
| 2d — v0.5 review build | Audit, homepage, product images, Local Deal Radar | ✅ Done, waiting for your review |
| 2e — v0.6 | Location + Local Deal Radar, Global Compare, data trust, price history, alerts, photo/barcode search, currencies + languages, design consistency, QA | ✅ Done (accounts and email blocked — see below) |
| 3 — Live authorised data | First approved Awin feed, scheduler, matching review, affiliate redirects | 🟡 Code complete; **blocked on your Awin approval + keys** |
| 4 — Accounts & locality | Supabase Auth, saved areas on login, verified stores/promotions | ⛔ Needs Supabase Auth + email provider (docs/ACCOUNTS.md); store data needs merchants. Map + local-offer database functions are built |
| 5 — Alerts & history | Price history charts, price-drop alerts | ✅ in the browser · ⛔ email alerts need accounts, an email provider and a scheduler |
| 6 — AI concierge | Grounded assistant | Planned |
| 7 — Merchants & revenue | Merchant portal, commission reports | Planned |
| 8 — Expansion | More connectors, countries, languages | 🟡 Swedish done; German/Thai beta |

## Your next steps now
1. Run the site on Windows (docs/WINDOWS_POWERSHELL.md) and check that `npm run check` passes (lint and `next build` could not run in the build sandbox).
2. Try Local Deal Radar with Kalmar and your own postcode; set `GEOCODER_CONTACT` first.
3. Decide on the external services in "Decisions needed" — each one is free to start but must be your account.
4. Keep test mode private (DummyJSON images carry no usage rights).

## Decisions needed
- Final hero photography (commissioned shoot, or a licensed stock photo that matches the warm-mall brief).
- Which advertiser feed to test first.
- Supabase project with Auth (for accounts) and an email provider (sign-in links, alert emails) — may cost money.
- Native-speaker review of German and Thai before they lose the "Beta" label.
- Legal review of the affiliate disclosure wording and privacy policy before public launch.
