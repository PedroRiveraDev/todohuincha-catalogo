# Tasks: pdf-catalog-v2 (modular per-type catalog PDF + popup)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~860 net (3 helpers ~210 + 1 dialog ~200 + PdfDownloadButton rewrite ~280 - 291 prior + brand.ts ~70 + CategoryPdfDownloadButton refactor -40 + 3 test files ~140 + popup styles + popup scripts + docs) |
| 800-line budget risk | Medium-High (slightly over) |
| Chained PRs recommended | Optional. Acceptable as single PR (chunks are well-separated). |
| Suggested split | Single PR is OK; if reviewer flags size, split into PR-A (lib helpers + tests, ~400 lines) and PR-B (popup + PdfDownloadButton rewrite, ~460 lines). |
| Delivery strategy | single-pr |
| Chain strategy | single-pr |

Decision needed before apply: No
Chained PRs recommended: Optional
Chain strategy: single-pr
800-line budget risk: Medium-High

## 1. Setup

- [ ] T1. Verify clean working tree on `feat/catalog-robust-v2-base`: `git status --short` shows only untracked debug PNGs, `.bak`, and `.playwright-mcp/` (from prior debugging); `git branch --show-current` prints `feat/catalog-robust-v2-base`; `git log -1 --oneline` prints `a5d0d92 feat(data): inject machinery profiles for 16 SKUs from PDF extracciones.`; do NOT checkout main.

## 2. TDD: pdf-types lib (RED -> GREEN)

- [ ] T2. RED `tests/lib/pdf-types.test.mjs`: ~4 assertions for `isMachinerySheet(item)` (returns true on `item_type==='machinery'`), `isCompactRow(item)` (true on simple_product/spare_part), `isServiceCard(item)` (true on service), defensive null safety when `machinery_profile` is undefined; `npm test` -> FAIL (module missing).
- [ ] T3. GREEN `src/lib/pdf-types.ts`: export the three type guards plus a `PdfItemKind = 'machinery'|'compact_row'|'service_card'` type and a `dispatchItemKind(item): PdfItemKind` helper that routes by `item.item_type`; `npm test` -> pdf-types 4/4 pass, all prior tests still pass.

## 3. TDD: pdf-options lib (RED -> GREEN)

- [ ] T4. RED `tests/lib/pdf-options.test.mjs`: ~5 assertions for `defaultPdfOptions()` (modo='completo', all toggles true), `serializePdfOptions(opts)` produces a stable string, `deserializePdfOptions(attr)` round-trips, rejects unknown `modo` value, ignores extra keys; `npm test` -> FAIL.
- [ ] T5. GREEN `src/lib/pdf-options.ts`: export `defaultPdfOptions`, `serializePdfOptions`, `deserializePdfOptions`, type `PdfOptions` with the four fields; `npm test` -> pdf-options 5/5 pass.

## 4. TDD: pdf-image-fallback lib (RED -> GREEN)

- [ ] T6. RED `tests/lib/pdf-image-fallback.test.mjs`: ~8 assertions for `resolvePdfImageSrc(item, category, family, catalogAssets)`: data_base64 preferred (returns `data:image/png;base64,...`), URL fallback when b64 null, category banner URL, family main_image URL, placeholder image URL, full chain when all null returns vector id `__vector__`, broken URL on every level returns vector, null `assets` on item does not throw; `npm test` -> FAIL.
- [ ] T7. GREEN `src/lib/pdf-image-fallback.ts`: walk the `pdf_image_fallback_order` chain (`item.main_image` -> `family.main_image` -> `category.banner` -> `placeholder`) and return first non-null URL or base64; on total miss return the special token `__vector__` (caller renders orange rect). Fetch the URL via `fetch().then(r=>r.blob()).then(b=>URL.createObjectURL(...))` then `<img>` -> canvas -> base64; cache by URL in module-scope Map; `npm test` -> pdf-image-fallback 8/8 pass.

## 5. TDD: pdf-brand lib (extracted helper) (RED -> GREEN)

- [ ] T8. RED `tests/lib/pdf-brand.test.mjs`: ~3 assertions for `getLogoBase64()` returns null when DOM img missing AND fetch fails; returns string when DOM img present and CORS allows; `getCoverImageBase64()` returns base64 when `/hero/taller-maquinaria.jpg` loads, falls back to `/hero/taller.jpg`, falls back to vector token; `npm test` -> FAIL.
- [ ] T9. GREEN `src/lib/pdf-brand.ts`: extract `getLogoBase64` from the duplication at `src/components/PdfDownloadButton.astro:49-89` and `src/components/CategoryPdfDownloadButton.astro:61-101`; add `getCoverImageBase64` with the same DOM-fetch-canvas pattern; export both; `npm test` -> pdf-brand 3/3 pass.

## 6. Refactor: remove duplication from CategoryPdfDownloadButton

- [ ] T10. `src/components/CategoryPdfDownloadButton.astro`: replace lines 61-101 inline `getLogoBase64` with `import { getLogoBase64 } from '../lib/pdf-brand.ts'`; update the call site at line 110 (`const logoBase64 = await getLogoBase64();`) — same signature. Net ~-40 lines. No new behavior. `npx astro check` -> 0 errors. `npx astro build` -> same page count.

## 7. Popup component (no TDD; manual smoke later)

- [ ] T11. Create `src/components/PdfOptionsDialog.astro`: server-rendered `<dialog id="pdf-options-dialog" aria-labelledby="pdf-options-title">` with `<form method="dialog">` containing: (a) radio group for `modo` (completo|compacto), (b) three checkboxes for `incluirPortada`, `incluirContraportada`, `incluirQrPorCategoria`, (c) submit button "Generar Catalogo", (d) close button with `formnovalidate`. Hidden by default; client script wires the trigger button (passed via prop `triggerSelector`) to call `dialog.showModal()`, traps focus inside on `open`, restores focus on `close`, closes on Esc and click outside the inner card. Styles scoped via `<style>`; mobile-first: full-screen sheet on `<640px`, centered modal on `>=640px`. WCAG AA contrast; `prefers-reduced-motion` guard on the open/close transition.
- [ ] T12. Dialog ID stable across both `PdfDownloadButton` instances (catalog page + category page); use `data-pdf-options-dialog` attribute selector instead of a hardcoded `#pdf-options-dialog` to avoid collisions. Single instance per page.

## 8. Rewrite: PdfDownloadButton modular dispatcher

- [ ] T13. `src/components/PdfDownloadButton.astro` REWRITE: keep `Props` interface (`title`, `subtitle`, `rows`) but add a new optional `triggerSelector: string` prop (default `'#cat-pdf-btn'`). Body restructured: a single `dispatchItem(item, y, pdf, ctx)` function that calls one of three sub-renderers based on `dispatchItemKind(item)`. Each sub-renderer returns the new `y` coordinate. Shared helpers: `drawPageDecorations`, `drawTableHeader`, `getLogoBase64` (now imported from `pdf-brand`), `getCoverImageBase64`, `drawCoverPage`, `drawBackCoverPage`, `drawCategoryQrBadge`.
- [ ] T14. Sub-renderer `renderMachinerySheet(item, y, pdf, ctx)`: photo block (top, max height 60mm, fallback chain via `resolvePdfImageSrc`), heading (brand + model + display_name), description (1-2 lines), `features` bullets (each on its own line, max 8), `specification_groups` as a 2-column table per group (group header bar + label/value rows, truncated at 25 rows total to stay on one page), price line (or "A cotizar"), call-to-action footer with WhatsApp URL via `buildWhatsAppUrl`. Auto-`addPage()` when next item would not fit.
- [ ] T15. Sub-renderer `renderCompactRow(item, y, pdf, ctx)`: same row layout as today (code + name + category tag), plus brand badge column when `item.specifications.brand` is non-null. Used by `simple_product` and `spare_part`. Shared with `compacto` mode.
- [ ] T16. Sub-renderer `renderServiceCard(item, y, pdf, ctx)`: 1/3-page card. Heading (service name), short description, bullet list of capabilities from `service_profile.capabilities`, big "A cotizar" stamp, WhatsApp deep-link via `buildWhatsAppUrl` using `machinery` context (or `sales` if no machinery context available).
- [ ] T17. Mode dispatch: when `options.modo === 'compacto'`, skip the dispatcher and call the existing flat grouped-by-category loop (kept verbatim from current implementation, refactored only to share `drawTableHeader` and `getLogoBase64` imports).
- [ ] T18. Cover page: when `options.incluirPortada`, draw a full-bleed page (orange top band, centered logo via `getLogoBase64`, centered cover image via `getCoverImageBase64`, title, subtitle, date). Vector fallback renders solid orange rect.
- [ ] T19. Back cover: when `options.incluirContraportada`, draw a full page with company info, WhatsApp CTA, three social placeholders (Instagram, Facebook, web), and a placeholder QR (vector outline of a QR pattern is acceptable; actual QR generation is out of scope).
- [ ] T20. QR per category: when `options.incluirQrPorCategoria`, draw a small QR-code placeholder badge at the top of each category section in `compacto` mode AND at the top of each machinery section in `completo` mode. Vector-only.

## 9. Wire popup into the button

- [ ] T21. Click on the trigger button opens the dialog (not `pdf.save` directly). On submit, read the form state, `serialize` to the `data-pdf-options` attribute on the trigger button, call `dialog.close()`, then run the existing `pdf.save(...)` pipeline with the new dispatcher.
- [ ] T22. Persist last-used options to `localStorage['cat:pdf:options']` so the popup pre-selects the user's prior choice on next visit. Deserialize on page load and update the form fields. Survives sidebar selection changes (the popup is independent of which items are visible).

## 10. Update parent page wiring

- [ ] T23. `src/pages/catalogo/index.astro`: no changes to the `<PdfDownloadButton>` usage (props `title`, `subtitle`, `rows` preserved). On page load, deserialize `localStorage['cat:pdf:options']` and update `data-pdf-options` attribute so the popup script reads the right defaults. The `updatePdfData` script (lines 378-414) stays intact.

## 11. Verify

- [ ] T24. `npx astro check` -> 0 errors.
- [ ] T25. `npm test` -> 57/57 pass (40 prior + 4 pdf-types + 5 pdf-options + 8 pdf-image-fallback + 3 pdf-brand - 3 dedup'd).
- [ ] T26. `npx astro build` -> 21 cat + 681 product + 2 API + 1 catalog landing (same counts as slice 2). New: 1 popup component compiled.
- [ ] T27. Manual smoke on `dist/catalogo/index.html`: popup opens on button click, four toggles interactive, Esc closes, focus trap holds. Generate PDF with each of (completo + all toggles, completo + no cover, compacto + all toggles, completo + no QR). Verify file size < 10 MB for completo full-catalog and < 2 MB for compacto full-catalog.
- [ ] T28. Manual smoke on `dist/catalogo/<category>/index.html`: `CategoryPdfDownloadButton` still works after the `pdf-brand` extraction (regression check).
- [ ] T29. Playwright check at 390px viewport: dialog opens full-screen, focus on first radio, submit triggers PDF download.
- [ ] T30. `grep` for emoji + `Co-Authored-By` + section symbol across all new/modified files -> 0 matches. UTF-8 without BOM on all new files (use `file -i` or `Get-Content -Encoding UTF8`).

## 12. Commit and push

- [ ] T31. `git add -A`; verify staged: 4 new files in `src/lib/`, 1 new component, 3 new test files, 1 rewrite (`PdfDownloadButton`), 1 refactor (`CategoryPdfDownloadButton`); no secrets.
- [ ] T32. `git commit` subject `feat(pdf): modular per-type catalog PDF with options popup`; body covers what/why/acceptance; NO `Co-Authored-By`, NO emoji, NO `§`, UTF-8.
- [ ] T33. `git push origin feat/catalog-robust-v2-base` (do NOT checkout main).

## 13. PR summary block

```markdown
## pdf-catalog-v2: modular per-type catalog PDF + options popup

### What
- 4 new pure helpers: `src/lib/pdf-types.ts`, `src/lib/pdf-options.ts`, `src/lib/pdf-image-fallback.ts`, `src/lib/pdf-brand.ts`
- 1 new component: `src/components/PdfOptionsDialog.astro` (native `<dialog>`, accessible)
- Rewrite of `src/components/PdfDownloadButton.astro` (291 -> ~280 lines, restructured)
- Refactor of `src/components/CategoryPdfDownloadButton.astro` to remove the documented logo-duplication
- 3 new test files: pdf-types (4 cases), pdf-options (5 cases), pdf-image-fallback (8 cases), pdf-brand (3 cases)

### Why
- Slice 2's PDF generator renders a single generic table. It cannot use the `machinery_profile.specification_groups` and `features` data injected by commit a5d0d92 for 16 SKUs.
- User asked for Option B (Modular por Tipo) with a popup of configuration toggles.

### Acceptance
- [ ] `npm test`: 57/57 pass
- [ ] `npx astro check`: 0 errors
- [ ] `npx astro build`: 21 cat + 681 product + 2 API + 1 catalog landing
- [ ] Manual smoke on PDF: machinery items render full sheet; simple_product renders compact row; service renders WhatsApp card
- [ ] Popup closes on Esc, click outside, and X; focus trap holds at 390px viewport
- [ ] Full catalog PDF (681 products) < 10 MB in completo mode, < 2 MB in compacto mode
- [ ] No `Co-Authored-By`, no emoji, UTF-8 in all new files

### Stats
- 5 new source files
- 3 new test files
- 1 rewrite + 1 refactor
- ~860 source lines net
```

## 14. Rollback

`git revert <pdf-catalog-v2-merge-commit>` restores the prior single-table `PdfDownloadButton.astro` (291 lines) and `CategoryPdfDownloadButton.astro` (with its inline `getLogoBase64` duplication back). Removes the 4 new helpers, the dialog component, and the 3 new test files. The 16 injected `machinery_profile` objects from commit `a5d0d92` stay in the JSON (out of scope). No DB migration. No user-facing state beyond the `localStorage['cat:pdf:options']` key which is harmless to leave.

## 15. Risks per task

- T1: trivial.
- T2-T7: standard TDD cycles. tsx loader already in place. Risk: `pdf-image-fallback` requires `fetch` mocking — covered by using `node:test` mock or, simpler, by separating URL-resolution (pure) from fetching (impure) into two functions.
- T8-T9: trivial extraction.
- T10: trivial refactor; manual smoke confirms no regression.
- T11: `<dialog>` focus trap on mobile is the trickiest part. Mitigation: Playwright at 390px is a verify gate (T29).
- T12-T22: PdfDownloadButton rewrite is the largest change. Verify the existing flat-grouped layout still works in compacto mode (T27 covers this).
- T23-T26: standard verify gates.
- T27-T30: smoke + grep gates.
- T31-T33: conventional commit only.

## 16. Open decisions flagged for orchestrator

- Cover image priority order: `catalog_assets.cover_image.url` (currently null) -> `/hero/taller-maquinaria.jpg` -> `/hero/taller.jpg` -> vector. RESOLVED in proposal section "Decisions" #5. Surface to PM if `/hero/panel-1.jpg` ... `/hero/panel-6.jpg` should be considered instead.
- Service card WhatsApp context: `machinery` if available, else `sales`. RESOLVED in proposal. Surface to PM if `services` should be a separate context (would need a new env key).

---

Decision needed before apply: No
Chained PRs recommended: Optional
Chain strategy: single-pr
800-line budget risk: Medium-High