# PriceViva Phase 2 — implementation review

This is the historical Phase 2 snapshot. The subsequent local department proposal and latest verification are in `docs/DEPARTMENT_STRUCTURE_REVIEW.md`.

Prepared 28 October 2026 from GitHub commit `d655b2573ce876f68dd20e0be590d19f90956d6f`.

Implemented locally. No push, deployment, production connection, production SQL, catalog cleanup, deletion, or bulk data correction was performed. The existing department and shop-category definition files are unchanged.

## Behavior changes

- Specific product contexts and leaf categories take priority over broad ancestor words. Makeup blenders, EcoTools, Nivea cream, kitchen blenders, meat grinders, Swedish microwaves, socks, children's clothing, pet food, and garden tools have regression coverage.
- All 18 previously unassigned automatic subcategories now have rules using existing slugs. Combined headings such as “Shoes & Bags” do not arbitrarily select one subcategory when the product is unspecified.
- Matching fallback keys include condition and pack evidence, plus size/color. A used listing cannot reuse a new variant merely because its retailer listing ID stayed the same.
- Explicit pack counts come from `multipack`, `pack_quantity`, or unambiguous title forms such as `2-pack` and `pack of 3`. Missing is unknown, not one. Invalid or contradictory counts stay retailer-specific, retain the offer, and generate a warning.
- MPN matching separates known different pack counts and known versus unknown packs. Compatible same-pack products can match across retailers. GTIN matches with contradictory known pack counts split and receive a deduplicated open review.
- Legacy source keys are reused only when condition, pack state, and known size/color are compatible. Legacy clients omitting the optional pack fields remain accepted; old unknown-pack MPN keys are retained. No existing identity keys are bulk-renamed.
- Manual category provenance is retained on variants. Another retailer's automatic guess cannot overwrite established manual authority. Explicit admin category updates use provider/offer category scope, including later retailers on shared variants. Explicit manual null values also remain authoritative.
- Pack labels are shown in variant labels. Attribute enrichment refreshes labels before search documents are refreshed.
- Offers retain their IDs on condition/pack changes. Price observations retain their original variant context, so earlier single-pack/new-condition prices are not presented as observations for a new pack/condition. No price observations are deleted.

## Changed files

| File | Change |
|---|---|
| `src/lib/importers/categories.ts` | Context, leaf, product and broad-rule classification; Swedish terms; 18 missing subcategory assignments. |
| `src/lib/importers/normalize.ts` | Conservative pack-count parsing and uncertainty detection. |
| `src/lib/importers/awin/map-row.ts` | Pack evidence, warnings and displayed pack labels. |
| `src/lib/importers/types.ts` | Optional pack fields, compatible with older clients. |
| `supabase/migrations/20261028120000_condition_pack_matching.sql` | **Draft only**: additive schema, matching/category/history function replacements and permissions. |
| `supabase/apply/priceviva_apply_all.sql` | Regenerated consolidated SQL containing the draft migration. Do not execute before separate approval. |
| `tests/categories-regression.test.ts` | Category collisions and all 18 missing-subcategory fixtures. |
| `tests/pack-quantity.test.ts` | Known, missing, invalid, contradictory and non-pack numeric evidence. |
| `tests/matching-memory.test.ts` | 21 isolated PostgreSQL tests, including the actual importer/SQL path. |
| `tests/helpers/memory-catalog.ts` | In-memory PostgreSQL setup using all migrations and additive migration replay. No network connection. |
| `tests/importer.db.test.ts` | Updated expected conflict-fallback identity format. |
| `package.json` | PGlite development/test dependency. |
| `package-lock.json` | Lock entry for that test dependency; existing dependency entries preserved. |
| `docs/PHASE_2_REVIEW.md` | This review and approval boundary. |

## The 18 subcategories

`phones/accessories`, `computers-gaming/tablets`, `kitchen/kitchen-accessories`, `home/furniture`, `home/decor`, `sports/sports-accessories`, `fashion/mens`, `fashion/womens`, `shoes-bags/shoes`, `shoes-bags/bags`, `beauty/makeup`, `beauty/fragrances`, `beauty/skin-care`, `automotive/vehicles`, `automotive/motorcycles`, `jewelry-watches/watches`, `jewelry-watches/jewellery`, `jewelry-watches/sunglasses`.

No new departments or subcategory slugs were created.

## Verification

| Check | Result |
|---|---|
| Unmodified baseline full suite | 145 total: 115 passed, 0 failed, 30 skipped. |
| Final full suite | **215 total: 185 passed, 0 failed, 30 skipped.** |
| New PostgreSQL tests | **21 passed**, using PGlite 0.5.12 / PostgreSQL 18.6 in memory. |
| Type checking | Passed: `npm run typecheck`. |
| Lint | Passed: `npm run lint`. |
| SQL bundle consistency and safety checks | All 4 existing bundle tests passed within the full suite. |
| Department/shop definitions | Byte-for-byte unchanged from the baseline. |
| Patch/whitespace | `git diff --check` passed. Patch application also verified against a clean baseline. |
| Production build | **Not validated**: the runtime reports `ENOENT: uv_resident_set_memory` during Next.js webpack build. No completed BUILD_ID was produced. |
| Production database/catalog | Not accessed or changed. |

The full suite was run with `node --import tsx --test tests/*.test.ts`. This runs the same test file set as `npm test` without the tsx CLI's named-pipe listener, which this sandbox does not permit. The project's existing npm test command is unchanged.

The 30 skipped tests are the existing psql-backed importer/account integration tests, which require a local native PostgreSQL target through `PA_TEST_PG`. They were not pointed at Supabase. The new database tests execute the SQL functions using the PostgreSQL engine in WebAssembly; they do not replace native PostgreSQL/Supabase acceptance testing or multi-session concurrency testing.

## Draft migration and compatibility

The migration adds nullable `variants.pack_quantity`, `variants.manual_category_mapping_id`, `offers.source_category`, and `price_observations.variant_id`, plus an observation lookup index. It replaces existing matching, manual-category, reference-price and history-read functions and retains their permission boundaries.

There is no install-time catalog rewrite or bulk backfill. On future imports, a listing transition tags previously untagged observations with that offer's last known variant before reassignment, then records the new variant's price. If a listing had already been incorrectly reassigned before this release, its full historical context may be unrecoverable; this migration does not claim to reconstruct it.

The draft was applied and replayed only inside disposable in-memory test databases. **It has not been applied to production.** The regenerated “apply all” file includes this draft and must not be pasted into Supabase without separate approval.

After approval, the database migration must precede the new importer code. The old database function silently ignores extra pack fields, so deploying the importer alone would not provide the SQL matching protection. Reverting code should not drop the new columns or history context.

## Remaining issues and limits

- The native PostgreSQL/Supabase test suite and production build still need verification in a suitable environment before deployment approval.
- Existing misclassified or incorrectly grouped production records remain untouched. Read-only diagnostics and separately approved corrections are still required.
- Missing pack metadata cannot establish equality. Ambiguous volume/configuration expressions such as `2 x 500 ml`, capacity, keyboard layout and memory/storage are not guessed as pack counts. Unknown-pack MPN matches still depend on the supplied model/color/size/condition; missing configuration data can require review.
- Known-pack imports can conservatively create a new variant instead of reusing an old unknown-pack MPN/source variant. Old variants and observations are retained; no cleanup or automatic merge is included.
- Conflicting manual mappings on a shared variant retain established authority until an explicit admin category update chooses otherwise. Mapping rows themselves are preserved.
- Parent synchronization protects conflicting manually classified siblings and explicit manual clears. A comprehensive policy for mixed automatic sibling categories, retailer parent-ID reuse, and cross-retailer family reconciliation remains outside this focused change.
- The original cumulative category counter behavior remains unchanged. Broad brand/model/color synonym normalization and historical identity reconciliation remain audit follow-ups.
- Advisory/row locks protect identity resolution, but true multi-session deadlock/race and native-version behavior have not been verified by the single-process in-memory tests.

## Review and approval boundary

The delivery includes a unified patch, the changed files, and test logs. It does not include credentials, node_modules, a database, or build output. It targets the audited baseline; verify any local uncommitted changes before applying it.

`git apply --check priceviva-phase2.patch` previews compatibility without changing files. Applying the patch locally does not deploy code or execute a migration. On Windows, use `npm.cmd ci` and `npm.cmd test` for local verification when ready.

**Awaiting separate approval before any GitHub push, deployment, production SQL, migration application, or production data correction.**
