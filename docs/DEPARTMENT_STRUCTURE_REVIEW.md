# PriceViva — final department proposal and local verification

Prepared 28 October 2026. Continues the completed Phase 2 work from GitHub baseline `d655b2573ce876f68dd20e0be590d19f90956d6f`.

**Status:** implemented and tested locally. Nothing has been pushed or deployed, and no SQL has run against production. All Phase 2 matching, pack and price-history safeguards are retained.

## Decision

Promote **Furniture** to a top-level department with five subcategories: **Sofas & armchairs, Chairs, Tables & desks, Beds & mattresses, Storage furniture**. Its canonical landing is `/departments/furniture`.

Keep **Home & Living** for Lighting, Textiles, Storage/organizers and Decor. Its department slug remains `home`, and its shopper-group URL remains `/shop/home-living`.

No other top-level department is added. The final proposal has **24 departments and 49 subcategories**. Furniture also receives an independent entry in desktop/mobile navigation, homepage categories, footer and product breadcrumbs. The home icon is distinct from the furniture sofa icon. Furniture navigation is translated in English, Swedish, German and Thai.

## Catalog evidence and limits

The existing importer already recognizes furniture and the sample adapter had a furniture category. The repository contains five synthetic armchair fixtures; these now appear under Furniture with their IDs, product URLs and offer IDs unchanged. The fictional demo catalog's duvet cover, lamp and storage boxes remain under Home & Living.

These fixtures establish compatibility, not production demand. No production stock counts, live offer distribution or production mapping inventory were queried. The department decision rests on a clear product taxonomy and an already-supported furniture import path. The prepared `supabase/diagnostics/furniture_department_preview.sql` can quantify real stock and mappings later, after permission to run production diagnostics; it was not executed in production.

## Boundaries and other candidates

| Candidate | Decision and reason |
|---|---|
| Furniture | Promote. Sofas, chairs, tables, beds and wardrobes form a coherent product range separate from lamps, textiles and home accessories. |
| Lighting | Keep under Home & Living. Already has a clear subcategory and filter; no verified range supports an additional top-level split. |
| Appliances | Keep within Kitchen & Appliances. Larger-appliance stock has not been verified; another department would currently overlap an existing one. |
| Household & Cleaning | Keep under Groceries & Household. The cleaning subcategory is already available; splitting it without a catalog inventory would risk thin pages. |
| Office furniture | Use Furniture/Chairs and Furniture/Tables & desks. Office remains available for stationery and office supplies. |
| Garden furniture | Keep in Garden. Outdoor furniture should not be duplicated between Garden and Furniture. |
| Camping chairs and beds | Keep in Outdoors/Camping. Product use matters more than the word “chair” or “bed.” |
| Baby cots and pet beds | Keep in Baby & Kids and Pets respectively. |
| Used/refurbished furniture | Existing non-new classification policy remains unchanged: automatic imports use Second-hand & Refurbished; manual mappings remain authoritative. |

Desk/table lamps, chair covers/cushions, table runners and bed sheets remain home accessories, not furniture. Gaming chairs/desks and office chairs/desks are furniture. These boundaries have regression tests. Related-product selection also scopes the reused `storage` subcategory by department, so furniture storage does not mix with home organizers.

## Proposed final structure

| Department | Slug | Subcategories |
|---|---|---|
| Electronics | `electronics` | Headphones; Speakers; TVs; Smart home |
| Phones & Accessories | `phones` | Smartphones; Chargers & power; Cases; Accessories |
| Computers & Gaming | `computers-gaming` | Laptops; Tablets; Monitors; Gaming gear |
| Kitchen & Appliances | `kitchen` | Coffee machines; Cookware; Small appliances; Kitchen accessories |
| Home & Living | `home` | Lighting; Textiles; Storage; Decor |
| Furniture | `furniture` | Sofas & armchairs; Chairs; Tables & desks; Beds & mattresses; Storage furniture |
| Sports & Fitness | `sports` | Fitness equipment; Running; Sports wearables; Sports accessories |
| Outdoors | `outdoors` | Camping; Hiking; Cycling |
| Groceries & Household | `groceries` | Pantry; Coffee & tea; Cleaning |
| Second-hand & Refurbished | `refurbished` | Refurbished phones; Refurbished computers |
| Fashion | `fashion` | Men; Women |
| Shoes & Bags | `shoes-bags` | Shoes; Bags |
| Beauty | `beauty` | Make-up; Fragrances; Skin care |
| Toys & Games | `toys` | — |
| Baby & Kids | `baby-kids` | — |
| Automotive | `automotive` | Vehicles; Motorcycles |
| DIY & Tools | `diy-tools` | — |
| Garden | `garden` | — |
| Pets | `pets` | — |
| Books & Education | `books` | — |
| Office | `office` | — |
| Jewelry & Watches | `jewelry-watches` | Watches; Jewellery; Sunglasses |
| Health & Wellness | `health` | — |
| Travel Accessories | `travel` | — |

The shopper-facing navigation groups remain separate from the underlying departments. Fashion groups Fashion, Shoes & Bags and Jewelry & Watches; Electronics groups Electronics, Phones & Accessories and Computers & Gaming; Sports & Outdoor groups Sports & Fitness and Outdoors; Kids & Baby groups Baby & Kids and Toys & Games; Cars & DIY groups Automotive and DIY & Tools. Furniture is independent. Books & Education, Office and Second-hand & Refurbished remain available through More departments / All departments.

## URLs, search and SEO

- `/departments/furniture` is the canonical furniture landing. `/shop/furniture` permanently redirects there; all new internal furniture links point directly to the canonical URL.
- `/departments/home?sub=furniture` permanently redirects to Furniture, preserving pagination and other query values.
- `/search?dept=home/furniture` permanently redirects to the equivalent Furniture filter, preserving search text, condition, price and pagination values.
- Existing `/departments/home`, `/shop/home-living` and every product slug remain valid.
- Search, exact-barcode filtering, catalog lists, saved-product reads, details, breadcrumbs and department counts consistently expose the effective category. Exact-barcode searches now honor department/condition constraints too.
- The sitemap offers populated canonical department/shop landings only while the existing owner-controlled live-indexing gate is enabled. Empty departments and the duplicate `/shop/furniture` alias are excluded.
- Old generic furniture records appear in **All Furniture**. Granular types are assigned to new or reimported automatically classified products; an old manual generic classification is not guessed into a new subtype.

## Database compatibility and approval boundary

`supabase/migrations/20261028140000_furniture_department.sql` is a **draft**. It adds a private deterministic category alias helper and an expression index, then replaces public catalog read functions to use the effective category. It performs no product, offer, price-history or manual-mapping row rewrite.

Stored `home/furniture` values remain intact, including manual mappings. Their public equivalent is Furniture with no invented subtype. Other categories, including `home/storage`, keep their existing meaning. Admin forms display the equivalent new choice; a future explicit save retains the existing mapping identity. Phase 2's observation-context and manual-authority protections remain in the replaced JSON reader.

The SQL bundle was regenerated and tested. Both draft migrations must be reviewed and applied in order **before** deploying the importer/taxonomy code. Deploying only the front end would leave old SQL list/count filters unaware of Furniture. No migration or consolidated SQL should be run without separate approval.

## Test results

| Check | Result |
|---|---|
| Full test suite | **252 tests: 222 passed, 0 failed, 30 skipped.** |
| In-memory PostgreSQL | **27 tests passed:** 21 Phase 2 matching/history cases plus 6 taxonomy/database compatibility cases. |
| Structure/navigation/URL/SEO and boundary tests | Passed, including all 24 department references, five unchanged sample product identities, legacy links and new furniture subcategories. |
| Existing sample repository tests | Passed with Furniture filtering, related armchairs and Home exclusion. |
| Type checking | Passed. Also passed within the final production build. |
| Lint | Passed. |
| SQL bundle checks | All four existing checks passed, including migration ordering and function/permission lists. |
| Production webpack build | **Completed:** compiled successfully, TypeScript passed, static pages generated and `.next/BUILD_ID` produced. See environment qualification below. |
| Native PostgreSQL validation | **Blocked, not passed.** See below. |

The suite command was `node --import tsx --test tests/*.test.ts`, the same test file set as the existing npm test script, without the tsx CLI's sandbox-incompatible named-pipe listener.

### Build environment qualification

This runtime omits the process-memory interface required by Node's RSS telemetry (`ENOENT: uv_resident_set_memory`). A **local, non-shipping adapter** supplies V8 heap statistics and getrusage's real peak RSS only when that particular telemetry lookup is unavailable. With it, `next build --webpack` completed against the final code. Application code and Next.js dependencies were not patched to suppress compilation errors. The adapter and build transcript are supplied under `verification/` for transparency.

The standard build command and default Turbopack compiler should still be checked in the intended deployment environment. The completed webpack build is a qualified local production-build result, not a claim that the runtime limitation has disappeared.

### Native PostgreSQL limitation

A native PostgreSQL 18.4 binary is available and its version command succeeds. `initdb` refuses to run as root. This sandbox also rejects switching to the existing unprivileged user with `setresuid: Invalid argument`. No native cluster was initialized and no system user was created. The 30 existing psql-backed importer/account tests therefore remain skipped. The separate in-memory PostgreSQL 18.6 tests execute and replay the actual migration drafts, but do not validate native networking, Supabase configuration or multi-session concurrency.

Native PostgreSQL/Supabase acceptance testing remains a pre-deployment task in a suitable local environment. No deployment approval is requested while this remains unresolved.

## Changed files and delivery

This delivery is cumulative: it includes the completed Phase 2 implementation plus the department refinements. `changed-files.json` lists every changed file and checksum. A unified patch targets the original audited GitHub commit. The patch has been checked and applied to an isolated clean baseline, then compared byte-for-byte with the tested working copy.

The additional work covers department/navigation data, furniture classification, sample/live adapters, comparison aliasing, legacy redirect helpers, canonical URLs, the sitemap, admin form compatibility, four translation dictionaries, preview icon/redirect shims, a migration draft, its SQL bundle/function list, regression tests and this review. Product identities and prices are retained.

No production data corrections, commits to GitHub, deployment or production SQL execution are included. Approval is still required before any of those actions.
