# Archive: catalog-v2-ui-migration-slice-4

## Date
2026-06-25

## Status
ARCHIVED - FINAL slice of catalog-v2-ui-migration. Shipped in commit `f93d96a` + fix commit `37addd5`.

## Summary

Slice 4 finishes the per-product detail surface (`/productos/[category]/[reference]`) that slices 2 and 3 carved out. The 681 product detail pages now consume the frozen v2 adapter directly (no more legacy shim import), render one of three type-aware layouts (simple_product sparse specs, spare_part sparse specs with optional Compatibilidad section, machinery flat specification_groups), and ship the largest SEO/GEO win in the entire migration: every one of the 681 pages now emits a JSON-LD `Product` + `BreadcrumbList` block in `<head>`, plus the full og:* / twitter:* / canonical meta set via Base.astro's slice 3 patch.

The slice fixes the user-reported bare `wa.me/?text=` link bug on all 681 pages. Every link now points to the real WhatsApp number `56974997212` from `PUBLIC_WHATSAPP_NUMBERS` (via `src/lib/whatsapp.ts`). For machinery items with an embedded PDF (slice X), a secondary "Solicitar ficha tecnica por WhatsApp" CTA is rendered alongside the primary "Cotizar maquinaria" CTA.

A pure helper `src/lib/product-detail-meta.ts` centralizes per-item title / description / canonical / og:* / JSON-LD composition (TDD-first, 5 assertions in `tests/lib/product-detail-meta.test.mjs`). Layout polish follows the slice 3 precedent: cubic-bezier(0.16, 1, 0.3, 1) easing on every interactive surface, three-tier elevation (rest / hover / CTA), sharp / medium / round radius scale, no side-stripe borders, max-20-word subtitle, `text-wrap: balance` on h1, 40ms-incremented stagger entry on spec rows capped at 600ms total, `prefers-reduced-motion` zeroing all transforms / transitions.

Initial implementation at commit `f93d96a` accidentally duplicated the `<Base>` opening tag in the page source, which produced invalid HTML on all 681 pages (duplicated `<html>`, `<head>`, `<body>`, `<title>`, canonical, og:type). The fix at commit `37addd5` removed the duplicate `<Base>` and kept a top-level `<meta property="og:type" content="product" />` for Astro to hoist into `<head>`. After the fix, all 681 pages are well-formed and the og:type=product override renders exactly once per page inside `<head>`.

## User-Reported Bug Fix

Bare `wa.me/?text=...` bug **FIXED**. Aggregate scan across all 681 product pages:
- bare `wa.me/?text=` links: **0**
- real `wa.me/569...` links: **694** (681 primary CTAs + 13 machinery-with-PDF secondary datasheet CTAs)
- every href uses the real WhatsApp number `56974997212` from `PUBLIC_WHATSAPP_NUMBERS`

## Files changed

| File | Status | Lines |
|------|--------|-------|
| `src/lib/product-detail-meta.ts` | NEW | +140 |
| `tests/lib/product-detail-meta.test.mjs` | NEW | +59 |
| `src/pages/productos/[category]/[reference].astro` | REWRITE | 28 -> 384 (+356 net; includes inline `<style>` block) |
| `openspec/changes/catalog-v2-ui-migration-slice-4/proposal.md` | NEW | +144 |
| `openspec/changes/catalog-v2-ui-migration-slice-4/spec.md` | NEW | +80 |
| `openspec/changes/catalog-v2-ui-migration-slice-4/design.md` | NEW | +903 |
| `openspec/changes/catalog-v2-ui-migration-slice-4/tasks.md` | NEW | +104 |

No changes to: `src/lib/catalog.ts` (frozen adapter), `src/data/catalog.ts` (legacy shim, backward-compat surface preserved), `src/layouts/Base.astro` (slice 3 patch unchanged), `src/lib/whatsapp.ts` (slice 2 helper unchanged), any slice 1+2+3 component (`WhatsAppCta`, `CategorySidebar`, `ItemTypeChip`, `CategoryPdfDownloadButton`), any slice 1+2+3 helper (`category-meta.ts`, `categories.ts`), or any slice 1+2+3 test suite.

## Capabilities delivered

- `product-detail-ui` (delta spec, 8 requirements, 19 scenarios) - all PASS at the runtime level:
  1. Adapter-driven lookup (R1)
  2. Product image rendering with gray placeholder fallback (R2)
  3. Type-aware rendering (simple_product, spare_part, machinery; service defensive redirect) (R3)
  4. JSON-LD Product + BreadcrumbList schema with AJV validation (R4)
  5. Page metadata: title / description / og:* / twitter:* / canonical / html lang=es-CL (R5)
  6. WhatsApp CTA with real number, context per item_type (R6)
  7. Spare part compatibility section (omitted when empty) (R7)
  8. Machinery PDF request CTA (only when source_pdf present) (R8)

## Test results

- `npm test`: 57/57 PASS (52 slice 1+2+3 + 5 slice 4)
- `npx astro check`: 0 errors, 0 warnings, 8 hints (all `is:inline` suggestions on JSON-LD `<script>` tags - intentional)
- `npx astro build`: 740 pages built in 14.08s (681 product + 21 category detail + 21 catalog landing + 2 API JSON + 1 root + others)
- AJV Product schema validation across all 681 product pages: **681/681 PASS**
- DOM integrity across all 681 product pages:
  - pages with >1 `<html>`: 0
  - pages with >1 `<title>`: 0
  - pages with >1 canonical: 0
  - pages with `og:type=product`: 681
  - bare `wa.me/?text=` links: 0
  - real `wa.me/569...` links: 694

## Fix history

- commit `f93d96a`: `feat(product-detail): migrate /productos/[category]/[reference] to v2 adapter with JSON-LD Product schema` - initial slice 4 implementation. FAILed verify because the page source contained a duplicated `<Base>` opening tag (both copies rendered the full Base.astro template), producing invalid HTML on all 681 pages with duplicated `<html>`, `<head>`, `<body>`, `<title>`, canonical, og:type.
- commit `37addd5`: `fix(product-detail): remove duplicated <Base> in /productos/[reference] page` - removed the duplicate `<Base>` opening; kept a single `<Base>` wrapper and a top-level `<meta property="og:type" content="product" />` so Astro hoists it into `<head>` (single occurrence, inside `<head>`). After the fix, all 681 pages have valid HTML and all 8 requirements PASS.

## Final state of v2-ui-migration

| Slice | Capability | Status |
|-------|-----------|--------|
| 1 | catalog-adapter | ARCHIVED (commit `32f6b1f`) |
| 2 | catalog-landing-ui | ARCHIVED (commit `2eb9661`) |
| X | catalog-machinery-assets-embed | ARCHIVED (commit `c6da914`) |
| 3 | catalog-detail-ui | ARCHIVED (commit `a7d8447`) |
| 4 | product-detail-ui | ARCHIVED (commit `f93d96a` + fix `37addd5`) |

All 4 slices + slice X are now archived. v2-ui-migration is complete and ready for the final PR to `main`.

## Rollback

`git revert 37addd5` re-introduces the duplicated `<Base>` defect (FAIL state). `git revert 37addd5 && git revert f93d96a` fully restores the prior 28-line `src/pages/productos/[category]/[reference].astro` (shim-driven, bare `wa.me/?text=` link) and removes the 2 new files (`src/lib/product-detail-meta.ts`, `tests/lib/product-detail-meta.test.mjs`). Frozen per slice 1-3 contracts: `src/lib/catalog.ts` (314 lines, sole owner of items / getItem / resolveImageSrc), `src/data/catalog.ts` (shim stays as backward-compat surface), all slice 2 + 3 components and helpers, Base.astro (slice 3 patch), all slice 1-3 test suites, `.env.example`. No data migration. No DB schema bump. No env contract change.

The user-reported bare `wa.me/?text=` link on the 681 pages returns with the full rollback, so the rollback is not free.

## Next steps

- Open PR from `feat/catalog-robust-v2-base` to `main` with all slices 1+2+3+4 + slice X commits (13 commits total).
- PR title: `feat(catalog-ui): v2 data model migration (slices 1-4) + extended machinery assets embed`
- Expected diff: ~5000-6000 lines of code + ~17 MB base64 data on the JSON file (slice X PR2 only).
- Optional follow-up: address S1 (extend Base.astro with `ogType` prop), S2 (add `is:inline` to JSON-LD scripts to silence hints), S3 (codify AJV product JSON-LD smoke test in `tests/components/product-jsonld.test.mjs`).