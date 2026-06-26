# Tasks: catalog-v2-ui-migration-slice-3 (catalog-detail-ui)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~404 (210 component + 50 helper + 80 tests + 140 page rewrite + 30 Base patch - 306 prior page + 200 docs) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR with `size:exception` justification |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

## 1. Setup

- [x] T1. Verify starting state on `feat/catalog-robust-v2-base`: `git status --short` shows only `openspec/` untracked; `git branch --show-current` prints `feat/catalog-robust-v2-base`; `npm test` exits 0 with 46/46 passing; `npx astro check` exits 0; `npx astro build` produces 21 catalog pages.
- [x] T2. Record HEAD SHA via `git rev-parse HEAD`. Note for the commit step.

## 2. category-meta.ts helper (TDD RED)

- [x] T3. Create EMPTY `tests/lib/category-meta.test.mjs` with 6 placeholder assertions: known slug returns full meta; unknown slug returns fallback without throw; canonicalPath always starts with `/catalogo/`; breadcrumb always has exactly 3 entries; title is human-readable Spanish (no kebab-case); ogImage points to `/logo-todohuincha.svg`. Imports reference `../../src/lib/category-meta.ts` which does NOT exist yet.
- [x] T4. Run `npm test -- tests/lib/category-meta.test.mjs`. Confirm all 6/6 fail (red) with module-not-found or assertion mismatches.

## 3. category-meta.ts helper (TDD GREEN)

- [x] T5. Create `src/lib/category-meta.ts` exporting `getCategoryMeta(slug): CategoryMeta` per design.md section 3. Uses `adapter.getCategoryBySlug`, falls back gracefully for unknown slugs, returns `{ title, description, canonicalPath, ogImage, breadcrumb }`.
- [x] T6. Run `npm test`. Confirm 6/6 new pass; total now 52/52 (46 prior + 6 new).

## 4. CategoryPdfDownloadButton component

- [x] T7. Create `src/components/CategoryPdfDownloadButton.astro` per design.md section 4. Props `{ title: string, subtitle: string, rows: string[] }`. Inline `<style>` scoped CSS, `<script>` with jsPDF click handler (flat single-section row loop, brand-mark fallback chain DOM -> SVG -> vector, auto-pagination when y > 268).
- [x] T8. Verify compilation: `npx astro check` exits 0. Full smoke deferred to T20 once the page imports the component.

## 5. Page composition: adapter swap

- [x] T9. Edit `src/pages/catalogo/[slug].astro`: replace `import { categories } from '../../data/catalog'` with `import { adapter, getCategoryBySlug } from '../../lib/catalog'`; replace `categories.find(...)` with `getCategoryBySlug(Astro.params.slug)`; rename `category.title` -> `category.label`, `category.products` -> `category.items` (v2 shape).
- [x] T10. Run `npx astro check && npx astro build`. Confirm 21 catalog pages generate without errors.

## 6. Page composition: sidebar with active state

- [x] T11. Render `<CategorySidebar categories={adapter.categories} activeSlug={category.slug} totalProducts={adapter.items.length} />` in `.cat-detail-layout`. Slice 2 component already applies `is-active` class to matching link.

## 7. Page composition: item cards with chips

- [x] T12. Replace existing item rendering with `<ul class="cat-row-list">` per design.md section 2.3. Each `<li class="cat-row" data-type={item.item_type} style="--row-index:{Math.min(idx, 10)}">` contains `<ItemTypeChip itemType={item.item_type} itemId={item.sku} />` plus name + code + per-row "Ver y cotizar" link.

## 8. Page composition: WhatsAppCta

- [x] T13. Render `<WhatsAppCta context="general" />` in `.cat-detail-final-cta` at page bottom. Number comes from `PUBLIC_WHATSAPP_NUMBERS['general']` with `sales` fallback (handled inside slice 2 component).

## 9. Page composition: PDF button

- [x] T14. Render `<CategoryPdfDownloadButton title={pdfTitle} subtitle={pdfSubtitle} rows={pdfRows} />` in `.cat-detail-actions` near page top.

## 10. JSON-LD

- [x] T15. Build `collectionPageSchema` in page frontmatter per design.md section 5.1 (`@context: https://schema.org`, `@type: CollectionPage` with nested `ItemList` (`position`, `name`, `url` per item) and `BreadcrumbList` (Inicio > Catalogo > slug)). Emit in `<head>` via `<script type="application/ld+json" set:html={JSON.stringify(collectionPageSchema)} />`.

## 11. Page metadata

- [x] T16. Patch `src/layouts/Base.astro` to consume optional props `{ canonicalPath, ogImage }` plus hardcoded `ogLocale = 'es_CL'` per design.md section 6.1. Default values preserve slice 2 behavior when not passed. Page frontmatter passes helper output: `<Base title={meta.title} description={meta.description} canonicalPath={meta.canonicalPath} ogImage={meta.ogImage}>`.

## 12. Motion and accessibility

- [x] T17. Add CSS stagger animation on `.cat-row`: `animation: rowEnter 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards; animation-delay: calc(var(--row-index, 0) * 60ms)`. Cap at index 10 via `Math.min(idx, 10)`. Add `@media (prefers-reduced-motion: reduce)` block zeroing transform and opacity.
- [x] T18. Verify focus-visible styles on all interactive elements; alt text on all images (or `alt=""` for decorative); tab order matches DOM (back link -> PDF button -> sidebar -> rows -> final CTA).

## 13. Build verify

- [x] T19. Run `npm test`. Confirm 52/52 still passing.
- [x] T20. Run `npx astro check && npx astro build`. Confirm 0 errors; 21 `dist/catalogo/<slug>/index.html` pages; JSON-LD `<script type="application/ld+json">` in each head; all required meta tags (`<title>`, `description`, og:* (5), twitter:* (4), canonical, `<html lang="es-CL">`).

## 14. Commit and push

- [x] T21. `git add` ONLY intended files: `src/lib/category-meta.ts`, `tests/lib/category-meta.test.mjs`, `src/components/CategoryPdfDownloadButton.astro`, `src/pages/catalogo/[slug].astro`, `src/layouts/Base.astro`, `openspec/changes/catalog-v2-ui-migration-slice-3/{proposal,spec,design,tasks}.md`. Verify `git status --short` shows no unintended files and no secrets.
- [x] T22. Commit message: `feat(catalog-detail): polish /catalogo/[slug] with design skills, JSON-LD, PDF export`. No `Co-Authored-By`, no emoji, no `section symbol`, UTF-8 without BOM.
- [x] T23. Push to `origin/feat/catalog-robust-v2-base` (do NOT checkout main).

## Rollback

`git revert <slice-3-merge-commit>` restores the prior 306-line `src/pages/catalogo/[slug].astro` (shim-driven version with inline jsPDF) and removes the 4 new files (`src/lib/category-meta.ts`, `tests/lib/category-meta.test.mjs`, `src/components/CategoryPdfDownloadButton.astro`) plus the `Base.astro` patch. No other slice depends on `category-meta.ts` or `CategoryPdfDownloadButton`. Page can revert to using the legacy shim if needed (backward compat preserved via `src/data/catalog.ts`).

## Risks per task

- T1-T2: trivial verification.
- T3-T6: standard TDD cycle; `tsx` loader from slice 1 already in place.
- T7-T8: Astro components not unit-testable with `node:test`; manual smoke on `dist/` is the gate (same pattern slice 1+2 used).
- T9-T14: page rewrite is the largest single change; verify diff matches design.md section 2.3.
- T15: JSON-LD emission via `set:html` requires careful escaping (Astro handles it; verify by reading `dist/` output).
- T16: Base.astro patch is backward-compatible; defaults preserve slice 2 behavior.
- T17-T18: motion + a11y manual smoke; stagger cap at index 10 (max 600ms).
- T19-T20: standard build gates.
- T21-T23: conventional commit, no AI attribution.

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

## Final Status

- **Implementation commit**: `b6756c5c084a39984f498274e48c131481f7dce5`
- **Branch**: `feat/catalog-robust-v2-base`
- **Verify verdict**: PASS WITH WARNINGS (1 WARNING: R5 message context gap owned by slice-2 WhatsAppCta component)
- **Verify report**: `openspec/changes/catalog-v2-ui-migration-slice-3/verify-report.md`
- **Archive date**: 2026-06-25
- **Test count**: 52/52 (46 slice-1+2 + 6 slice-3)
- **Build**: 740 pages, 21 catalog subdirectories, AJV JSON-LD validation PASS
- **Diff vs slice-2 HEAD**: 9 files, +2121 / -290 lines, no accidental touches to slice-1/2 files
- **All 23 tasks completed**: T1-T23 marked [x] in sections 1-14