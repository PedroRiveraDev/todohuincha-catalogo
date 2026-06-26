# Archive: catalog-v2-ui-migration-slice-3

## Date
2026-06-25

## Status
ARCHIVED — shipped in commit b6756c5 on branch `feat/catalog-robust-v2-base`. Ready for slice 4.

## Summary

Slice 3 finishes the per-category detail surface (`/catalogo/[slug]`) that slice 2 carved out. The 21 detail pages now consume the frozen v2 adapter directly (no more legacy shim import), render the slice-2 components composed (`CategorySidebar` with active highlight, `ItemTypeChip` per item, `WhatsAppCta` at page bottom), and ship three brand-new capabilities layered on top: a pure `category-meta` helper that centralizes per-page title/description/canonical/og:/twitter:/breadcrumb composition (TDD-first, 6 assertions); a per-category PDF generator component (`CategoryPdfDownloadButton.astro`) with flat single-section layout, brand-mark fallback chain, and auto-pagination for large categories (machinery 31 items -> multi-page); and a `CollectionPage` JSON-LD block (with nested `ItemList` and `BreadcrumbList`) AJV-validated against a hand-rolled structural schema.

The slice also includes a backward-compatible patch on `Base.astro` (new optional props `canonicalPath` + `ogImage`, hardcoded `ogLocale = 'es_CL'`) which lights up the full og:/twitter:/canonical surface for both slice-2 landing and slice-3 detail pages without breaking slice 1 or slice 2.

All 5 design skills were applied minimally with the same precedent slice 2 documented: cubic-bezier(0.16, 1, 0.3, 1) easing on every interactive surface, three-tier elevation (rest/hover/CTA), sharp/medium/round radius scale, no side-stripe borders, max-20-word subtitle, `text-wrap: balance` on h1, 60ms-incremented stagger entry on item cards capped at 600ms total, and `prefers-reduced-motion` zeroing all transforms/transitions.

## PR

- commit `b6756c5`: `feat(catalog-detail): polish /catalogo/[slug] with design skills, JSON-LD, PDF export`
  - 9 files, +2121 / -290 lines
  - Tests: 46 -> 52 (6 new for `category-meta`)
  - All gates green: `npx astro check` 0 errors, `npx astro build` 740 pages, AJV JSON-LD validation PASS

## Files changed

| File | Status | Lines |
|------|--------|-------|
| `src/lib/category-meta.ts` | NEW | +54 |
| `tests/lib/category-meta.test.mjs` | NEW | +58 |
| `src/components/CategoryPdfDownloadButton.astro` | NEW | +300 |
| `src/pages/catalogo/[slug].astro` | REWRITE | 563 (was 306) |
| `src/layouts/Base.astro` | PATCH (backward-compatible) | +29 / -1 |
| `openspec/changes/catalog-v2-ui-migration-slice-3/proposal.md` | NEW | +118 |
| `openspec/changes/catalog-v2-ui-migration-slice-3/spec.md` | NEW | +88 |
| `openspec/changes/catalog-v2-ui-migration-slice-3/design.md` | NEW | +1098 |
| `openspec/changes/catalog-v2-ui-migration-slice-3/tasks.md` | NEW | +103 |

## Capabilities delivered

- `catalog-detail-ui` (delta spec, 9 requirements, 20 scenarios) - all PASS at the runtime level:
  1. category metadata helper (R1)
  2. adapter consumption (R2)
  3. sidebar with active highlight (R3)
  4. item rendering with type chip (R4)
  5. WhatsApp CTA (R5)
  6. category PDF download (R6)
  7. JSON-LD CollectionPage (R7)
  8. page metadata (R8)
  9. motion and accessibility (R9)

## Test results

- `npm test`: 52/52 PASS (46 slice-1+2 + 6 slice-3)
- `npx astro check`: 0 errors, 0 warnings, 7 hints (all `is:inline` suggestions on the JSON-LD `<script>` tags - intentional per design.md section 5)
- `npx astro build`: 740 pages, 21 catalog subdirectories, completed in 11.69 s
- AJV JSON-LD validation against structural schema: PASS
  - `dist/catalogo/s-bimetal/index.html`: `CollectionPage` + 74-entry `ItemList` + 3-entry `BreadcrumbList`
  - `dist/catalogo/maquinas/index.html`: `CollectionPage` + 31-entry `ItemList` (exercises PDF auto-pagination path)
- `git diff c6da914..HEAD --stat` (slice-2 HEAD -> slice-3 HEAD): exactly the 9 expected files, no accidental touches to slice-1 or slice-2 files

## Known gaps (post-archive)

- W1 (verify-report.md): WhatsApp CTA message for `context="general"` does NOT encode `{category.label}` + item count as the R5 spec scenario suggests. The slice-2 `WhatsAppCta.astro` component hardcodes the message text for the `general` context. Functionality works (real number, link active, disabled fallback works); only the message body is generic. Documented for downstream tracking. Fix target: future slice (4+) that extends `WhatsAppCta` with `categoryLabel` + `itemCount` props for the `general` context.
- S1 (verify-report.md): `og:site_name` not emitted in head (recommendation only, not in slice-3 spec).

## Rollback

`git revert b6756c5` restores the prior `src/pages/catalogo/[slug].astro` (shim-driven, inline jsPDF) and removes 3 new files:
- `src/lib/category-meta.ts`
- `src/components/CategoryPdfDownloadButton.astro`
- `tests/lib/category-meta.test.mjs`

Also reverts the `Base.astro` patch (back to the 2-prop signature). No other slice depends on `category-meta.ts` or `CategoryPdfDownloadButton`. Page can revert to using the legacy shim via `src/data/catalog.ts` (still present, unchanged). Frozen per slice 1+2 contracts: `src/lib/catalog.ts`, `src/data/catalog.ts`, `src/lib/whatsapp.ts`, `src/lib/categories.ts`, all slice-1+2 components and test suites, `.env.example` — none touched.

## Next steps

- Slice 4: `/productos/[category]/[reference]` product detail page.
- Final PR to `main`.
- Optional: address W1 (WhatsApp message category context) and S1 (`og:site_name`) in slice 4 or a small follow-up slice.
