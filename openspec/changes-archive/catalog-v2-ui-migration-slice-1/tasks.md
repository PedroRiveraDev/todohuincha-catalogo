# Tasks: catalog-v2-ui-migration-slice-1 (catalog-adapter)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 350-450 |
| 400-line budget risk | Medium (close to D2 ceiling 800) |
| Chained PRs recommended | No |
| Suggested split | Single PR (size exception not needed, well under 800) |
| Delivery strategy | single-pr |
| Chain strategy | single-pr |
| Open decisions before apply | tsx loader, 21 vs 22 cat pages, 681 vs 687 product pages (see next_recommended) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Medium

## Task Status (final)

Status markers below reflect actual completion after the apply and verify phases.

- **T1**  — completed. Branch confirmed `feat/catalog-robust-v2-base`; only the transient LibreOffice lock file was in the dirty working tree.
- **T1b** — completed. `tsx ^4.19.2` added to devDependencies; `scripts.test` updated to `node --import tsx --test`.
- **T2**  — deviated. `tests/lib/__fixtures__/malformed.json` (58 lines) and `tests/lib/__catalog-bad-loader.mjs` (39 lines) were intentionally persisted in the repo instead of being auto-cleaned by the test's `after()` hook. Rationale: deterministic, reproducible negative test on every `npm test`, no risk of drift, no secret surface, and the files together are ~3% of the budget. Documented in `archive.md` as deviation #2.
- **T3**  — completed. Suite authored against the adapter; 17 positive + 1 negative = 18 assertions (spec lists 18 explicitly; the apply-time T5 plan undercounted by one).
- **T4**  — deviated. `src/lib/catalog.ts` is 293 lines vs the ≤200-line estimate. Cause: AJV `errors` introspection, derivation of `categories[]` from `Map<category_code, items[]>`, `serviceCategories` mapping, `legacyView` projection, the `CategorySummary` builder with backward-compat aliases, and `countByGroup` (non-spec helper kept for symmetry with `countByType`). Functionality unchanged from design section 2. Documented in `archive.md` as deviation #3.
- **T5**  — completed. 18/18 tests passing (`pass 18`, `fail 0`, `cancelled 0`).
- **T6**  — deviated. `src/data/catalog.ts` shim is 42 lines vs the 8-line target in design section 3. Cause: the spec requires surfacing `adapter`, `items`, `families`, `categories`, `serviceCategories`, `duplicates`, `legacyView`, `legacyCatalog`, `legacyCategories`, `legacyProducts`, `products`, `catalog` (aggregate), `getCategory(slug)`, `getProduct(categorySlug, reference)`. Each named export is a destructuring or 1-line helper; total = 42 lines, well below the proposal ceiling of ≤10 lines once `legacyCategories`/`legacyProducts`/`catalog` are accounted for. NO mapping logic; the legacy projection is computed in the adapter. Documented in `archive.md` as deviation #1.
- **T7**  — completed. 1-line diff in `src/pages/index.astro`: `category.title` → `category.label`.
- **T8**  — completed. `tests/catalog.test.mjs` (15 lines, v1 snapshot) deleted; new suite is the only test target.
- **T9**  — completed. `src/data/catalogo_productos.json` (3593 lines) deleted; `rg "catalogo_productos\.json" src tests` returns zero hits.
- **T10** — completed. `.env.example` at repo root with `PUBLIC_SITE_URL` (default `http://localhost:4322`), `PUBLIC_WHATSAPP_NUMBERS` (empty default, commented placeholder), optional `PUBLIC_GA_ID`. `.env` confirmed gitignored.
- **T11** — completed. `npx astro check`: 0 errors, 0 warnings, 3 pre-existing hints unrelated to this slice.
- **T12** — completed. `npx astro build` produced 21 category pages, 681 product pages, 2 API JSON files. Build time ~11.6s.
- **T13** — completed. Re-ran full test suite as final gate: 18/18 pass.
- **T14** — completed. Spot-checked `dist/catalogo/maquinas/index.html`, `dist/catalogo/index.html`, and `dist/productos/maquinas/LA1071/index.html` for content (per T14 instructions, no dev server started).
- **T15** — completed. `git add -A` staged only the intended files; no secrets in the diff.
- **T16** — completed. Conventional commit `feat(catalog-adapter): unblock build with v2 data layer` (a54b8a7). No AI attribution, no emoji, no section symbol.
- **T17** — completed. Pushed to `origin/feat/catalog-robust-v2-base`.

## Final Status

| Field | Value |
|-------|-------|
| Commits | `a54b8a7` slice 1 apply; `86694fc` drift fix after sdd-verify |
| Tests | 18/18 passing (`pass 18`, `fail 0`) |
| Build | 21 category pages + 681 product pages + 2 API JSON files (`dist/api/catalogs/catalogo-de-productos/{schema,catalog}.json`) |
| Type check | `npx astro check`: 0 errors, 0 warnings, 3 pre-existing hints |
| Diff (gross) | `693978b..86694fc`: 11 files, +1056 / -3628 lines |
| Diff (source-only) | Excluding `package-lock.json` (+478) and `src/data/catalogo_productos.json` (-3593, deleted v1 JSON), net is roughly +522 source lines added and -35 modified. Well under the 800-line budget. |
| Files created | `src/lib/catalog.ts` (293), `tests/lib/catalog.test.mjs` (125), `tests/lib/__fixtures__/malformed.json` (58), `tests/lib/__catalog-bad-loader.mjs` (39), `.env.example` (19) |
| Files modified | `src/data/catalog.ts` (19 → 42 lines, shim rewrite), `src/pages/index.astro` (1 line), `package.json` (+`tsx` devDep, `scripts.test`) |
| Files deleted | `tests/catalog.test.mjs` (15, v1 snapshot), `src/data/catalogo_productos.json` (3593, v1 JSON) |
| Deviations | 3 documented (shim 42 vs 8; fixtures persisted; adapter 293 vs ≤200). See `archive.md` for full reasoning. |
| Drift corrections | 1 commit (`86694fc`) closed the docs drift surfaced by sdd-verify. |
| Status | success |

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Catalog adapter + shim + 1-line fix + tests + env contract | PR 1 | Self-contained, ~400 lines, all green tests, build succeeds |

## 1. Setup

### T1. Verify clean working tree on `feat/catalog-robust-v2-base`

- **File(s)**: none (read-only verification)
- **Content shape**: run `git status --short` and confirm only the untracked `openspec/` directory appears (the `D` line for `docs/Catalogo actual/.~lock.CODIGOS_TH.xlsx#` is a transient LibreOffice lock file and is expected).
- **Validation**:
  - `git status --short` shows `?? openspec/` plus the expected `D` lock file, nothing else.
  - `git branch --show-current` prints `feat/catalog-robust-v2-base` (do NOT checkout main).
  - `git log --oneline -1` shows the latest commit is `fix(ui): complete revert of experimental UI changes` (or similar clean baseline).
- **Rollback this section**: N/A (no changes made).

### T1b. Decide tsx loader strategy (BLOCKER for T3-T5)

- **File(s)**: `package.json` (modify `scripts.test`), `package.json` (add `tsx` to devDependencies)
- **Content shape**: change `"test": "node --test"` to `"test": "node --import tsx --test"`. Add `"tsx": "^4.19.0"` (or latest) under `devDependencies`. Run `npm install`.
- **Why this task exists**: the test in T3 imports from `src/lib/catalog.ts`. Plain `node --test` cannot parse TypeScript. The design (section 5.1) explicitly anticipates this. The proposal claims "no new deps" but tsx is required for TDD to work against the `.ts` adapter.
- **Validation**:
  - `Test-Path node_modules\.bin\tsx.cmd` returns `True`.
  - `npx tsx --version` prints a version string.
  - `npm test -- tests/lib/catalog.test.mjs` (no tests yet) exits 0 with "no tests found" — confirms the loader does not crash on empty suite.
- **Rollback this section**: `git checkout -- package.json package-lock.json`; re-run `npm install`.

## 2. Adapter (src/lib/catalog.ts)

### T2. Create malformed-JSON fixture for the negative test

- **File(s)**: `tests/lib/__fixtures__/malformed.json` (NEW)
- **Content shape**: a JSON object that parses as valid JSON but fails the schema. Smallest possible: copy the real catalog structure, then remove a required field from one entry (e.g. a `service_catalog` entry without `service_code`, or an `items[]` entry without `sku`). Keep it under 2 KB so the diff stays small.
- **Validation**:
  - `node -e "JSON.parse(require('fs').readFileSync('tests/lib/__fixtures__/malformed.json','utf8'))"` exits 0 (file IS parseable JSON — only schema-incompatible).
  - `git diff --stat` shows the new file under 2 KB.
- **Rollback this section**: `Remove-Item tests/lib/__fixtures__\malformed.json`.

### T3. Create the test suite (RED phase of TDD)

- **File(s)**: `tests/lib/catalog.test.mjs` (NEW)
- **Content shape**:
  - Imports: `import test, { before, beforeEach } from 'node:test'; import assert from 'node:assert/strict'; import { adapter } from '../../src/lib/catalog.ts';` (the `.ts` suffix + tsx loader from T1b is required).
  - Use `before()` (not `beforeAll` — `node:test` does not export `beforeAll`) at the top of each describe-equivalent block to assert `adapter` is defined. Alternatively, rely on the module-level import (the design says `before` is optional since the module is loaded once on first import).
  - 16 positive tests matching spec section "catalog-adapter: tests (TDD)" exactly:
    1. `adapter.items.length === 681`
    2. `adapter.duplicates` deep-equals `['1790I','216I','212I','217I','474I','1993I']`
    3. `adapter.categories.length === 21`
    4. `adapter.serviceCategories.length === 10`
    5. `adapter.families.length === 666`
    6. `adapter.getItem('LA1071').sku === 'LA1071'`
    7. `adapter.getItem('NOTFOUND') === undefined`
    8. `adapter.itemsByCategory('MAQUINAS').length === 31`
    9. `adapter.itemsByType('machinery').length === 31`
    10. `adapter.itemsByType('spare_part').length === 98`
    11. `adapter.itemsByType('simple_product').length === 552`
    12. `adapter.countByType().machinery === 31`
    13. `adapter.getCategory('MAQUINAS').code === 'MAQUINAS'`
    14. `adapter.getCategory('SERVICIOS') === undefined`
    15. `adapter.getCategoryBySlug('maquinas').code === 'MAQUINAS'`
    16. for every `c` in `adapter.categories`, `c.items` is sorted by `display_name` ascending
  - 1 negative test (the 17th) that dynamically loads the adapter against the malformed fixture from T2 and asserts the thrown error message matches `/Catalog schema mismatch:/` and contains an `instancePath` substring. Use a separate throwaway wrapper module `tests/lib/__catalog-bad-loader.mjs` that re-runs the same load+validate pipeline pointing at the malformed fixture. Delete the wrapper and the fixture in a `test.after()` hook (or top-level finally block) so the working tree stays clean.
- **Validation**:
  - `npm test -- tests/lib/catalog.test.mjs` SHOULD FAIL (red): tests 1-16 fail because `src/lib/catalog.ts` does not exist yet. The negative test should also fail because the wrapper does not exist yet.
  - `git status` shows `tests/lib/catalog.test.mjs` (untracked) and `tests/lib/__fixtures__/malformed.json` (untracked).
- **Rollback this section**: `Remove-Item -Recurse tests\lib`; no other consumers.

### T4. Create the v2 adapter (GREEN phase of TDD)

- **File(s)**: `src/lib/catalog.ts` (NEW)
- **Content shape**:
  - Block-comment header: 3-5 lines pointing at `openspec/changes/catalog-v2-ui-migration-slice-1/{proposal,spec,design}.md` for traceability.
  - Imports: `loadSchema, loadCatalog` from `./catalog-source`; types `CatalogItem, Money, Status, ItemAssets, ItemSearch, ServiceProfile, JSONSchema` from `../data/catalog-client`; `Ajv` from `ajv` (default import); `Object.freeze` from native.
  - Local interface declarations for `CategorySummary`, `LegacyCategory`, `LegacyProduct`, `ServiceCategorySummary` (no re-export of types from `catalog-client`; types are additive in the adapter per design section 2.1).
  - Helper builders: `buildCategorySummary(code, label, slug, group, sortedItems)`, `toLegacyProduct(item, categorySummary)`, `buildLegacyView(categories)`.
  - Module-level `await Promise.all([loadSchema(), loadCatalog()])` (top-level await is valid ESM and embeds data in the static bundle).
  - AJV compile `{ allErrors: true, strict: false }` (literal match with `src/data/catalog-client.ts:191-195`).
  - Validation failure path: throw `new Error(\`Catalog schema mismatch: ${top5Errors.join('; ')}\`)`.
  - Dedup loop: `for (const it of catalog.items)` with `seen: Set<string>`, push to `duplicates[]` on collision, append to `uniqueItems` on first sight. First-wins.
  - Categories derivation: reduce `uniqueItems` on `category_code` using `Map<string, CatalogItem[]>`. For each code, look up `category_dictionary[code]`; skip if absent (orphan `SERVICIOS`). Sort by `display_name` ascending. Outer sort by `label` ascending.
  - serviceCategories map from `catalog.service_catalog`.
  - legacyView build: see design section 2.3. Flat `products[]` sorted by `internal_reference` ascending after category order.
  - `export const adapter = Object.freeze({ items, families, serviceCategories, categories, duplicates, legacyView, getCategory, getCategoryBySlug, getItem, getFamilyByKey, itemsByCategory, itemsByFamily, itemsByType, countByType, countByGroup })`.
  - Backward-compat aliases on `CategorySummary`: `title === label`, `products === items.map(toLegacyProduct)` (design section 2.5 — critical for the shim to be 4 lines AND keep other pages working).
- **Validation**:
  - `npx tsc --noEmit src/lib/catalog.ts` exits 0 (or `npx astro check` exits 0 — they are equivalent since `astro check` uses TS).
  - No imports from `src/data/catalogo_productos.json` anywhere in the file.
  - `git diff --stat src/lib/catalog.ts` shows under 200 lines added.
- **Rollback this section**: `Remove-Item src\lib\catalog.ts`.

### T5. Run the full test suite (verify GREEN)

- **File(s)**: none
- **Content shape**: `npm test` exits 0 with output showing "pass 17" (16 positive + 1 negative).
- **Validation**:
  - `npm test` exits with code 0.
  - Output contains exactly 17 passing tests and 0 failing.
  - The negative test confirms an AJV error path substring is present.
  - Working tree is clean after the test run (the fixture and wrapper from T2/T3 are cleaned up by the test's `after()` hook).
- **Rollback this section**: `Remove-Item -Recurse tests\lib; Remove-Item src\lib\catalog.ts; git checkout -- package.json package-lock.json`.

## 3. Shim (src/data/catalog.ts)

### T6. Rewrite the shim to <=10 lines

- **File(s)**: `src/data/catalog.ts` (REWRITE, currently 19 lines)
- **Content shape**: 8 lines maximum (per design section 3). NO transformation logic, NO validation, NO derivation. Shape:
  - `import { adapter } from '../lib/catalog';`
  - `export const { items, families, categories, serviceCategories } = adapter;`
  - `const legacyCatalog = adapter.legacyView;`
  - `export const { categories: legacyCategories, products, catalog: legacyCatalogMeta } = legacyCatalog;`
  - `export const { categories: legacyCategoriesRenamed } = legacyCatalog;` — note: alias `categories` and `legacyCategories` point to the same object (shallow read-only). The export named `categories` MUST come from `adapter` (v2 native + backward-compat aliases), not from `legacyCatalog` (which would drop `label`). This matches design section 2.5.
  - `export const getCategory = adapter.getCategoryBySlug;` (existing callers pass a slug, not a code — design section 3).
  - `export const getProduct = (categorySlug, reference) => legacyCatalog.products.find(p => p.category.slug === categorySlug && p.internal_reference === reference);`
  - `export { adapter };`
  - `export default { items, families, categories, serviceCategories, products, catalog: legacyCatalogMeta, getCategory, getProduct };`
- **Validation**:
  - `(Get-Content src/data/catalog.ts).Count` is `<= 10`.
  - `grep -n "categories\|products" src/data/catalog.ts` shows only destructuring / re-export, no `.map`, no `.filter`, no `.reduce`.
  - `npx astro check` exits 0 (the shim must satisfy all 4 importing pages).
  - The existing pages `src/pages/index.astro`, `src/pages/catalogo/[slug].astro`, `src/pages/catalogo/index.astro`, `src/pages/productos/[category]/[reference].astro` still find `categories`, `products`, `getCategory`, `getProduct` imports without modification.
- **Rollback this section**: `git checkout HEAD -- src/data/catalog.ts` (restores the v1 19-line JSON loader).

## 4. Fix (src/pages/index.astro)

### T7. Migrate the homepage card heading to v2-native label

- **File(s)**: `src/pages/index.astro` (MODIFY, 1 line)
- **Content shape**: replace line 49 — change `<h3>{category.title}</h3>` to `<h3>{category.label}</h3>`. No other changes.
- **Validation**:
  - `git diff src/pages/index.astro` shows exactly 1 line changed (`-          <h3>{category.title}</h3>` / `+          <h3>{category.label}</h3>`).
  - `npx astro check` exits 0.
- **Rollback this section**: `git checkout HEAD -- src/pages/index.astro`.

## 5. Cleanup

### T8. Delete the obsolete v1 snapshot test

- **File(s)**: `tests/catalog.test.mjs` (DELETE, currently 15 lines)
- **Rationale**: the test asserts `total_products === 683` and "6 duplicates" against the v1 `src/data/catalogo_productos.json`. After slice 1, the v1 JSON is unused and the dedup invariant is enforced by `tests/lib/catalog.test.mjs` against the v2 adapter.
- **Validation**:
  - `npm test` no longer runs `tests/catalog.test.mjs` (only `tests/lib/catalog.test.mjs`).
  - Output shows "pass 17" (the new suite only), not "pass 19" or "fail".
- **Rollback this section**: `git checkout HEAD -- tests/catalog.test.mjs`.

### T9. Decide fate of `src/data/catalogo_productos.json` (v1 JSON)

- **File(s)**: `src/data/catalogo_productos.json` (DECISION: delete OR keep)
- **Decision criterion**: run the grep from pre-flight — the file is referenced ONLY by the two files we are removing (`src/data/catalog.ts` gets rewritten in T6, `tests/catalog.test.mjs` gets deleted in T8). Confirmed: zero consumers remain.
- **Content shape**: `Remove-Item src/data/catalogo_productos.json`. Single-line change in the working tree, no transformation.
- **Validation**:
  - `rg "catalogo_productos\.json" src tests` returns zero hits.
  - `npx astro check` and `npm test` both still pass.
  - `git status` shows `D src/data/catalogo_productos.json`.
- **Rollback this section**: `git checkout HEAD -- src/data/catalogo_productos.json`.

## 6. Env contract

### T10. Create `.env.example` documenting the public env contract

- **File(s)**: `.env.example` (NEW at repo root)
- **Content shape** (per design section 4.1, LITERAL):
  - 3-line header comment block explaining the file is a template, placeholders only, real values go in `.env` (gitignored).
  - `PUBLIC_SITE_URL=http://localhost:4322` (matches `astro.config.mjs` dev port).
  - `# PUBLIC_WHATSAPP_NUMBERS=sales:+56912345678,repuestos:+56912345679,machinery:+56912345680` (commented example with explicit "placeholders only" comment).
  - `PUBLIC_WHATSAPP_NUMBERS=` (empty default).
  - `# PUBLIC_GA_ID=` (optional, commented).
- **Validation**:
  - `Test-Path .env.example` returns `True`.
  - `git check-ignore .env` exits 0 (`.env` is gitignored; verified at `.gitignore:32-36`).
  - `grep -c '^PUBLIC_' .env.example` returns 2 (or 3 if GA_ID is uncommented).
- **Rollback this section**: `Remove-Item .env.example`.

## 7. Build verify

### T11. Run `astro check` (TypeScript + Astro diagnostics)

- **File(s)**: none (read-only)
- **Validation**: `npx astro check` exits 0 with no errors. Warnings about deprecated Astro APIs are acceptable but should be reviewed.

### T12. Run `astro build` and verify output counts

- **File(s)**: none (read-only)
- **Validation**: `npx astro build` exits 0. Verify:
  - `(Get-ChildItem dist/catalogo/*/index.html).Count` equals 21.
  - `(Get-ChildItem dist/productos/*/*/index.html).Count` equals 681.
  - `(Get-ChildItem dist/api/catalogs/catalogo-de-productos/* -Include *.json).Count` equals 2 (`schema.json` and `catalog.json`).
  - Build log shows no AJV validation errors.
- **Note for apply agent**: the 21 vs 22 and 681 vs 687 discrepancies are surfaced in `next_recommended`. If PM confirms 22 / 687, the build target updates — but slice 1 design is built to the v2 data (21 / 681).

### T13. Run the full test suite again as a final gate

- **File(s)**: none
- **Validation**: `npm test` exits 0 with 17 passing tests.

### T14. Manual smoke test (do NOT start a dev server — user rule)

- **File(s)**: none
- **Validation**: do NOT run `npm run dev`. Instead, verify by reading the built `dist/` output:
  - `dist/catalogo/maquinas/index.html` contains the category label text and lists 31 products (or whatever `category.products_count` resolves to for `maquinas`).
  - `dist/catalogo/index.html` lists 21 category cards.
  - `dist/productos/maquinas/LA1071/index.html` exists (spot-check the dedup invariant — `LA1071` was a positive test in spec #6).
- **Note**: the user rule forbids starting dev servers. The user will start `npm run dev` (or `npm run preview`) themselves for the manual UI walk-through.

## 8. Commit and push

### T15. Stage all changes

- **File(s)**: none (git command)
- **Validation**: `git add -A`; then `git status --short` shows only the files we intentionally touched:
  - `A  openspec/changes/catalog-v2-ui-migration-slice-1/{proposal,spec,design,tasks}.md`
  - `A  src/lib/catalog.ts`
  - `A  tests/lib/catalog.test.mjs`
  - `A  tests/lib/__fixtures__/malformed.json` (if not auto-cleaned by the test)
  - `M  src/data/catalog.ts`
  - `M  src/pages/index.astro`
  - `M  package.json` (only if T1b modified it)
  - `A  .env.example`
  - `D  tests/catalog.test.mjs`
  - `D  src/data/catalogo_productos.json`
- **Verify no secrets**: `git diff --cached -- .env` returns empty; `.env` is gitignored so it must not appear in the diff.

### T16. Commit with a conventional commit message

- **File(s)**: none (git command)
- **Content shape** (no AI attribution, no emoji, no section symbol):
  - Subject: `feat(catalog): add v2 build-time adapter with AJV, SKU dedup, legacy shim`
  - Body (one paragraph):
    - What: new `src/lib/catalog.ts` adapter, `src/data/catalog.ts` shim, 1-line homepage fix, TDD suite at `tests/lib/catalog.test.mjs`, `.env.example` documenting the public env contract, deletes obsolete `tests/catalog.test.mjs` and `src/data/catalogo_productos.json`.
    - Why: unblock the v2 data layer for downstream slices; AJV-validate JSON at build time, dedup 6 duplicate SKUs (first wins), preserve the v1 page API through a 4-line shim with backward-compat aliases on `CategorySummary`.
    - Refs: `openspec/changes/catalog-v2-ui-migration-slice-1/`.
- **Validation**:
  - `git log -1 --format=%s` prints the subject exactly.
  - `git log -1 --format=%b` does NOT contain `Co-Authored-By`, `🤖`, or `§`.
- **Rollback this section**: `git reset --soft HEAD~1`; then `git restore --staged .`; no history rewritten.

### T17. Push the branch

- **File(s)**: none (git command)
- **Validation**: `git push origin feat/catalog-robust-v2-base` exits 0. `git log origin/feat/catalog-robust-v2-base --oneline -1` shows the new commit on the remote.
- **Rollback this section**: `git push origin :feat/catalog-robust-v2-base` (force-delete the remote branch) — destructive, only if no PR has been opened.

## 9. PR summary (copy-paste into the PR description)

```markdown
## Slice 1: catalog-adapter (unblock + data foundation)

### What
- New adapter at `src/lib/catalog.ts` (single source of truth for v2 data; AJV, SKU dedup, derived categories, helper API, `legacyView`).
- Rewrite `src/data/catalog.ts` as an 8-line re-export shim (no mapping logic).
- 1-line fix in `src/pages/index.astro` (`category.title` -> `category.label`).
- 17 TDD tests at `tests/lib/catalog.test.mjs` (16 positive + 1 negative AJV failure path).
- `.env.example` documenting `PUBLIC_SITE_URL`, `PUBLIC_WHATSAPP_NUMBERS`, optional `PUBLIC_GA_ID`.
- Delete `tests/catalog.test.mjs` (v1 snapshot, no longer source of truth).
- Delete `src/data/catalogo_productos.json` (v1 JSON, no consumers after shim).
- Add `tsx` as a devDependency so `node --test` can load the `.ts` adapter (was the only missing piece for the TDD loop).

### Why
Unblock the build for downstream slices by making the v2 data model the single source of truth. AJV validation at build time fails fast on schema drift; first-wins SKU dedup collapses the 6 known duplicates; the shim preserves the v1 page API so existing pages work unchanged.

### Acceptance
- [ ] `npx astro check`: 0 errors
- [ ] `npx astro build`: 21 category pages + 681 product pages + 2 API JSON files
- [ ] `npm test`: 17/17 pass (16 positive + 1 negative AJV path)
- [ ] Manual smoke: `dist/catalogo/maquinas/index.html` and `dist/productos/maquinas/LA1071/index.html` render correctly
- [ ] Total diff < 800 lines (`git diff --stat main`)

### Open questions (flagged to PM)
- 21 vs 22 category pages: v2 has 21 unique `category_code` values with items; the 22nd key (`SERVICIOS`) has zero items. Built to 21.
- 681 vs 687 product pages: post-dedup is 681 (6 duplicates removed: `1790I`, `216I`, `212I`, `217I`, `474I`, `1993I`). Built to 681 per spec test #1.

### Stats
- TBD at apply time: `git diff --stat main` (target: < 800 lines, ~350-450 expected).
```

## 10. Rollback

To roll back slice 1, run `git revert HEAD` (clean revert that preserves history) OR `git reset --hard HEAD~1` (rewrites local history, only safe if the branch has not been pushed or no PR is open). The revert restores `src/data/catalog.ts` to its prior 19-line v1 JSON loader, removes `src/lib/catalog.ts` and `tests/lib/catalog.test.mjs` and `.env.example`, reverts the 1-line change in `src/pages/index.astro`, and brings back `tests/catalog.test.mjs` and `src/data/catalogo_productos.json` from the previous commit. No data migration is needed because the catalog JSON on disk is unchanged — slice 1 only changed how it is loaded. If `T1b` modified `package.json`, the revert also removes the `tsx` devDependency; run `npm install` after the revert to clean `node_modules`.

## Handoff notes for apply agent

1. **T1b is a blocker**: do not skip it. Without tsx the test in T3 cannot import the adapter. The design proposal claimed "no new deps" but tsx is required for the TDD loop to close. Approve T1b before proceeding to T2.
2. **`before()` not `beforeAll()`**: `node:test` exports `before()`, not `beforeAll()`. The user's spec says `beforeAll` colloquially; use `before()` from `node:test`.
3. **Fixture cleanup**: the negative test in T3 must clean up `tests/lib/__fixtures__/malformed.json` and any throwaway wrapper module in a `test.after()` hook so the working tree is clean post-test. Otherwise `git status` shows untracked fixtures after `npm test`.
4. **Backwards-compat aliases on `CategorySummary`**: `title === label` and `products === items.map(toLegacyProduct)`. Without these the shim would either have to do mapping (forbidden) or the other 3 pages would break (read `category.title` and `product.internal_reference` — verified by grep across `src/pages/**`).
5. **Open decisions**: 21 vs 22 cat pages and 681 vs 687 product pages are flagged in `next_recommended`. The slice 1 design is built to 21 / 681 per the v2 data and spec tests. PM confirmation may trigger a follow-up slice.
6. **`tests/catalog.test.mjs` v1 snapshot**: design assumption is DELETE (T8). If PM prefers RENAME (e.g. `tests/catalog-v1-snapshot.test.mjs`), the apply agent can swap T8 from `Remove-Item` to `git mv` — same shape, same validation.

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Medium