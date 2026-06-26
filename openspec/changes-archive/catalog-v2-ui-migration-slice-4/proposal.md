# Proposal: catalog-v2-ui-migration-slice-4

## Why

Slices 1-3 froze the v2 adapter, migrated the catalog landing, and
migrated the 21 per-category detail pages to consume the adapter
directly. The 681 per-product detail pages at
`src/pages/productos/[category]/[reference].astro` (one per unique
SKU, 28 lines today) were carved out of slice 2 as slice 4
(`changes-archive/catalog-v2-ui-migration-slice-2/exploration.md`
line 73-74). They still consume the legacy shim
`src/data/catalog.ts`, render with bare `wa.me/?text=...` links (the
user-reported bug — no real phone number, every page links to
`wa.me` without a number), ship no JSON-LD `Product` schema, no
og:* / twitter:* / canonical metadata, no image rendering, and no
type-aware layout. Search engines land users on these 681 pages;
the current state breaks the brand promise slices 2 and 3 set.
Slice 4 is the LAST migration slice before opening the PR to main.
681 indexable pages with correct schema is the largest SEO/GEO
win in the entire migration.

## What Changes

| File | Status | Summary |
|------|--------|---------|
| `src/pages/productos/[category]/[reference].astro` | REWRITE | 28 -> ~200 lines. Imports `adapter` and `resolveImageSrc` from `src/lib/catalog.ts`. `getStaticPaths` calls `adapter.getItem(sku)` for every unique item (681 routes). Renders one of three layouts by `item_type`: `simple_product` (specifications 4-key map), `spare_part` (same as simple_product, no parent linking since `compatibilities[]` is empty), `machinery` (`specification_groups` flat layout + WhatsApp CTA "Solicitar ficha tecnica"). Emits JSON-LD `Product` + `BreadcrumbList` in `<head>`. Per-page SEO via `Base.astro` props. Drops the legacy `<DownloadPdf>` aside and the bare `wa.me/?text=` link. |
| `src/lib/product-detail-meta.ts` | NEW | Pure helper (~50 lines) for per-page title / description / canonical / og:* / twitter:* / JSON-LD composition. Extracted so meta is deterministic and TDD-tested. Mirrors slice 3's `category-meta.ts`. |
| `src/components/ProductImage.astro` | NEW | Wrapper that calls `resolveImageSrc(item)` and renders `<img>` (data URI when base64, URL fallback, gray placeholder when empty). Lazy-loads (`loading="lazy"`). Scoped CSS. |
| `tests/lib/product-detail-meta.test.mjs` | NEW | ~8 assertions: title composition, description from `display_name`, canonical URL shape, og:* fields, twitter:card, locale `es-CL`, JSON-LD Product `@type` and `offers` block, BreadcrumbList shape. |
| `tests/lib/product-image.test.mjs` | NEW | ~4 assertions: data URI passthrough, URL fallback, empty-string placeholder, lazy attribute present. |

Delete: none. Untouched: `src/lib/catalog.ts` (frozen at 314 lines),
`src/data/catalog.ts` (shim stays as backward-compat surface),
`src/data/maquinaria.ts` and `src/pages/maquinaria/[slug].astro`
(out of scope — separate migration), all slice 2 + 3 components,
slice 1 + 2 + 3 helpers, slice 1 + 2 + 3 test suites.

## Impact

- `src/pages/productos/[category]/[reference].astro`: rewrite, +172 lines net.
- 4 new files: 1 page-internal helper (~50), 1 image component (~40), 2 tests (~120).
- Build: 681 product detail pages (one per unique SKU after slice 1 dedup). Per-page HTML gains JSON-LD `Product` + `BreadcrumbList`, og:* / twitter:* / canonical meta tags, `<img>` element, and the `WhatsAppCta` component. Each page also renders one type-specific layout (3 distinct markup trees).
- Tests: 52 (slice 1+2+3) + ~12 (slice 4) = ~64 passing.
- `PUBLIC_WHATSAPP_NUMBERS` env contract: now consumed by all 681 product pages (in addition to landing + 21 category pages). No new env keys.
- SEO surface: each product page now emits `Product` + `BreadcrumbList` JSON-LD plus per-page `<title>`, `<meta description>`, `<meta og:*>`, `<meta name="twitter:*">`, canonical URL, locale `es-CL`. Biggest GEO win in the migration: 681 pages become AI-search-citable.

## Capabilities

### New
- `product-detail-ui`: v2-driven per-product detail page. Type-aware rendering (simple_product, spare_part, machinery), product image via `resolveImageSrc` with gray placeholder fallback, per-page JSON-LD `Product` + `BreadcrumbList`, full SEO meta tag set, motion polish (subtle stagger entry on spec rows), layout polish (typography scale, shadows, spacing).

### Modified
- None at the spec level. Slice 3's `catalog-detail-ui`, slice 2's `catalog-landing-ui`, and slice 1's `catalog-adapter` stay frozen.

## Approach

1. **`getStaticPaths` uses `adapter.items` directly**: iterate the deduped `CatalogItem[]` exposed by the frozen adapter. For each item emit `{ params: { category: <slug>, reference: <sku> }, props: { item } }`. Param name stays `[reference]` (orchestrator-locked). No shim reads, no legacy `LegacyProduct` projection.
2. **Layout dispatch by `item_type`**: a single ternary on `item.item_type` picks one of three render branches. `simple_product` and `spare_part` share the sparse-spec render (4-key map: brand, materials, measurements_raw, quoted_inches; render only non-empty). `machinery` gets the `specification_groups` flat layout (every `group.label` as a `<h3>`, every `value.label: value.text` as a `<dl>` row, no accordion).
3. **`WhatsAppCta` context per type**: simple_product -> `context="sales"`, spare_part -> `context="repuestos"`, machinery -> `context="machinery"`. The component already accepts these three contexts (slice 2 + 3 pattern). `productName={item.display_name}` and `sku={item.sku}` are always passed so the WhatsApp message includes the SKU. Fixes the user-reported bare-link bug.
4. **PDF datasheet via WhatsApp fallback**: for `machinery` items only, render a secondary `WhatsAppCta context="machinery"` button labeled "Solicitar ficha tecnica" alongside the main "Cotizar maquinaria" CTA. Inline `data:application/pdf` is OUT (orchestrator-locked: keeps `dist/` size manageable).
5. **Image rendering via `ProductImage.astro`**: the wrapper calls `resolveImageSrc(item)` (already a named export of `src/lib/catalog.ts` since the `catalog-machinery-assets-embed` slice). When `resolveImageSrc` returns `""`, render a gray placeholder block with the item name overlaid (`background: var(--soft); display: flex; align-items: center; justify-content: center; color: var(--muted)`). `loading="lazy"` on the `<img>` for off-screen images.
6. **JSON-LD `Product` + `BreadcrumbList` in `<head>`**: one `<script type="application/ld+json">` per page with both blocks. `Product` includes `@id`, `name`, `image` (the resolved src or `/og-image.jpg` fallback), `description` (the per-page meta description), `sku`, `category` (`item.category_label`), `offers` block derived from `pricing.sale_amount` and `pricing.currency` (or `availability: "PreOrder"` when `is_price_available: false`). `BreadcrumbList` has 3 items: Inicio (`/`) -> Catalogo (`/catalogo`) -> Product (`/productos/<slug>/<sku>`).
7. **`product-detail-meta.ts` pure helper**: extracts title (`<display_name> | Todo Huincha`), description (from `display_name` + category label, max 160 chars), canonical URL (`${PUBLIC_SITE_URL}/productos/<slug>/<sku>`), og:* (title, description, image, type `product`, url, locale `es_CL`, site_name), twitter:* (card `summary_large_image`, title, description, image). TDD-first (~8 assertions). Used by the page frontmatter.
8. **Layout polish** (high-end-visual-design): hero gets `padding-top: clamp(96px, 12vw, 144px)` and `text-wrap: balance` on h1, max 20-word subtitle, `letter-spacing: -0.03em` on h1. Image card gets `box-shadow: 0 24px 60px rgba(49, 62, 72, 0.12)`. Spec rows get `--soft` background on hover, `--orange-deep` left accent on focused row (NOT a side-stripe border per impeccable ban).
9. **Motion polish** (emil-design-eng): subtle stagger entry on spec rows. Each row applies a 40ms-incrementing animation-delay (cap at 400ms for 10+ row groups) using a `cubic-bezier(0.16, 1, 0.3, 1)` 350ms ease-out on `opacity 0 -> 1` and `translateY(6px) -> 0`. `@media (prefers-reduced-motion: reduce)` block zeroes transforms.
10. **UX clarity** (impeccable): back link (`Volver al catalogo`) lives at top, persistent. WhatsApp CTA anchored near the hero. Gray placeholder keeps the layout intact when images are absent — no missing-image icon, no broken layout. Spare parts render identically to simple products because `compatibilities[]` is empty in data; no parent-product section, no "compatible with:" block.
11. **Anti-slop direction** (design-taste-frontend): no gradient text, no decorative emoji, no generic "card grid" -- spec rows are a tight `<dl>` with monospaced values. Typography uses the existing `Base.astro` font (no new font import). Hero subtitle max 12 words.
12. **SEO + GEO** (seo-geo): canonical URL on every page. `og:image` falls back to the resolved `resolveImageSrc` value, then to `/og-image.jpg`, then to `/logo-todohuincha.svg`. `og:locale = es_CL`. `<html lang="es-CL">` propagated via `Base.astro`. `llms.txt` is out of scope (other slice); slice 4 just ensures each product page emits the JSON-LD that AI search engines ingest.

## Decisions (resolved with user)

| Decision | Resolution |
|----------|------------|
| URL param name | KEEP `[reference]` (orchestrator-locked). Renaming to `[sku]` would break existing URLs and lose SEO equity. |
| Per-item lookup | USE `adapter.getItem(sku)`. SKU is globally unique after slice 1 dedup. |
| Inline PDF download | NO. WhatsApp "Solicitar ficha tecnica" fallback only (orchestrator-locked). Inline `data:application/pdf` deferred to slice 5 if needed. |
| `specification_groups` layout | FLAT (every group as a `<h3>`, every value as a `<dl>` row). NO accordion — content density and no JS dependency. |
| `specifications` map render | ONLY non-empty keys of the 4-key sparse map (brand, materials, measurements_raw, quoted_inches). Empty keys produce no row. |
| Spare parts render | SAME as simple_product (sparse `specifications` map). NO parent-product linking (data's `compatibilities[]` is empty). |
| Parent product relationships | NONE (data does not support them). No "compatible with:" section. |
| Image fallback | GRAY placeholder block with item name overlaid when `resolveImageSrc` returns `""`. No broken-image icon. |
| Type-aware render dispatch | ONE ternary on `item.item_type` at the top of the page. No per-type subcomponents. |
| WhatsApp context per type | simple_product -> `sales`, spare_part -> `repuestos`, machinery -> `machinery`. |
| JSON-LD block placement | BOTH `Product` and `BreadcrumbList` in `<head>` (cleaner for crawlers than end-of-body). |
| Page-internal helper | EXTRACT `product-detail-meta.ts` for title/description/canonical/og:*/twitter:* composition. TDD-first. |

## Risks

| Risk | L | Mitigation |
|------|---|------------|
| 681 pages with images inflating `dist/` size | LOW | `resolveImageSrc` already prefers base64 (slice X); the 14 extended items are the only ones with embedded bytes. Total per-page payload for non-extended items is a URL reference (~80 bytes). Spot-check `du -sh dist/productos/` after build; target < 5 MB increase vs slice 3 baseline. |
| Type-aware rendering needs 3 paths but data is uniform per type | LOW | Each branch reads a disjoint set of fields (`specifications` vs `specification_groups`). AJV at adapter load guarantees `item_type` is one of the 4 enums; defensive guard `if (item.item_type === 'service') return Astro.redirect('/catalogo')` covers the 4th case (services have no detail page in scope). |
| JSON-LD `Product` schema validation gaps | LOW | Schema.org `Product` is permissive. AJV-style smoke test against a fixture: parse the emitted `<script type="application/ld+json">` content, validate the JSON shape, assert `@type === 'Product'`, `name`, `image`, `sku`, `offers`. Manual check via Google's Rich Results Test for 1 simple_product, 1 spare_part, 1 machinery. |
| Meta tag composition drift across 681 pages | LOW | `product-detail-meta.ts` helper centralizes composition. ~8 TDD assertions lock the shape. Build-time check: parse `dist/productos/<slug>/<sku>/index.html` and assert exactly one `<h1>`, one `<link rel="canonical">`, one JSON-LD `Product`, one JSON-LD `BreadcrumbList`. |
| SEO regressions (duplicate H1, missing canonical) | LOW | H1 is `item.display_name` (unique per SKU). Canonical is computed in `product-detail-meta.ts`. Same per-page HTML diff strategy as slice 3. |
| Per-page HTML size with JSON-LD + meta + composed components | LOW | JSON-LD `Product` is ~600 bytes inline; BreadcrumbList ~400 bytes. `ProductImage` adds <1 KB scoped CSS. Total per-page payload: ~15-22 KB. 681 pages x 20 KB = ~13.6 MB worst-case HTML; well within the 5 MB slice 3 baseline (HTML compresses well, gzip typically 4:1). |
| Diff budget pressure (D2 = 800 lines per slice; slice 3 was ~300) | LOW | Estimated ~382 lines net: 1 page rewrite ~200 - 28 = +172 + 1 helper ~50 + 1 component ~40 + 2 tests ~120 = +382 lines. Comfortable margin under 800. |
| `service` item_type reaches this page | LOW | Defensive redirect at the top: `if (item.item_type === 'service') return Astro.redirect('/catalogo')`. Services are not in the 681 unique products (services live in `service_catalog`); guard is defensive only. |
| Existing shim consumers (other pages, future code) | LOW | `src/data/catalog.ts` stays untouched. Future consumers can still import from the shim; this slice does NOT delete it. |

## Rollback Plan

`git revert <slice-4-merge-commit>` restores the prior 28-line
`src/pages/productos/[category]/[reference].astro` (shim-driven
version with bare `wa.me/?text=`) and removes the 5 new files.
`src/lib/catalog.ts`, `src/data/catalog.ts`, slice 2 + 3 components
(`CategorySidebar`, `ItemTypeChip`, `WhatsAppCta`, `CategoryPdfDownloadButton`,
`PdfDownloadButton`), slice 1-3 helpers (`whatsapp.ts`,
`categories.ts`, `category-meta.ts`, `resolveImageSrc`), slice 1-3
test suites, and `.env.example` are unchanged. The `maquinaria`
page stays as-is (out of scope). No data migration. No DB. No env
contract change. The bare `wa.me/?text=` links on the 681 pages
return — but slice 4 was net positive: the user-reported bug fix
disappears too, so the rollback is not free.

## Dependencies

- Slice 1 `adapter` (frozen at 314 lines; sole owner of `items`, `getItem`).
- Slice X `resolveImageSrc` named export on `src/lib/catalog.ts` (catalog-machinery-assets-embed).
- Slice 2 + 3 components (`WhatsAppCta`, `CategorySidebar`, `ItemTypeChip`).
- Slice 2 helpers (`src/lib/whatsapp.ts`).
- `.env.example` `PUBLIC_WHATSAPP_NUMBERS` and `PUBLIC_SITE_URL` contracts.
- 5 design skills: emil-design-eng, impeccable, design-taste-frontend, high-end-visual-design, seo-geo (applied in design phase; pattern match slice 3 section 9).
- No new npm dependencies.

## Success Criteria

- [ ] `npm test` passes (~64/64: 52 slice 1+2+3 + ~12 slice 4)
- [ ] `npx astro check` 0 errors
- [ ] `npx astro build` completes: 681 product detail + 21 category detail + 21 catalog landing + 2 API JSON + 1 root (counts match slice 3 + this slice's 681 product pages)
- [ ] Each `dist/productos/<slug>/<sku>/index.html` shows: type-appropriate layout, `<img>` via `resolveImageSrc` (data URI / URL / gray placeholder), one `WhatsAppCta` (context per item_type), JSON-LD `Product` + `BreadcrumbList` in `<head>`
- [ ] All 681 pages emit valid JSON-LD `Product` (verified by build-time smoke check)
- [ ] All 681 pages have canonical + og:* + twitter:* meta tags (verified by build-time smoke check)
- [ ] WhatsApp CTA link has a real number from `PUBLIC_WHATSAPP_NUMBERS` (fixes user-reported bare-link bug); renders disabled-state fallback when env is empty
- [ ] `dist/` size increase < 5 MB vs slice 3 baseline
- [ ] No `Co-Authored-By`, no emoji, UTF-8 in all new files
- [ ] Source-only diff under 800 lines (D2 budget)
- [ ] Frozen files untouched: `src/lib/catalog.ts`, `src/data/catalog.ts`, `src/data/maquinaria.ts`, slice 2 + 3 components, slice 1 + 2 + 3 helpers, `src/pages/maquinaria/[slug].astro`

## Open Questions

- None for the user. Defaults already set: keep `[reference]`, use `adapter.getItem(sku)`, PDF via WhatsApp fallback, `specification_groups` flat, spare parts = simple_product render, no parent linking, gray placeholder fallback, 3-type dispatch, `WhatsAppCta` context per type, single page-internal helper, JSON-LD in `<head>`. Internal decisions (TDD pattern, meta helper extraction, motion stagger cap, defensive service-type redirect) are documented inline above and resolved by the design phase.

PR title: `feat(catalog-ui): migrate product detail page to v2 data model (slice 4)`