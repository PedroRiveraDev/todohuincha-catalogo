# Tasks: catalog-v2-ui-migration-slice-4 (product-detail-ui)

> FINAL slice of the catalog v2 migration. Rewrites the 681 per-product
> detail pages at `src/pages/productos/[category]/[reference].astro`
> (28 -> ~200 lines) to consume the frozen v2 adapter directly,
> introduces `src/lib/product-detail-meta.ts` for deterministic SEO
> metadata + JSON-LD `Product` + `BreadcrumbList`, and fixes the
> user-reported bare `wa.me/?text=` link bug on every one of the
> 681 pages. TDD-first: 5 RED assertions land before the helper
> exists; helper lands and 5/5 go GREEN before the page rewrite.
>
> Refs: `openspec/changes/catalog-v2-ui-migration-slice-4/{proposal,spec,design}.md`

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~382 net (page rewrite +172, helper ~95, inline image/CSS ~30, 2 tests ~120, docs -35) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR with `size:exception` justification (last migration slice, lands on top of slice 3 HEAD) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## 1. Setup

- [x] T1. Verify starting state on `feat/catalog-robust-v2-base`: `git status --short` clean; `git branch --show-current` prints `feat/catalog-robust-v2-base`; `npm test` exits 0 (52/52 passing); `npx astro check` 0 errors; `npx astro build` produces 681 product pages.
- [x] T2. Record HEAD SHA via `git rev-parse HEAD`. Note for the commit step.

## 2. product-detail-meta.ts helper (TDD RED)

- [x] T3. Create EMPTY `tests/lib/product-detail-meta.test.mjs` with 5 placeholder assertions that FAIL: known item returns full meta with `title` / `description` / `ogImage` / `canonicalPath` / 4-entry `breadcrumb`; image is empty string omits jsonLd `image` field; `availability` maps `in-stock -> https://schema.org/InStock`, `out-of-stock -> OutOfStock`, `discontinued -> Discontinued`; `canonicalPath` matches `/productos/{category_slug}/{sku}`; breadcrumb has exactly 4 entries `Inicio > Catalogo > {category_label} > {display_name}`.
- [x] T4. Run `npm test -- tests/lib/product-detail-meta.test.mjs`. Confirm 5/5 fail (red) with module-not-found or assertion mismatches.

## 3. product-detail-meta.ts helper (TDD GREEN)

- [x] T5. Create `src/lib/product-detail-meta.ts` per design.md section 5.1 (~95 lines). Exports `getProductMeta`, `buildProductJsonLd`, `mapAvailabilityToSchema`, and `ProductMeta` interface. Uses `CatalogItem` type from `src/data/catalog-client.ts`. `deriveAvailability` reads `item.status.is_catalog_visible` + `item.status.is_active`; conditional spread omits `image` when `imageSrc` is empty; conditional spread omits `brand` when empty; conditional spread omits `price` when `sale_amount` is not a positive number.
- [x] T6. Run `npm test`. Confirm 5/5 new pass (green); total now 57/57 (52 prior + 5 new).

## 4. Page rewrite: adapter + getStaticPaths

- [x] T7. Edit `src/pages/productos/[category]/[reference].astro` frontmatter per design.md section 2.2: drop shim import `from '../../../data/catalog'`; add `import { adapter, resolveImageSrc } from '../../../lib/catalog.ts'`; add `import { getProductMeta, buildProductJsonLd } from '../../../lib/product-detail-meta.ts'`; add `import { buildWhatsAppUrl, parseWhatsAppNumbers } from '../../../lib/whatsapp.ts'`; `getStaticPaths` returns `adapter.items.map((item) => ({ params: { category: item.category_code.toLowerCase(), reference: item.sku }, props: { item } }))`; defensive `if (item.item_type === 'service') return Astro.redirect('/catalogo')`.
- [x] T8. Run `npx astro build`. Confirm 681 product pages generate under `dist/productos/<slug>/<sku>/index.html` without errors.

## 5. Image rendering with fallback

- [x] T9. Edit page template inline (NO separate `ProductImage.astro` per design section 4): render `<figure class="product-image">` with `<img src={imageSrc} alt={item.display_name} loading="lazy" decoding="async" width="800" height="800" />` when `imageSrc` is non-empty; render `<div class="product-image-placeholder" aria-label={item.display_name}><span>{item.display_name}</span></div>` when empty. Scoped CSS: `aspect-ratio: 1/1`, `box-shadow: 0 24px 60px rgba(49, 62, 72, 0.12)`, hover `transform: scale(1.02)` over 350ms `cubic-bezier(0.16, 1, 0.3, 1)`, `prefers-reduced-motion` guard zeroing the transform.

## 6. Type-aware layout

- [x] T10. Add `simple_product` branch per design section 3.2: name + sku + eyebrow + image + sparse `<dl class="prod-sparse-list">` iterating `SPEC_KEYS = ['brand', 'materials', 'measurements_raw', 'quoted_inches']`, emitting `<dt>`/`<dd>` ONLY for non-empty values; final CTA `<WhatsAppCta context="sales">`.
- [x] T11. Add `spare_part` branch: same sparse `<dl>` as simple_product, final CTA `<WhatsAppCta context="repuestos">`, plus a `Compatibilidad` section that renders ONLY when `compatibilities.length > 0` (current data has all empty arrays; guard satisfies spec scenario "Empty compatibilities omits section").
- [x] T12. Add `machinery` branch per design section 3.3: flat `specification_groups` layout (every `group.label` as `<h3 class="prod-spec-group-label">`, every `value` as `<dl>` row, NO accordion); final CTA `<WhatsAppCta context="machinery">`; secondary `<a class="cta-secondary" href={datasheetUrl}>` labeled "Solicitar ficha tecnica por WhatsApp" ONLY when `datasheetUrl` is non-null.

## 7. JSON-LD + metadata

- [x] T13. Edit page `<head>`: compute `jsonLd = buildProductJsonLd(item, imageSrc, meta)` in frontmatter; emit `<script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />` inside `<Base>` so it lands in `<head>` (Google Search Central: cleaner for crawlers than end-of-body).
- [x] T14. Pass frontmatter props to `<Base>` per design section 7: `title={meta.title}`, `description={meta.description}`, `canonicalPath={meta.canonicalPath}`, `ogImage={meta.ogImage}`. Base.astro (slice 3 patch) emits canonical absolute URL + full `og:*` (locale `es_CL`) + full `twitter:*` (card `summary_large_image`).

## 8. WhatsApp CTA + datasheet request

- [x] T15. Wire main CTA per design section 8.1: `whatsappContext` derived as `item.item_type === 'spare_part' ? 'repuestos' : item.item_type === 'machinery' ? 'machinery' : 'sales'`; render `<WhatsAppCta productName={item.display_name} sku={item.sku} context={whatsappContext} />`. Wire secondary datasheet CTA per design section 8.2: `datasheetNumber = envNumbers.machinery ?? envNumbers.sales ?? Object.values(envNumbers)[0]`; `datasheetUrl = item.machinery_profile?.source_pdf && datasheetNumber ? buildWhatsAppUrl(datasheetNumber, 'Hola, solicito la ficha tecnica de ...') : null`. Inline anchor (do NOT extend `WhatsAppCta`'s `context` enum).

## 9. Motion + accessibility

- [x] T16. Add scoped CSS stagger entry on spec rows: `.prod-specs-sparse .prod-sparse-row, .prod-specs-full .prod-spec-row { opacity: 0; transform: translateY(6px); animation: rowEnter 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards; animation-delay: calc(var(--row-index, 0) * 40ms); }`; cap `--row-index` at 10 so max delay is 600ms; `@media (prefers-reduced-motion: reduce)` block zeros transform and opacity; `:focus-visible` ring inherited from Base.astro; `alt` text set on every `<img>` (already in T9); tab order matches DOM order (back link -> eyebrow -> h1 -> image -> specs -> CTA).

## 10. Build verify

- [x] T17. Run `npm test`. Confirm 57/57 passing (52 slice 1+2+3 + 5 slice 4).
- [x] T18. Run `npx astro check && npx astro build`. Confirm: 0 errors; 681 product pages generated under `dist/productos/<slug>/<sku>/index.html`; each page emits exactly one `<script type="application/ld+json">` with `@graph[0].@type === 'Product'`; WhatsApp `href` uses real number (NOT `https://wa.me/?text=`); 3 sample pages render correctly (simple_product SKU `1971I`, spare_part SKU `1892I`, machinery SKU `2200I`); `du -sh dist/productos/` shows < 5 MB increase vs slice 3 baseline.

## 11. Commit and push

- [x] T19. `git add` ONLY intended files: `src/lib/product-detail-meta.ts`, `tests/lib/product-detail-meta.test.mjs`, `src/pages/productos/[category]/[reference].astro`, `openspec/changes/catalog-v2-ui-migration-slice-4/{proposal,spec,design,tasks}.md`. Verify `git status --short` shows no unintended files and no secrets.
- [x] T20. Commit message: `feat(product-detail): migrate /productos/[category]/[reference] to v2 adapter with JSON-LD Product schema`. No `Co-Authored-By`, no emoji, UTF-8 without BOM. Push to `origin/feat/catalog-robust-v2-base` (do NOT checkout `main`).

## Rollback

`git revert <slice-4-merge-commit>` restores the prior 28-line `src/pages/productos/[category]/[reference].astro` (shim-driven, bare `wa.me/?text=` link) and removes the 2 new files (`src/lib/product-detail-meta.ts`, `tests/lib/product-detail-meta.test.mjs`). Frozen files unchanged by revert: `src/lib/catalog.ts` (314 lines, sole owner of `items` / `getItem` / `resolveImageSrc`), `src/data/catalog.ts` (shim stays as backward-compat surface), slice 2 + 3 components (`WhatsAppCta`, `CategorySidebar`, `ItemTypeChip`, `CategoryPdfDownloadButton`), slice 1-3 helpers (`whatsapp.ts`, `categories.ts`, `category-meta.ts`), `src/layouts/Base.astro` (slice 3 patch), `src/pages/maquinaria/[slug].astro` (out of scope), slice 1-3 test suites, `.env.example`. No data migration. No DB schema bump. No env contract change. The user-reported bare `wa.me/?text=` link on the 681 pages returns — slice 4 was net positive, so the rollback is not free.

## Risks per task

- T1-T2: trivial verification; HEAD SHA recorded for rollback reference.
- T3-T4: standard TDD RED; test file imports `../../src/lib/product-detail-meta.ts` which does NOT exist yet, so module-not-found errors are expected and count as "red".
- T5-T6: helper is pure (no IO, no mutations); `tsx` loader from slice 1 already in place for `.ts` imports in `.mjs` tests.
- T7-T8: largest single edit (full page rewrite); verify diff matches design section 2.2 + 3; 681 routes is the build gate.
- T9: image rendering inline (NOT a separate component per design section 4 decision); aspect ratio 1/1 keeps layout stable when image is empty.
- T10-T12: type-aware branches read disjoint field sets (`specifications` vs `specification_groups` vs `spare_part_profile.compatibilities`); AJV at adapter load guarantees `item_type` enum; defensive `service` redirect covers the 4th case.
- T13-T14: JSON-LD via `set:html` requires Astro to handle escaping (handled automatically; verify by reading `dist/` output). Base.astro patch from slice 3 is backward-compatible.
- T15: WhatsApp context enum already accepts `sales` / `repuestos` / `machinery` from slice 2; datasheet URL built inline keeps `WhatsAppCta` component untouched (single-responsibility preserved).
- T16: stagger cap at index 10 (max 600ms delay per design section 9.2); WCAG AA contrast verified per design section 9.3.
- T17-T18: standard build gates; smoke on 3 sample SKUs is the runtime proof for spec scenarios "Type-aware rendering" and "machinery PDF request CTA".
- T19-T20: conventional commit, no AI attribution, push to feature branch only.

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low
