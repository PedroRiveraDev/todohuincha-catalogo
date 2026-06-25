# Proposal: catalog-v2-ui-migration-slice-2

## Why

Slice 1 froze `src/lib/catalog.ts` (v2 AJV adapter, 293 lines). The catalog landing page `src/pages/catalogo/index.astro` (447 lines) still consumes the v1 shim at `src/data/catalog.ts`, renders a flat 21-category sidebar with no grouping, lacks a working WhatsApp CTA (existing `wa.me/?text=...` links on `src/pages/productos/[category]/[reference].astro` and `src/pages/maquinaria/[slug].astro` have no recipient — dead end), and inlines ~360 lines of jsPDF generation in a `<script>` block. Slice 2 migrates the page to v2 directly, ships a grouped 8-group sidebar, integrates a context-aware WhatsApp CTA, moves the catalog PDF logic into a reusable component, and emits JSON-LD `ItemList` schema for SEO. Slices 3 and 4 will consume `src/lib/whatsapp.ts` to fix the same dead end on product-detail pages.

## What Changes

| File | Status | Summary |
|------|--------|---------|
| `src/lib/whatsapp.ts` | NEW | Pure: `parseWhatsAppNumbers(env)` -> `Record<string,string>`, `buildWhatsAppUrl(number, message)` -> wa.me URL. Empty or invalid input -> empty record. |
| `src/lib/categories.ts` | NEW | Pure: `groupCategoriesByGroup(categories)` (stable 8-group order), `sortItemsByDisplayName(items)` (locale `'es'`). |
| `src/components/CategorySidebar.astro` | NEW | Grouped sidebar with 8 sections. Sticky on desktop (top: 24px), `<dialog>` off-canvas drawer on `<768px`. Active state via `.is-active`. |
| `src/components/ItemTypeChip.astro` | NEW | Color chip per `item_type`: machinery=blue, service=orange, spare_part=gray, simple_product=light. Generic prop covers future `service` rows. |
| `src/components/WhatsAppCta.astro` | NEW | Reads `PUBLIC_WHATSAPP_NUMBERS` at build via `import.meta.env`. Disabled-state fallback copy when env missing. Double-bezel button + button-in-button trailing icon (high-end-visual-design skill). |
| `src/components/PdfDownloadButton.astro` | NEW | Wraps catalog-level jsPDF logic currently inline in `index.astro:84-446`. Distinct from `src/components/DownloadPdf.astro` (product detail, untouched). `rows: string[]` prop replaces inline `JSON.parse(data-attribute)`. |
| `src/pages/catalogo/index.astro` | REWRITE | 447 -> ~200 lines. Consumes `adapter` from `src/lib/catalog.ts` directly (bypasses shim). Hero refresh, search filter (100ms debounce, vanilla JS in `<script>`), JSON-LD `ItemList` with 687 entries at end of body. |
| `tests/lib/whatsapp.test.mjs` | NEW | 8 cases: parse (5: undefined, empty, single, multi, invalid) + URL build (3: plain, space, missing-plus). |
| `tests/lib/category-grouping.test.mjs` | NEW | 6 cases: group (3: empty, single, 8-group order) + sort (3: empty, reverse, locale-aware). |

Delete: none.

## Impact

- `src/pages/catalogo/index.astro`: rewrite, ~-247 lines net.
- Build outputs: 21 cat + 681 product + 2 API JSON + 1 catalog landing. Counts unchanged; only the landing HTML changes.
- Tests: 18 (slice 1) + ~14 (slice 2) = ~32 passing.
- `PUBLIC_WHATSAPP_NUMBERS` env contract from slice 1 now actually consumed by a CTA component.
- Untouched: `src/lib/catalog.ts`, `src/data/catalog.ts`, `src/components/DownloadPdf.astro`, slice 3/4 pages, `src/layouts/Base.astro`.
- Image asset policy: no new images in slice 2 (banner integration deferred to slice 5).

## Capabilities

### New
- `catalog-landing-ui`: v2-driven catalog landing page. Grouped 8-group sidebar, item-type chips, context-aware WhatsApp CTA, catalog-level PDF component, client-side search filter, JSON-LD `ItemList` schema. Pure helpers (`src/lib/whatsapp.ts`, `src/lib/categories.ts`) consumed by slices 3 and 4.

### Modified
- None. Slice 1's `catalog-adapter` stays frozen.

## Approach

1. **TDD-first on the pure helpers**: write `tests/lib/whatsapp.test.mjs` and `tests/lib/category-grouping.test.mjs` RED, then GREEN in `src/lib/whatsapp.ts` and `src/lib/categories.ts`. Same red-green-refactor discipline slice 1 applied to `catalog-adapter`.
2. **Components built on props, no business logic**: `CategorySidebar`, `ItemTypeChip`, `WhatsAppCta`, `PdfDownloadButton` each take props. The jsPDF logic moves verbatim from `index.astro:84-446` into `PdfDownloadButton.astro` with one refactor: `rows` becomes a typed `string[]` prop instead of the inline `JSON.parse(data-attribute)`.
3. **Page rewrite consumes adapter directly**: imports `adapter` from `src/lib/catalog.ts`, not the shim. Sorts via `sortItemsByDisplayName`, groups via `groupCategoriesByGroup`. Search filter and sidebar filter as a single vanilla-JS `<script>` at the bottom of the page.
4. **JSON-LD `ItemList` schema** (seo-geo skill): 687 `ListItem` entries emitted via `JSON.stringify(adapter.items.map(...))` in a `<script type="application/ld+json">` block at end of body.
5. **Design skills applied minimally** (per "apply 5 skills, minimal"): emil-design-eng (cubic-bezier(0.16, 1, 0.3, 1) easing, scale(0.97) on `:active` for buttons, 150ms transitions, `prefers-reduced-motion`); impeccable (WCAG AA contrast, semantic z-index scale, no gradient text on NEW components); design-taste-frontend (`text-wrap: balance` on h1, max 8 sections, hero ≤2 lines + ≤20 words subtitle, display-heading letter-spacing -0.03em); high-end-visual-design (double-bezel + button-in-button trailing icon on `WhatsAppCta`, py-24+ hero whitespace, layout collapse to `w-full` on `<768px`); seo-geo (JSON-LD, semantic H1 with primary keyword, alt text on chip icons).
6. **Impeccable side-stripe check**: the explore referenced an existing `.cat-sidebar-item.is-active` `border-left: 3px solid var(--orange)` rule in `Base.astro`. Verification in slice 2 found that rule does NOT exist anywhere in `src/` (grep returns 0 matches). The "impeccable exception" rationale is moot. The new `CategorySidebar` MUST NOT introduce a side-stripe border on `.is-active`. Use a background tint or full border instead.

## Decisions (resolved with user)

| Decision | Resolution |
|----------|------------|
| Sidebar groups: 6 (prompt) vs 8 (data) | All 8 groups in fixed order: sierras (279), consumibles (146), cuchillos (97), herramientas (40), materiales (40), servicios (33), maquinaria (31), instrumentos (21). |
| Banner images per group | SKIP. Option (c). No image mapping in sidebar, no banner photos. Deferred to slice 5. |
| Test file paths | `tests/lib/whatsapp.test.mjs` and `tests/lib/category-grouping.test.mjs`. Matches `package.json` glob `tests/**/*.test.mjs`. |
| Astro component snapshot testing | SKIP. Astro components not unit-testable with `node:test`. TDD stays on pure lib helpers; manual smoke on `dist/catalogo/index.html` after `astro build`. |
| Side-stripe border on active sidebar item | NOT introduced. Verification showed the prior rule did not exist; new code uses background tint or full border instead. |
| `PdfDownloadButton` vs `DownloadPdf` | NEW separate component. Catalog-level jsPDF logic only; `DownloadPdf.astro` (product detail, 297 lines) stays untouched. Future slice may unify via shared jsPDF generator. |

## Risks

| Risk | L | Mitigation |
|------|---|------------|
| Astro component testing gap (no `node:test` snapshot for `.astro`) | HIGH | TDD on pure lib helpers (`whatsapp.ts`, `categories.ts`); manual smoke on `dist/catalogo/index.html` after `astro build` confirms rendered HTML. Same pattern slice 1 used for `dist/` smoke. |
| Diff budget pressure (D2 = 800 lines) | MED | Estimated ~340 lines net: 4 components ~200 + 2 helpers ~60 + 2 tests ~80 + page rewrite -250. Comfortable margin. `PdfDownloadButton` jsPDF verbatim duplication is the only risk to push higher. |
| `PdfDownloadButton` jsPDF duplication with `DownloadPdf` | MED | Catalog jsPDF moves verbatim into new component. `DownloadPdf` stays separate. Future slice may consolidate via shared generator. Not in slice 2 scope. |
| Slice 5 image integration may require page rewrite again | LOW | `ItemTypeChip` and `CategorySidebar` designed with optional image URL props from the start. Components are image-aware even when not yet rendering. |
| `PUBLIC_WHATSAPP_NUMBERS` env empty at build | LOW | `WhatsAppCta` renders disabled-state fallback with copy `Configura PUBLIC_WHATSAPP_NUMBERS en .env`. Build never fails. |
| Sidebar group order drift if adapter order changes | LOW | Hardcoded 8-group order in `groupCategoriesByGroup` is the contract; spec pins the order so future adapter changes don't silently re-rank. |

## Rollback Plan

`git revert <slice-2-merge-commit>` restores the prior 447-line `src/pages/catalogo/index.astro` (flat-sidebar v1-shim version) and removes the 8 new files. `src/lib/catalog.ts`, `src/data/catalog.ts` shim, `src/components/DownloadPdf.astro`, `.env.example` env contract, and slice 1's test suite are unchanged. No DB migration. The dead-end WhatsApp links on `src/pages/productos/[category]/[reference].astro` and `src/pages/maquinaria/[slug].astro` stay as-is (out of scope; slices 3 and 4 will fix once they adopt `src/lib/whatsapp.ts`).

## Dependencies

- Slice 1 `adapter` (frozen). All data via `src/lib/catalog.ts`.
- `.env.example` `PUBLIC_WHATSAPP_NUMBERS` contract from slice 1.
- `jspdf` (already in deps; used by the existing inline script that moves verbatim into `PdfDownloadButton`).
- 5 design skills: emil-design-eng, impeccable, design-taste-frontend, high-end-visual-design, seo-geo.
- No new npm dependencies.

## Success Criteria

- [ ] `npm test` passes (~32/32: 18 slice 1 + ~14 slice 2)
- [ ] `npx astro check` 0 errors
- [ ] `npx astro build` completes: 21 cat + 681 product + 2 API JSON + 1 landing
- [ ] `dist/catalogo/index.html` shows: 8-group sidebar in fixed order, `ItemTypeChip` per row, search filter working (100ms debounce), `WhatsAppCta` with recipient number when env set, `PdfDownloadButton` triggers download
- [ ] JSON-LD `ItemList` block present at end of `dist/catalogo/index.html` with 687 `ListItem` entries
- [ ] No `Co-Authored-By`, no emoji, UTF-8 in all new files
- [ ] Source-only diff under 800 lines
- [ ] `src/lib/catalog.ts`, `src/data/catalog.ts`, `src/components/DownloadPdf.astro` unchanged

PR title: `feat(catalog-ui): migrate catalog landing to v2 data model (slice 2)`
