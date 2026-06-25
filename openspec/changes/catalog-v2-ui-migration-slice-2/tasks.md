# Tasks: catalog-v2-ui-migration-slice-2 (catalog-landing-ui)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~340 net (4 components ~200 + 2 helpers ~60 + 2 tests ~80 + page rewrite ~200 - 447) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (well under D2 800-line ceiling) |
| Delivery strategy | single-pr |
| Chain strategy | single-pr |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Low

## 1. Setup

- [ ] T1. Verify clean working tree on `feat/catalog-robust-v2-base`: `git status --short` shows only `?? openspec/changes/catalog-v2-ui-migration-slice-2/` (untracked); `git branch --show-current` prints `feat/catalog-robust-v2-base`; do NOT checkout main.

## 2. TDD: whatsapp lib (RED -> GREEN)

- [ ] T2. RED `tests/lib/whatsapp.test.mjs`: `import test from 'node:test'`, ~8 assertions across `parseWhatsAppNumbers(undefined|empty|single|multi|malformed)` (5) + `buildWhatsAppUrl(with+|without+|special-chars)` (3); `npm test` -> FAIL (module missing).
- [ ] T3. GREEN `src/lib/whatsapp.ts`: exports `parseWhatsAppNumbers`, `buildWhatsAppUrl` per design section 2 (split by `,` then `:`, drop malformed, strip leading `+`, `encodeURIComponent` on message); `npm test` -> all 8 + slice 1's 18 pass.

## 3. TDD: categories lib (RED -> GREEN)

- [ ] T4. RED `tests/lib/category-grouping.test.mjs`: ~6 assertions for `CATEGORY_GROUP_ORDER` 8-entry fixed order, `groupCategoriesByGroup` (empty|single|all-21 -> 8 groups), `sortItemsByDisplayName` (empty|basic|locale-aware); `npm test` -> FAIL.
- [ ] T5. GREEN `src/lib/categories.ts`: exports `CATEGORY_GROUP_ORDER` (sierras, consumibles, cuchillos, herramientas, materiales, servicios, maquinaria, instrumentos), `groupCategoriesByGroup`, `sortItemsByDisplayName` per design section 3 (locale `'es'`, `sensitivity: 'base'`); `npm test` -> 32/32 pass.

## 4. Components (no TDD; manual smoke later)

- [ ] T6. Create `src/components/ItemTypeChip.astro`: props `itemType` (`simple_product|spare_part|machinery|service`), optional `itemId`; renders `<span class="cat-row-type type-{itemType}">`; scoped colors per design section 5.3 (machinery=#1f3a8a, service=--orange); aria-label with human label.
- [ ] T7. Create `src/components/CategorySidebar.astro`: props `categories`, `activeSlug`, `totalProducts`; wraps `<aside role="navigation">`; renders 8 sections via `CATEGORY_GROUP_ORDER`; sticky desktop (`top: 24px`), `<dialog>` off-canvas below 768px; NO side-stripe border on `.is-active` (use background tint or full border instead — verification found the prior claimed rule did not exist in Base.astro).
- [ ] T8. Create `src/components/WhatsAppCta.astro`: props `context` (`sales|repuestos|machinery|general`), optional `productName`, `sku`; module-top `parseWhatsAppNumbers(import.meta.env.PUBLIC_WHATSAPP_NUMBERS)`; message per context; fallback `numbers[context] ?? numbers.sales`; disabled `<button>` with copy `Configura PUBLIC_WHATSAPP_NUMBERS en .env`; double-bezel + button-in-button icon; emil easing + `prefers-reduced-motion` guard.
- [ ] T9. Create `src/components/PdfDownloadButton.astro`: props `title`, `subtitle`, `rows: string[]`; owns the ~260-line jsPDF generator from current `index.astro:84-446` (moved verbatim); click handler reads `.cat-row:not(.is-hidden)`; logo fallback chain (`.brand img` -> `/logo-todohuincha.svg` -> vector); imports `jsPDF` from `jspdf`.

## 5. Page rewrite

- [ ] T10. Rewrite `src/pages/catalogo/index.astro`: imports `adapter` from `src/lib/catalog` (bypass shim); computes `allItems`, `groups`, `totalProducts`; hero (eyebrow + h1 + subtitle + search + `PdfDownloadButton`); layout `<CategorySidebar>` + `<main>`; per-section header + `<WhatsAppCta context=groupKey>`; rows with `ItemTypeChip` + name + sku + per-row link; final `<WhatsAppCta context="general" />`; JSON-LD `ItemList` with 681 `ListItem` entries; vanilla JS `<script>` for search (100ms debounce) + sidebar filter; net 447 -> ~200 lines.
- [ ] T11. Verify `.env.example` documents `PUBLIC_WHATSAPP_NUMBERS` with commented example `sales:+56912345678,repuestos:+56912345679,machinery:+56912345680` (slice 1 already created; no edits expected).

## 6. Verify

- [ ] T12. `npx astro check` -> 0 errors.
- [ ] T13. `npm test` -> 32/32 pass (18 slice 1 + 14 slice 2).
- [ ] T14. `npx astro build` -> 21 category + 681 product + 2 API + 1 landing.
- [ ] T15. Manual smoke on `dist/catalogo/index.html`: 8-group sidebar in fixed order; `ItemTypeChip` colored per type; search debounced 100ms; sidebar click filters by category; `WhatsAppCta` shows recipient or disabled state; `PdfDownloadButton` triggers download; JSON-LD block with 681 `ListItem`.
- [ ] T16. `grep` for emoji + section symbol across all 8 new/modified files -> 0 matches.

## 7. Commit and push

- [ ] T17. `git add -A`; verify staged: 8 new files + 1 modified + 5 ops artifacts; no secrets.
- [ ] T18. `git commit` subject `feat(catalog-ui): migrate catalog landing to v2 data model (slice 2)`; body covers what/why/acceptance; NO `Co-Authored-By`, NO emoji, NO `§`, UTF-8.
- [ ] T19. `git push origin feat/catalog-robust-v2-base` (do NOT checkout main).

## 8. PR summary block

```markdown
## Slice 2: catalog-landing-ui (UI migration)

### What
- 2 new lib helpers with TDD: `src/lib/whatsapp.ts`, `src/lib/categories.ts`
- 4 new components: `CategorySidebar`, `ItemTypeChip`, `WhatsAppCta`, `PdfDownloadButton`
- Page rewrite: `src/pages/catalogo/index.astro` 447 -> ~200 lines
- JSON-LD ItemList schema with 681 products for SEO
- 5 design skills applied minimally (emil-design-eng, impeccable, design-taste-frontend, high-end-visual-design, seo-geo)

### Why
Unblock the v2 data layer for the user-facing catalog page. Centralize WhatsApp CTA. Group sidebar by `category_group` for better UX. Add JSON-LD for GEO/AI search engine citation.

### Acceptance
- [ ] `npm test`: 32/32 pass
- [ ] `npx astro check`: 0 errors
- [ ] `npx astro build`: 21 cat + 681 product + 2 API + 1 landing
- [ ] Manual smoke: `dist/catalogo/index.html` renders correctly

### Stats
- N files changed
- N lines added
- N lines removed
```

## 9. Rollback

`git revert <slice-2-merge-commit>` restores the prior 447-line `src/pages/catalogo/index.astro` (flat-sidebar v1-shim version) and deletes the 8 new files. Untouched by revert: `src/lib/catalog.ts`, `src/data/catalog.ts`, `src/components/DownloadPdf.astro`, `.env.example`, slice 1 tests.

## 10. Risks per task

- T1: trivial.
- T2-T3, T4-T5: trivial TDD cycle; tsx loader from slice 1 already in place.
- T6-T9: Astro components not unit-testable with `node:test`; manual smoke on `dist/` is the gate (same pattern as slice 1 T14).
- T10: largest task; verify diff is net negative (-247 lines on the page).
- T11: trivial (slice 1 already created `.env.example`).
- T12-T16: standard verify gates.
- T17-T19: conventional commit only, no `Co-Authored-By`.

## 11. Open decisions flagged for orchestrator

- JSON-LD count: 681 (RESOLVED in design 8.5; spec said 687, post-dedup is 681). Surface to PM if a different count is preferred.
- End-of-list `<WhatsAppCta context="general" />` placement: RESOLVED in design 12.1 as "after all items". Surface to PM if a different copy is preferred.

---

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Low
