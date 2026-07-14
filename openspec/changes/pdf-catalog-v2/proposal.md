# Proposal: pdf-catalog-v2

## Why

`src/components/PdfDownloadButton.astro` (slice 2, 291 lines) renders the
catalog PDF as a single generic table grouped by category. It does not use
`item.assets.main_image`, `machinery_profile.specification_groups`,
`machinery_profile.features`, or any per-type rendering. After
commit `a5d0d92` injected `machinery_profile` data for 16 SKUs from
`docs/pdf_metadata_markdown/`, the user has the data but the PDF cannot
show it. The user asked for **Option B (Modular por Tipo)** with a popup
of configuration toggles plus graceful fallbacks when data is missing.

## What Changes

| File | Status | Summary |
|------|--------|---------|
| `src/lib/pdf-types.ts` | NEW | Pure types + per-type dispatch helpers (`isMachinerySheet`, `isCompactRow`, `isServiceCard`). No IO. |
| `src/lib/pdf-image-fallback.ts` | NEW | Pure: `resolvePdfImageSrc(item, category, family, catalogAssets): string`. Resolves the best base64 or URL for jsPDF `addImage`, with the `pdf_image_fallback_order` chain and orange placeholder fallback. |
| `src/lib/pdf-options.ts` | NEW | Pure types + default values for the popup options (`modo: completo\|compacto`, `incluirPortada`, `incluirContraportada`, `incluirQrPorCategoria`). `serialize`/`deserialize` to a single `data-pdf-options` attribute. |
| `src/components/PdfOptionsDialog.astro` | NEW | Accessible modal dialog (`<dialog>` element, `showModal()`). Four toggles + "Generar Catalogo" CTA. Form-state via inputs, no JS framework. Trap-focus, Esc to close, `aria-modal`, `prefers-reduced-motion` guard. Mobile-first: full-screen sheet below 640px. |
| `src/components/PdfDownloadButton.astro` | REWRITE | 291 -> ~280 lines restructured. Branches on `item.item_type`: machinery -> full technical sheet (photo + brand + model + features bullets + grouped specs + price); simple_product/spare_part -> compact row (with brand badge for spare parts); service -> service card with WhatsApp link. Popup button opens `PdfOptionsDialog`. Two rendering modes: `completo` (per-type templates) and `compacto` (legacy table layout). Optional cover/back-cover/QR pages. Logo chain (DOM -> `/logo-todohuincha.svg` -> vector) extracted to local helper inside the file. |
| `src/lib/pdf-brand.ts` | NEW | Extract the duplicated `getLogoBase64` chain currently duplicated between `PdfDownloadButton.astro` and `CategoryPdfDownloadButton.astro`. Pure async, returns `Promise<string \| null>`. Also resolves cover image: `catalog_assets.cover_image.url` -> `/hero/taller-maquinaria.jpg` -> `/hero/taller.jpg` -> vector. |
| `src/components/CategoryPdfDownloadButton.astro` | MODIFY | Import `getLogoBase64` from `src/lib/pdf-brand.ts` instead of duplicating it. ~ -40 lines. |
| `tests/lib/pdf-image-fallback.test.mjs` | NEW | 8 cases: data_base64 preferred, URL fallback, category banner, family main, placeholder, null chain, broken URL on every level, missing catalog assets returns vector. |
| `tests/lib/pdf-options.test.mjs` | NEW | 5 cases: defaults, validate all 4 toggles, serialize round-trip, invalid `modo` rejected, deserialization from attribute. |
| `tests/lib/pdf-types.test.mjs` | NEW | 4 cases: dispatch by item_type, null safety on machinery_profile missing. |
| `scripts/parse-md-extracciones.mjs` | UNTOUCHED | Already injected 16 SKUs (commit a5d0d92). |

Delete: nothing.

## Impact

- `src/components/PdfDownloadButton.astro` rewrite: ~-10 lines net but ~280 lines restructured (modular dispatch). Diff is high because the body is reorganized.
- Popup adds DOM weight ~2 KB JS + ~1 KB CSS scoped.
- 4 new files total ~600 lines; 1 new test file ~120 lines.
- Affected item types: all 31 `machinery`, 21 `service` (already in service_catalog), 38 `spare_part`, ~588 `simple_product`.
- Browser target: same as current site (modern evergreen). jsPDF v3 unchanged.
- WhatsApp CTA in service-card mode reads `PUBLIC_WHATSAPP_NUMBERS` via the same `parseWhatsAppNumbers` helper from slice 2.
- Files untouched: `src/lib/catalog.ts`, `src/data/catalog-client.ts`, `src/data/catalog.ts` (shim), `src/pages/catalogo/index.astro` (the `data-rows`/`data-title`/`data-subtitle` attribute contract that drives the PDF is preserved; `updatePdfData` script in `index.astro` lines 378-414 stays intact).

## Out of Scope

- Server-side PDF generation (browser-only jsPDF stays; no Puppeteer, no headless Chrome).
- Image extraction from PDFs (already done by `scripts/parse-md-extracciones.mjs` and the `catalog-machinery-assets-embed` slice).
- New schema fields. The JSON contract for the .NET team is frozen; we read what is there.
- Re-uploading category banners or `catalog_assets.cover_image` (`url: null` today). Fallback chain ends at vector + `/hero/*` local photos; placeholder is the orange #FB4D08 rectangle, not a missing image that crashes the renderer.
- Resize/recompression of the 16 embedded PNGs. We use `data:image/png;base64,...` verbatim when present.
- Per-customer personalized catalogs (no auth, no per-user storage).
- A print-CSS path for browser-native PDF (out of scope: the user wants a download).
- Mobile-app integration. Web only.

## Capabilities

### New

- `pdf-catalog-v2`: per-type modular PDF generator with popup options and graceful fallback chain. Consumed only by `src/pages/catalogo/index.astro` in this slice; `src/lib/pdf-brand.ts` is also consumed by `CategoryPdfDownloadButton.astro` (slice 3) to remove a known duplication.

### Modified

- None. `src/lib/catalog.ts`, `src/data/catalog.ts`, `src/components/DownloadPdf.astro` (product detail) all stay frozen. The change is additive at the capability level.

## Approach

1. **TDD on three pure helpers** (`pdf-types`, `pdf-image-fallback`, `pdf-options`). Write the three new test files RED first, then GREEN. ~17 assertions total.
2. **Extract logo + cover fallback into `src/lib/pdf-brand.ts`**. This removes a 40-line duplication already called out in `CategoryPdfDownloadButton.astro` line 5-6 ("known duplication"). `getLogoBase64` and a new `getCoverImageBase64` live there.
3. **Rewrite `PdfDownloadButton.astro`** around a single `renderItem(item, y, pdf)` dispatcher. Branches on `item.item_type`. Each branch is a focused ~40-line function returning the new `y` position. Page decorations and table fallback stay shared.
4. **Popup as native `<dialog>`** (no custom modal lib). Four `<input type="checkbox|radio">` controls. Submit handler reads the form state into `pdfOptions` and triggers the existing `pdf.save(...)` flow.
5. **Graceful fallbacks**:
   - Image: `item.assets.main_image` (base64 -> url) -> `family.assets.main_image` -> `category.assets.banner` -> `catalog_assets.placeholder_image` -> `/hero/taller.jpg` -> orange rectangle.
   - Specs: empty `specification_groups` -> render simple row, no crash.
   - Price: missing `sale_amount` -> "A cotizar" label.
   - Brand: missing `brand` field -> drop the brand row, not a crash.
6. **Compact mode** keeps the current grouped-by-category layout as the second branch of the dispatcher. Both modes share the cover/back-cover/QR logic.
7. **Apply 5 design skills minimally**: emil-design-eng (cubic-bezier(0.16, 1, 0.3, 1), `prefers-reduced-motion`); impeccable (WCAG AA, focus trap on dialog, `aria-modal`, Esc to close); design-taste-frontend (display-heading on dialog title, `text-wrap: balance`); high-end-visual-design (double-bezel on popup CTA, 24px gap); seo-geo (semantic H2 in dialog, `aria-labelledby`).

## Decisions (resolved with user)

| Decision | Resolution |
|----------|------------|
| 1. PDF architecture | Option B (Modular por Tipo). Auto-detect `item.item_type`. |
| 2. Popup UI | Native `<dialog>` element. No headless-ui, no framework. |
| 3. Popup options | `modo` (completo\|compacto), `incluirPortada`, `incluirContraportada`, `incluirQrPorCategoria`. |
| 4. Mode "compacto" | Keeps the existing single-table grouped-by-category layout. |
| 5. Cover image source | `/hero/taller-maquinaria.jpg` (machinery catalog) -> `/hero/taller.jpg` (generic) -> vector. |
| 6. Service card WhatsApp | Reuse `parseWhatsAppNumbers` from slice 2. `machinery` context for `maquinaria` items, `sales` for the rest. |
| 7. Spare part brand | Show brand in compact row when present (one extra column). |
| 8. JSON contract | Frozen. We do not touch the schema. |

## Risks

| Risk | L | Mitigation |
|------|---|------------|
| jsPDF blob size > 10 MB for 681 products in machinery mode | MED | Compact mode is the escape hatch. Machinery mode by default; popup defaults to completo for the sidebar-filtered selection. |
| `<dialog>` not supported in old Safari (pre-15.4) | LOW | Current site already targets modern evergreen. No polyfill. |
| Popup focus trap broken on mobile | MED | Use `<dialog>` `showModal()` + manual focus-on-first-input on open. Manual smoke on mobile viewport via Playwright. |
| Image base64 inflates the runtime DOM before save | LOW | Fetch each image once per session, cache in a `Map<src, Promise<string>>`. |
| Cover/back-cover rendering breaks existing layout | LOW | Both gated behind toggles that default ON. Test toggles OFF too. |
| `pdf_image_fallback_order` paths in JSON reference `catalog_assets.placeholder_image` but `url: null` | LOW | Local fallback ends at `/hero/*` + vector. Tested explicitly. |

## Rollback Plan

`git revert <pdf-catalog-v2-merge-commit>` restores the prior single-table `PdfDownloadButton.astro` and removes the 4 new files plus the 3 new test files. The `pdf-brand.ts` extraction also reverts, which means `CategoryPdfDownloadButton.astro` gets its duplicated `getLogoBase64` back. No DB. No migration. The 16 injected `machinery_profile` objects stay in the JSON (commit `a5d0d92` is unrelated and stays).

## Dependencies

- Slice 1 `adapter` (frozen), slice 2 `PdfDownloadButton` (this slice), slice 2 `WhatsAppCta` (`parseWhatsAppNumbers`), slice 2 popup-script pattern from `src/pages/catalogo/index.astro` lines 252-554.
- `jspdf@^3.0.1` (already in deps, no change).
- `public/hero/*.jpg` (already in repo, used as cover fallback).
- `PUBLIC_WHATSAPP_NUMBERS` env contract from slice 1.
- No new npm dependencies. No new data files.

## Success Criteria

- [ ] `npm test` passes: prior 40+ + ~17 new = 57+.
- [ ] `npx astro check` 0 errors.
- [ ] `npx astro build` completes: 21 cat + 681 product + 2 API JSON + 1 catalog landing. Counts unchanged.
- [ ] `dist/catalogo/index.html` shows the new popup trigger and embeds `PdfOptionsDialog`.
- [ ] Manual smoke on the PDF: machinery item with full machinery_profile renders photo + 7 bullets + grouped specs + price; simple_product renders a compact row; service renders a card with WhatsApp link.
- [ ] Full catalog PDF (all 681 products) under 10 MB in completo mode.
- [ ] Full catalog PDF under 2 MB in compacto mode (no images).
- [ ] Popup closes on Esc, click outside, and the X button.
- [ ] Popup traps focus on mobile (tested with Playwright at 390px viewport).
- [ ] Toggle OFF for cover / back-cover / QR works without error.
- [ ] No emoji, no `Co-Authored-By`, no `§`, UTF-8 without BOM in any new file.
- [ ] Source-only diff under 900 lines.
- [ ] `src/lib/catalog.ts`, `src/data/catalog.ts`, `src/components/DownloadPdf.astro` unchanged.

PR title: `feat(pdf): modular per-type catalog PDF with options popup`