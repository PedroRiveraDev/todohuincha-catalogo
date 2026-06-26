# Proposal: catalog-v2-ui-migration-slice-3

## Why

Slices 1 and 2 froze the v2 adapter and migrated the catalog landing
(`src/pages/catalogo/index.astro`) to consume it. The 21 per-category
detail pages under `src/pages/catalogo/[slug].astro` (one per category,
306 lines today) were explicitly carved out of slice 2 as **slice 3**
(`exploration.md` line 72-73 of `changes-archive/catalog-v2-ui-migration-slice-2/`).
They still consume the legacy shim at `src/data/catalog.ts`, render
without design polish, and have no JSON-LD, no working WhatsApp CTA, no
grouped sidebar context, no per-item type chip, no SEO-grade metadata,
and no per-category PDF button. Search engines land users on these pages
first; the current state ships a half-migrated UI that breaks the brand
promise slice 2 established. Slice 3 finishes the per-category surface
with the same polish level.

## What Changes

| File | Status | Summary |
|------|--------|---------|
| `src/components/CategoryPdfDownloadButton.astro` | NEW | Per-category jsPDF generator. Distinct layout from `PdfDownloadButton.astro` (catalog-level): single-section report (header + category + N product rows + footer), no category grouping inside the PDF (one category per page-set). Same props pattern (`title`, `subtitle`, `rows`). |
| `src/pages/catalogo/[slug].astro` | REWRITE | 306 -> ~140 lines. Imports `adapter` directly from `src/lib/catalog.ts`. Renders `<CategorySidebar activeSlug={category.slug} />`, per-item `<ItemTypeChip>`, final `<WhatsAppCta context="general" />`, `<CategoryPdfDownloadButton>`. Emits JSON-LD `CollectionPage` + nested `ItemList` + `BreadcrumbList` at end of body. Drops the 268-line inline `<script>` (jsPDF moves into the new component). |
| `tests/components/category-pdf-button.test.mjs` | NEW | 4 assertions: props typing (title required), rows shape, JSON.stringify rows serialization shape, brand-mark fallback chain (DOM -> `/logo-todohuincha.svg` -> vector). |
| `tests/lib/category-detail-meta.test.mjs` | NEW | 6 assertions: per-page title composition, description from `category.label`, canonical URL shape, og:* fields, twitter:card field, locale `es-CL`. |

Delete: none. Untouched: `src/lib/catalog.ts` (frozen), `src/data/catalog.ts` (shim stays as backward-compat surface), `src/components/PdfDownloadButton.astro` (catalog landing), `src/components/DownloadPdf.astro` (product detail), slice 1+2 helpers, all slice 2 components (consumed, not modified).

## Impact

- `src/pages/catalogo/[slug].astro`: rewrite, ~-166 lines net (inline jsPDF removed).
- `src/components/CategoryPdfDownloadButton.astro`: new, ~210 lines (jsPDF + scoped styles + event handler).
- Build: 21 category detail pages. Per-page HTML gains JSON-LD block and the 4 composed components; structure of the visible list (max 31 rows per category, no pagination) is preserved.
- Tests: 32 (slice 1+2) + ~10 (slice 3) = ~42 passing.
- `PUBLIC_WHATSAPP_NUMBERS` env contract: now consumed by category detail pages (in addition to landing). No new env keys.
- SEO surface: each category page now emits `CollectionPage` + `ItemList` + `BreadcrumbList` JSON-LD plus per-page `<title>`, `<meta description>`, `<meta og:*>`, `<meta twitter:card>`, canonical URL, locale `es-CL`. Big win for AI search citation (GEO).

## Capabilities

### New
- `catalog-detail-ui`: v2-driven per-category detail page. Grouped sidebar with active highlight on current category, per-item type chip, single bottom WhatsApp CTA (context `general`), per-category PDF download, JSON-LD `CollectionPage` + nested `ItemList` + `BreadcrumbList`, full SEO meta tag set, motion polish (stagger entry on item cards), layout polish (typography scale, spacing, shadows).

### Modified
- None at the spec level. Slice 2's `catalog-landing-ui` and slice 1's `catalog-adapter` stay frozen.

## Approach

1. **TDD-first on the new pure shape** (pure functions only where they exist): the page-level composition is an Astro component and not unit-testable with `node:test` (same constraint slice 2 hit, mitigated by manual smoke). Tests target (a) `CategoryPdfDownloadButton` props contract and (b) the meta-tag builder (a tiny pure helper extracted to `src/lib/category-meta.ts`). The `category-meta.ts` helper centralizes title, description, canonical URL, og:* fields, twitter:card, locale so per-page meta is deterministic and tested.
2. **Compose slice 2 components by composition, not duplication**: `CategorySidebar` already exists; pass `activeSlug={category.slug}` to highlight the current category. `ItemTypeChip` already exists; render once per item with `itemType={item.item_type}`. `WhatsAppCta` already exists; render once at the page bottom with `context="general"`. No component code changes.
3. **`CategoryPdfDownloadButton` is a NEW component, not a variant of `PdfDownloadButton`**: per-category PDFs have a fundamentally different layout (one category section, no internal grouping). Sharing the jsPDF generator is out of scope; both components own their own generator. The brand-mark fallback chain (DOM -> `/logo-todohuincha.svg` -> vector) is duplicated verbatim, documented as known duplication. Future slice may consolidate via shared generator (slice 5+).
4. **JSON-LD emission**: `CollectionPage` at top level with `name` and `description` from `category.label`. Nested `ItemList` with `numberOfItems` = `category.items.length` and `itemListElement` entries `{ @type: ListItem, position, name, url }` where `url = ${PUBLIC_SITE_URL}/productos/${category.slug}/${encodeURIComponent(item.sku)}`. `BreadcrumbList` with 3 items: `Inicio` (`/`) -> `Catalogo` (`/catalogo`) -> current category (`/catalogo/${category.slug}`). All three blocks in a single `<script type="application/ld+json">` (or three sibling blocks; design phase decides).
5. **Swap shim for v2 adapter**: imports change from `from '../../data/catalog'` to `from '../../lib/catalog'`. The `getStaticPaths` uses `adapter.categories` directly. Per-item iteration reads `category.items` (the v2 `CatalogItem[]` already sorted by `display_name`) instead of the shim's `category.products`.
6. **Layout polish** (high-end-visual-design): per-page hero gets `padding-top: clamp(96px, 12vw, 144px)` and `text-wrap: balance` on h1, max 20-word subtitle, `letter-spacing: -0.03em` on h1. Category list rows get `--soft` background on hover, `--orange-deep` left accent on focused row (NOT a side-stripe border per impeccable ban). Drop shadows on the hero card (`0 24px 60px rgba(49, 62, 72, 0.12)`) and on the PDF button.
7. **Motion polish** (emil-design-eng): subtle stagger entry on item cards. Each row applies a 60ms-incrementing animation-delay (cap at 600ms for 10+ row categories) using a `cubic-bezier(0.16, 1, 0.3, 1)` 350ms ease-out on `opacity 0 -> 1` and `translateY(8px) -> 0`. `@media (prefers-reduced-motion: reduce)` block zeroes transforms.
8. **UX clarity** (impeccable): the per-category page is small (max 31 items) so no search/filter is needed. Back link (`Volver al catalogo`) lives at top, persistent. WhatsApp CTA is anchored at the page bottom (single, predictable). Error state for empty category: `<p class="cat-empty">No hay productos disponibles en esta categoria.</p>` rendered when `category.items.length === 0` (defensive; current data always has items but the code handles it).
9. **Anti-slop direction** (design-taste-frontend): no gradient text, no decorative emoji, no generic "card grid" -- each row is a horizontal flex container (`name | chip | code | CTA`). Typography uses `Inter` (Base.astro's existing font, no Inter ban enforced since this is a single page surface). Hero subtitle max 12 words.
10. **SEO + GEO** (seo-geo): canonical URL on every page (`<link rel="canonical" href="${PUBLIC_SITE_URL}/catalogo/${category.slug}" />`). `og:image` falls back to `/og-image.jpg` (if it exists) or `/logo-todohuincha.svg`. `og:locale = es_CL`. `<html lang="es-CL">` propagated via `Base.astro`. The `llms.txt` route (if added by another slice) is out of scope; slice 3 just ensures each category page emits the JSON-LD that AI search engines ingest.

## Decisions (resolved with user)

| Decision | Resolution |
|----------|------------|
| Pagination | NONE. Largest category has 31 items; fits a single page. Pagination deferred to a future slice if categories grow. |
| Hero image | NONE in slice 3. Deferred to slice 5 (per slice 2 archive, line 246-260). |
| WhatsApp per-category number | ONE number for all categories (`context="general"`). Per-category numbers deferred until data layer supports it. |
| Per-category SEO copy | USE `category.label` (the `category_dictionary[code].label` field, already exposed by the v2 adapter as `CategorySummary.label`). No new copy authored. |
| `CategoryPdfDownloadButton` vs `PdfDownloadButton` | NEW separate component. Catalog-level jsPDF logic stays in `PdfDownloadButton.astro`. Per-category jsPDF lives in `CategoryPdfDownloadButton.astro`. Duplicated brand-mark fallback chain (~30 lines) is documented and accepted. |
| JSON-LD strategy | 3 blocks: `CollectionPage` (page-level) + nested `ItemList` + `BreadcrumbList`. All in `<head>` (cleaner for crawlers than end-of-body). |
| Motion entry animation | YES, stagger 60ms-cap 600ms on item cards. `prefers-reduced-motion` respected. |
| Search filter on detail page | NONE. Max 31 items; sidebar groups already filter upstream. Adding search is overbuild. |
| `category-meta.ts` helper | EXTRACT pure helper for title/description/canonical/og:*/twitter:card/locale composition. TDD-first (6 assertions). Used by the page frontmatter. |

## Risks

| Risk | L | Mitigation |
|------|---|------------|
| `CategoryPdfDownloadButton` jsPDF duplication with `PdfDownloadButton` (catalog landing) and `DownloadPdf` (product detail) | LOW | Each owns its own generator (single responsibility). Brand-mark fallback chain (~30 lines) is the only duplication. Future slice may extract a shared `pdf-brand.ts` helper; out of scope for slice 3. |
| JSON-LD schema validation gaps | LOW | The JSON-LD blocks use `@context: https://schema.org` with explicit `@type` strings. Add a runtime smoke test (post-build) that confirms the JSON-LD blocks exist on every category page (`dist/catalogo/<slug>/index.html`). Manual check via Google's Rich Results Test for one category. |
| Meta tag composition drift across 21 pages | LOW | `category-meta.ts` helper centralizes composition. 6 TDD assertions lock the shape. Per-page HTML diff against `dist/catalogo/<slug>/index.html` confirms each page renders the expected tags. |
| SEO regressions (duplicate H1, missing canonical) | LOW | H1 is unique per page (`category.label`). Canonical is computed in `category-meta.ts`. Add a build-time check: parse `dist/catalogo/<slug>/index.html` and assert exactly one `<h1>` and one `<link rel="canonical">` per page. |
| Per-page HTML size with JSON-LD + meta + composed components | LOW | 21 pages, max 31 items each. JSON-LD `ItemList` for the biggest category (31 items) is ~3 KB inline. Total per-page payload: ~15-20 KB. No size concern. |
| Diff budget pressure (D2 = 800 lines; slice 2 was 813 with +13 overrun) | LOW | Estimated ~300 lines net: 1 new component ~210 + 1 helper ~30 + 2 tests ~120 + page rewrite ~140 - 306 = +194 lines. Comfortable margin. |
| Inactive state on sidebar item marked via `border-left` (impeccable ban) | LOW | Use background tint `var(--soft)` or full border instead. Verified slice 2's `CategorySidebar.astro` already uses background tint (no side-stripe in source). Slice 3 reuses the same convention. |
| Stagger animation exceeding 600ms total | LOW | Cap animation-delay at index 10 (10 * 60ms = 600ms); rows beyond index 10 use `animation-delay: 600ms` (no per-row increment past that point). |

## Rollback Plan

`git revert <slice-3-merge-commit>` restores the prior 306-line `src/pages/catalogo/[slug].astro` (shim-driven version with inline jsPDF) and removes the 4 new files. `src/lib/catalog.ts`, `src/data/catalog.ts`, slice 2 components (`CategorySidebar`, `ItemTypeChip`, `WhatsAppCta`, `PdfDownloadButton`), slice 1+2 helpers (`whatsapp.ts`, `categories.ts`), slice 1+2 test suites, and `.env.example` are unchanged. The dead-end WhatsApp links on `src/pages/productos/[category]/[reference].astro` and `src/pages/maquinaria/[slug].astro` stay as-is (out of scope; those are slice 4). No data migration. No DB. No env contract change.

## Dependencies

- Slice 1 `adapter` (frozen at 314 lines; sole owner of `categories`, `items`).
- Slice 2 helpers (`src/lib/whatsapp.ts`, `src/lib/categories.ts`).
- Slice 2 components (`CategorySidebar`, `ItemTypeChip`, `WhatsAppCta`).
- `jspdf` (already in `package.json`; used by the new `CategoryPdfDownloadButton`).
- `.env.example` `PUBLIC_WHATSAPP_NUMBERS` and `PUBLIC_SITE_URL` contracts (slice 1).
- 5 design skills: emil-design-eng, impeccable, design-taste-frontend, high-end-visual-design, seo-geo (applied in design phase; pattern match slice 2 section 9).
- No new npm dependencies.

## Success Criteria

- [ ] `npm test` passes (~42/42: 32 slice 1+2 + ~10 slice 3)
- [ ] `npx astro check` 0 errors
- [ ] `npx astro build` completes: 21 cat detail + 21 cat landing + 681 product + 2 API JSON + 1 root (counts match slice 2)
- [ ] Per-page `dist/catalogo/<slug>/index.html` shows: `CategorySidebar` with the current slug marked `is-active`, one `ItemTypeChip` per item, one `WhatsAppCta` (context `general`) at page bottom, one `CategoryPdfDownloadButton` in the header
- [ ] JSON-LD blocks present in `<head>` of every category detail page: one `CollectionPage`, one nested `ItemList` (length = `category.items.length`), one `BreadcrumbList`
- [ ] Per-page `<title>`, `<meta name="description">`, `<meta property="og:*">`, `<meta name="twitter:*">`, `<link rel="canonical">`, `<html lang="es-CL">` all present and correct
- [ ] WhatsApp CTA link has a real number when `PUBLIC_WHATSAPP_NUMBERS` env is set; renders disabled-state fallback when env is empty
- [ ] `CategoryPdfDownloadButton` click triggers PDF download with the per-category row set (not the full 681)
- [ ] No `Co-Authored-By`, no emoji, UTF-8 in all new files
- [ ] Source-only diff under 800 lines (D2 budget)
- [ ] Frozen files untouched: `src/lib/catalog.ts`, `src/data/catalog.ts`, `src/components/PdfDownloadButton.astro`, `src/components/DownloadPdf.astro`

## Open Questions

- None for the user. Defaults already set: no pagination, single WhatsApp CTA per page (context `general`), SEO copy from `category_dictionary.label`, no hero image, new `CategoryPdfDownloadButton` component. Internal decisions (TDD pattern, JSON-LD block placement, stagger cap, animation-delay cap) are documented inline above and resolved by the design phase.

PR title: `feat(catalog-ui): migrate category detail page to v2 data model (slice 3)`