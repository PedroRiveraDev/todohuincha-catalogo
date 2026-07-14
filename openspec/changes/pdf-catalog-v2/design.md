# Design: pdf-catalog-v2

> Modular per-type catalog PDF + accessible options popup.
> Slice 5 of catalog-v2-ui-migration.
> Refs:
>   openspec/changes/pdf-catalog-v2/proposal.md
>   openspec/changes/pdf-catalog-v2/spec.md
>   openspec/changes/pdf-catalog-v2/tasks.md

---

## 1. Goals and Non-Goals

### 1.1 Goals

| Goal | Source |
|------|--------|
| Per-type dispatcher (machinery / simple_product / spare_part / service) | proposal Decisions #1; spec "per-type template dispatcher" |
| Native `<dialog>` popup with 4 controls: `modo`, `incluirPortada`, `incluirContraportada`, `incluirQrPorCategoria` | proposal Decisions #2/#3; spec "pdf options popup" |
| Skip popup when `cat:pdf:options` already in localStorage; otherwise open with defaults | user-decided gap #1 |
| Image fallback chain: data_base64 -> url -> family -> category.banner -> placeholder -> /hero/* -> vector sentinel | spec "image fallback chain" |
| Extract `getLogoBase64` into `src/lib/pdf-brand.ts`; remove duplication from `CategoryPdfDownloadButton.astro` | spec "logo extraction helper" |
| Two modes: `completo` (per-type) and `compacto` (legacy grouped table) | proposal Decisions #4 |
| WhatsApp context: `sales` for machinery sheet footer AND service card (both) | user-decided gap #2 |

### 1.2 Non-goals

| Non-goal | Source |
|----------|--------|
| Server-side PDF (Puppeteer / headless Chrome) | proposal Out of Scope |
| Image extraction from PDFs (already done in commit a5d0d92) | proposal Out of Scope |
| New schema fields; frozen JSON contract | proposal Out of Scope |
| Refactor `DownloadPdf.astro` and `ProductPdfDownloadButton.astro` | spec "logo extraction helper" (last paragraph) |
| Real QR-code generation (vector placeholder only) | proposal Out of Scope |
| Per-customer personalized catalogs | proposal Out of Scope |

---

## 2. Architecture Overview

### 2.1 Component / data flow

```
                src/lib/catalog.ts (FROZEN adapter, slice 1)
                adapter.items[681]   adapter.categories[21]
                adapter.serviceCategories[10]
                            |
                            | props (title, subtitle, rows)
                            v
    +----------------------------------------------------+
    | src/components/PdfDownloadButton.astro (REWRITE)  |
    |  server: <button id="cat-pdf-btn" + triggerSelector|
    |  client <script>:                                  |
    |    click -> read localStorage['cat:pdf:options']  |
    |    if present: deserializePdfOptions -> generatePDF|
    |    else: open PdfOptionsDialog                     |
    +----------------+----------------------+------------+
                     |                      |
                     | custom event         | contains <dialog>
                     v                      v
    +-------------------+         +-------------------------+
    | PdfDownloadButton |         | src/components/         |
    | receives          | <-----  |   PdfOptionsDialog.astro|
    | pdf:options-      | event   | <dialog> + 4 controls   |
    | confirmed         |         | focus trap, Esc, X btn  |
    +-------------------+         +-------------------------+
              |
              | generatePDF(opts) calls:
              v
    +-----------------------+  +---------------------+  +---------------------+
    | src/lib/pdf-types.ts  |  | src/lib/pdf-image-  |  | src/lib/pdf-brand.ts|
    | dispatchItemKind      |  |   fallback.ts       |  | getLogoBase64       |
    | isMachinerySheet      |  | resolvePdfImageSrc  |  | getCoverImageBase64 |
    | isCompactRow          |  | (cached Map)        |  +---------------------+
    | isServiceCard         |  +---------------------+
    +-----------+-----------+
                |
                | routes to sub-renderers (in PdfDownloadButton.astro)
                v
    +----------------------------------------------------+
    | generatePDF(opts) main loop                        |
    |                                                    |
    | if opts.incluirPortada -> drawCoverPage()          |
    |                                                    |
    | for cat of visibleCats():                          |
    |   if opts.incluirQrPorCategoria                    |
    |     drawCategoryQrBadge(cat)                       |
    |   for item of cat.items:                           |
    |     y = dispatchItemKind(item) ->                  |
    |         renderMachinerySheet OR renderCompactRow OR|
    |         renderServiceCard(item, y, pdf, ctx)       |
    |                                                    |
    | if opts.incluirContraportada -> drawBackCoverPage()|
    +----------------------------------------------------+
```

### 2.2 Module responsibilities

| Module | Status | Responsibility |
|--------|--------|---------------|
| `src/lib/pdf-types.ts` | NEW | Pure: `dispatchItemKind(item)` returns `'machinery' \| 'compact_row' \| 'service_card'`. Type guards `isMachinerySheet`, `isCompactRow`, `isServiceCard`. No IO. |
| `src/lib/pdf-options.ts` | NEW | Pure: `defaultPdfOptions()`, `serializePdfOptions(opts)`, `deserializePdfOptions(raw)`. Validates `modo` enum + bool coercion. No IO. |
| `src/lib/pdf-image-fallback.ts` | NEW | `resolvePdfImageSrc(item, category, family, catalogAssets)` walks 8-step chain; module-scope `Map<string, Promise<string>>` cache; returns sentinel `__vector__` on total miss. |
| `src/lib/pdf-brand.ts` | NEW | `getLogoBase64()` (DOM img canvas -> fetch /logo-todohuincha.svg -> null). `getCoverImageBase64()` (catalog_assets.cover_image.url -> /hero/taller-maquinaria.jpg -> /hero/taller.jpg -> null). |
| `src/components/PdfOptionsDialog.astro` | NEW | Server-rendered `<dialog>` + scoped `<style>`. Client script: focus trap, Esc handler, backdrop click, submit -> dispatch `pdf:options-confirmed` CustomEvent. |
| `src/components/PdfDownloadButton.astro` | REWRITE | Adds `triggerSelector` prop. Owns dispatcher + sub-renderers + cover/back-cover/QR helpers. Click handler with skip-or-open semantics. |
| `src/components/CategoryPdfDownloadButton.astro` | MODIFY | Remove inline `getLogoBase64` (lines 61-101). Import from `../lib/pdf-brand.ts`. Net ~-40 lines. |

### 2.3 Separation rationale

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where dispatcher lives | `src/lib/pdf-types.ts` (pure) | Apply-phase TDDs the routing without jsPDF in the loop. |
| Where image chain lives | `src/lib/pdf-image-fallback.ts` | Pure URL resolution is unit-testable; the only async step (fetch + canvas) is co-located. |
| Where popup lives | `PdfOptionsDialog.astro` (isolated component) | Single concern; `PdfDownloadButton` only emits/handles a custom event. |

---

## 3. Module Layout

| File | Status | Purpose | ~LOC |
|------|--------|---------|------|
| `src/lib/pdf-types.ts` | NEW | `PdfItemKind` union + 3 type guards + `dispatchItemKind`. | 30 |
| `src/lib/pdf-options.ts` | NEW | `PdfOptions` interface + `defaultPdfOptions` + `serialize/deserialize`. | 50 |
| `src/lib/pdf-image-fallback.ts` | NEW | `resolvePdfImageSrc` walker + module-scope cache + private `imageToBase64(url)`. | 80 |
| `src/lib/pdf-brand.ts` | NEW | `getLogoBase64` + `getCoverImageBase64`. Extracted from existing duplications. | 70 |
| `src/components/PdfOptionsDialog.astro` | NEW | `<dialog>` markup + scoped CSS + client `<script>` for a11y hooks. | 200 |
| `src/components/PdfDownloadButton.astro` | REWRITE | Dispatcher + 3 sub-renderers + cover/back-cover/QR helpers + skip-or-open click handler. | 280 |
| `src/components/CategoryPdfDownloadButton.astro` | MODIFY | Drop inline `getLogoBase64` (lines 61-101); import from `../lib/pdf-brand.ts`. | -40 |
| `tests/lib/pdf-types.test.mjs` | NEW | 4 cases. | 40 |
| `tests/lib/pdf-options.test.mjs` | NEW | 5 cases. | 50 |
| `tests/lib/pdf-image-fallback.test.mjs` | NEW | 8 cases. | 80 |
| `tests/lib/pdf-brand.test.mjs` | NEW | 3 cases. | 30 |

---

## 4. Template Rendering

### 4.1 `machinery` -> `renderMachinerySheet`

Per-item page (auto-`addPage` when next item would not fit).

```
    +------------------------------------------------------+
    |  [photo block] (max 60mm height; vector on miss)    |
    +------------------------------------------------------+
    |  BRAND . MODEL                                       |
    |  Display Name (helvetica bold 16pt)                  |
    |  Description (italic 10pt, 1-2 lines max)            |
    +------------------------------------------------------+
    |  Features (bullet, cap 8):                           |
    |   * bullet 1                                         |
    |   * bullet 2                                         |
    +------------------------------------------------------+
    |  Specification Group 1                               |
    |   label ............ value                           |
    |   label ............ value                           |
    |  Specification Group 2 (cap 25 rows total across     |
    |                        all groups)                   |
    +------------------------------------------------------+
    |  Price: $123.456 CLP  (or "A cotizar" if missing)    |
    +------------------------------------------------------+
    |  [WhatsApp CTA footer] -> wa.me/<sales-number>       |
    +------------------------------------------------------+
```

- Data fields: `machinery_profile.brand`, `model`, `display_name`, `short_description`, `features`, `specification_groups`, `pricing.sale_amount`.
- Fallbacks: missing `brand` row -> drop, missing `model` row -> drop, empty `features` -> skip section, empty `specification_groups` -> skip section, missing `sale_amount` -> literal `A cotizar`.
- Image: `resolvePdfImageSrc(item, category, family, catalogAssets)`. Sentinel `__vector__` renders `pdf.setFillColor(251, 77, 8); pdf.rect(x, y, w, h, 'F');`.

### 4.2 `simple_product` / `spare_part` -> `renderCompactRow`

Single row inside the grouped table (used by both `compacto` mode and the `completo` per-category table).

```
    +--------------------------------------------------------+
    | COD-123   Product Name (multiline allowed)             |
    +--------------------------------------------------------+
    | Category: Sierras                                      |
    | [MFR: ABC-123]   (only if spare_part with             |
    |                   specifications.manufacturer_reference)|
    | [Brand: Bosch]   (only if spare_part with              |
    |                   specifications.brand)                |
    +--------------------------------------------------------+
```

- Data fields: `sku`, `display_name`, `category.label`. No image (size optimization).
- Spare-part extension: when `specifications.manufacturer_reference` is a non-empty string, render `MFR: <value>` chip (spec scenario "spare part shows manufacturer reference when present").
- Brand extension: when `specifications.brand` is non-null, render `Brand: <value>` badge.

### 4.3 `service` -> `renderServiceCard`

1/3-page card, stacked vertically in its own `Servicios` section.

```
    +----------------------------------------------------+
    |  [service name]  (helvetica bold 14pt)              |
    |  Short description (italic 10pt)                   |
    +----------------------------------------------------+
    |  Capabilities:                                      |
    |   * capability 1                                    |
    |   * capability 2                                    |
    +----------------------------------------------------+
    |  A COTIZAR                                          |
    +----------------------------------------------------+
    |  [WhatsApp CTA] -> wa.me/<sales-number>            |
    +----------------------------------------------------+
```

- Data fields: `service_name`, `short_description`, `service_profile.capabilities`, `service_profile.pricing_mode`.
- WhatsApp: `buildWhatsAppUrl(numbers.sales, 'Hola, quiero cotizar el servicio ${name}')`. Per user-decided gap #2: always `sales` context.
- Empty capabilities: skip the bullet block. Missing `pricing_mode`: still render the `A cotizar` stamp (it's the default).

### 4.4 Dispatch table

| `item.item_type` | `dispatchItemKind` -> | sub-renderer |
|------------------|------------------------|--------------|
| `machinery` | `'machinery'` | `renderMachinerySheet` |
| `simple_product` | `'compact_row'` | `renderCompactRow` |
| `spare_part` | `'compact_row'` | `renderCompactRow` |
| `service` | `'service_card'` | `renderServiceCard` |

Sub-renderer signature:

```typescript
type RenderCtx = {
  category: CategorySummary;
  family: unknown | null;
  catalogAssets: CatalogAssets;
  whatsappNumbers: Record<string, string>;
};
function renderMachinerySheet(item, y, pdf, ctx): number;
function renderCompactRow(item, y, pdf, ctx): number;
function renderServiceCard(item, y, pdf, ctx): number;
```

---

## 5. Image Fallback Chain

### 5.1 Chain order (8 steps, return first non-null)

```
    resolvePdfImageSrc(item, category, family, catalogAssets)
        |
        | step 1: data_base64 on the item itself
        v
    item.assets?.main_image?.data_base64?
        yes -> return "data:image/png;base64,<data>" (verbatim)
        no  -> step 2
        v
    item.assets?.main_image?.url?
        yes -> enqueue fetch -> cache -> return
        no  -> step 3
        v
    family?.assets?.main_image?.url?
        yes -> enqueue fetch -> cache -> return
        no  -> step 4
        v
    category?.assets?.banner?.url?
        yes -> enqueue fetch -> cache -> return
        no  -> step 5
        v
    catalogAssets?.placeholder_image?.url?
        yes -> enqueue fetch -> cache -> return
        no  -> step 6
        v
    "/hero/taller-maquinaria.jpg"   (static fallback)
        yes -> enqueue fetch -> cache -> return
        no  -> step 7
        v
    "/hero/taller.jpg"              (static fallback)
        yes -> enqueue fetch -> cache -> return
        no  -> step 8
        v
    return "__vector__"   (caller renders #FB4D08 rect)
```

### 5.2 Cache contract

Module-scope `Map<string, Promise<string>>` keyed by canonical URL string. First call starts the fetch; subsequent calls return the same in-flight promise. Cleared at end of each `generatePDF` run by exporting a `_resetCache()` test-only helper.

### 5.3 Null safety

| Input | Behavior |
|-------|----------|
| `item` null/undefined | Throw (caller invariant) |
| `item.assets` null/undefined | Skip steps 1 + 2, continue |
| `family` null/undefined | Skip step 3, continue |
| `category` null/undefined | Skip step 4, continue |
| `catalogAssets` null/undefined | Skip step 5, continue |
| URL fetch throws | Try next step (do not propagate) |
| Every step returns null | Return `"__vector__"` |

---

## 6. Popup UX

### 6.1 Default values (localStorage empty)

```typescript
defaultPdfOptions() = {
  modo: 'completo',
  incluirPortada: true,
  incluirContraportada: true,
  incluirQrPorCategoria: false,
  selectedSlugs: ['__all__'],
  savedAt: new Date().toISOString()
}
```

### 6.2 Skip semantics (user-decided gap #1)

```typescript
function onTriggerClick() {
  const stored = localStorage.getItem('cat:pdf:options');
  if (stored) {
    const opts = deserializePdfOptions(stored);
    generatePDF(opts);          // skip the dialog entirely
  } else {
    pdfOptionsDialog.showModal();
    focusFirstInput(dialog);
  }
}
```

The dialog opens on first-ever visit (storage empty). On subsequent visits the user's prior choice is replayed silently. A "Reset to defaults" link inside the dialog writes `defaultPdfOptions()` to localStorage and re-opens the form.

### 6.3 Form controls

| Control | Type | Name | Default | Validation |
|---------|------|------|---------|------------|
| Modo | radio | `modo` | `completo` | MUST be `completo` or `compacto`; reject otherwise |
| Incluir portada | checkbox | `incluirPortada` | `true` | Coerce to bool |
| Incluir contraportada | checkbox | `incluirContraportada` | `true` | Coerce to bool |
| Incluir QR por categoria | checkbox | `incluirQrPorCategoria` | `false` | Coerce to bool |
| Submit | button | `Generar Catalogo` | - | `<form method="dialog">` closes + dispatches event |
| Cancel | button | `Cancelar` | - | `formnovalidate`; closes via `dialog.close('cancel')` |

### 6.4 Validation rules

- Reject `modo` not in `{completo, compacto}`. Fall back to `defaultPdfOptions()` (spec scenario "rejects invalid persisted mode and falls back to defaults").
- Both `incluirPortada` AND `incluirContraportada` `false` is valid (spec scenario "both toggles off").
- A "Reset" button writes `defaultPdfOptions()` to the form fields AND to localStorage, then closes the dialog.

### 6.5 Accessibility

| Requirement | Implementation |
|-------------|----------------|
| `aria-labelledby` | `<dialog aria-labelledby="pdf-options-title">` + `<h2 id="pdf-options-title">` |
| Focus trap | On `showModal()`, focus first `<input>`. Tab loops between first and last control (manual handlers). |
| Esc to close | Native `<dialog>` behavior |
| Click outside (backdrop) | `dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close() })` |
| Restore focus on close | Store `document.activeElement` before `showModal()`; restore on close |
| `prefers-reduced-motion` | Wrap transitions in `@media (prefers-reduced-motion: no-preference) { ... }`; zero transitions otherwise |
| Mobile breakpoint | < 640px: full-screen sheet (`max-width: 100vw; max-height: 100vh; border-radius: 0`). >= 640px: centered modal `max-width: 480px`. |

---

## 7. Storage Contract

### 7.1 Key and shape

Key: `localStorage['cat:pdf:options']`

```json
{
  "modo": "completo",
  "incluirPortada": true,
  "incluirContraportada": true,
  "incluirQrPorCategoria": false,
  "selectedSlugs": ["__all__"],
  "savedAt": "2026-06-27T15:32:00.000Z"
}
```

The four required fields (`modo`, `incluirPortada`, `incluirContraportada`, `incluirQrPorCategoria`) are the spec's locked contract (scenarios in `spec.md` reference them verbatim). `selectedSlugs` and `savedAt` are extras that survive the dialog -> PDF pipeline so the per-category QR badge can deep-link to the same selection. Payload size: ~200 bytes per write.

### 7.2 Serialize / deserialize

```typescript
serializePdfOptions(opts: PdfOptions): string;
// -> JSON.stringify({modo, incluirPortada, incluirContraportada,
//                    incluirQrPorCategoria, selectedSlugs, savedAt})

deserializePdfOptions(raw: string | null): PdfOptions;
// -> parse JSON; on JSON error OR invalid modo -> defaultPdfOptions();
// coerce each bool with Boolean(...) so 'false' / '0' / missing all
// normalize; ignore extra keys (forward-compat).
```

### 7.3 Reconciliation note

A user-supplied JSON sample in this design's brief used field names `cover`, `backCover`, `qrPerCategory` instead of the spec's `incluirPortada`, `incluirContraportada`, `incluirQrPorCategoria`. **The spec field names win** because the spec is the locked contract. The apply phase MUST use the spec names. If the spec names should change, update `spec.md` before apply.

---

## 8. Testing Strategy

### 8.1 TDD ordering (mirrors `tasks.md`)

| Step | RED (write test) | GREEN (write impl) | Spec requirement satisfied |
|------|------------------|--------------------|---------------------------|
| 1 | `tests/lib/pdf-types.test.mjs` (4 cases) | `src/lib/pdf-types.ts` | "per-type template dispatcher" scenarios 1-4 |
| 2 | `tests/lib/pdf-options.test.mjs` (5 cases) | `src/lib/pdf-options.ts` | "pdf options popup" scenarios 1-3 |
| 3 | `tests/lib/pdf-image-fallback.test.mjs` (8 cases) | `src/lib/pdf-image-fallback.ts` | "image fallback chain" scenarios 1-4 |
| 4 | `tests/lib/pdf-brand.test.mjs` (3 cases) | `src/lib/pdf-brand.ts` | "logo extraction helper" scenarios 1-3 |
| 5 | (no test) `src/components/PdfOptionsDialog.astro` | manual smoke + Playwright at 390px | "pdf options popup" scenario 4 (closes on Esc) |
| 6 | (no test) `PdfDownloadButton.astro` REWRITE | manual smoke on dist HTML | remaining scenarios |

### 8.2 Test-to-scenario map

| Test file | Spec scenarios covered |
|-----------|------------------------|
| `pdf-types.test.mjs` | machinery item renders full sheet; spare part shows manufacturer reference when present; service card uses sales context; missing machinery_profile does not throw |
| `pdf-options.test.mjs` | opens with default options; persists options to localStorage on confirm; rejects invalid persisted mode and falls back to defaults |
| `pdf-image-fallback.test.mjs` | data_base64 returned verbatim; total miss returns vector sentinel; null item assets does not throw; same URL is cached |
| `pdf-brand.test.mjs` | returns null when DOM img missing and fetch fails; returns base64 when DOM img is present; CategoryPdfDownloadButton no longer duplicates the helper |

### 8.3 Test mocking strategy

- `pdf-image-fallback`: pure chain walker is unit-testable with synthetic input objects. Fetch helper accepts an injected `fetchImpl` parameter (default `globalThis.fetch`) so tests don't touch the network.
- `pdf-brand`: DOM branch tested by passing a fake `document` shape; fetch branch tested with mocked `fetch`; default-export path tested with both failing -> returns `null`.
- `pdf-types` / `pdf-options`: pure, no IO, plain assertions.

---

## 9. Risks and Mitigations

| Risk | L | Mitigation |
|------|---|------------|
| jsPDF blob > 10 MB for 681-item catalog in `completo` mode | MED | `compacto` mode is the escape hatch. Default to `completo` for sidebar-filtered selections (typically 20-50 items); full-catalog PDFs are explicitly user's responsibility. |
| Image loading races (resolvePdfImageSrc in flight while generatePDF saves) | MED | `await resolvePdfImageSrc(...)` BEFORE any `pdf.addImage(...)` call. `Promise.all(imagePromises)` on cover page and per-section. Module-scope cache de-dupes in-flight requests. |
| Mobile popup focus trap broken below 640px | MED | `<dialog>` `showModal()` traps focus natively. Manual fallback focuses first `<input>` on `open`. Playwright at 390px viewport is a verify gate (task T29). |
| localStorage quota (~5 MB) | LOW | Payload is ~200 bytes. No practical concern. |
| SVG logo canvas tainting (CORS) | LOW | `crossOrigin="anonymous"` on both DOM and fetch attempts. Both failing -> `getLogoBase64()` returns `null`; vector circle/text fallback (in caller) takes over. |
| `pdf-image-fallback` cache leaks across pages | LOW | `pdf.save()` is one-shot per click; stale cache entries cost memory but no functional bug. Export `_resetCache()` test-only. |
| Popup skip semantics surprise first-visit users | LOW | Dialog opens on first visit (storage empty); subsequent visits replay prior choice silently. Documented in 6.2. |
| Per-type templates overshoot 25 spec rows cap and clip | LOW | `renderMachinerySheet` truncates to first 25 rows across all groups; renders `(mostrando 25 de N)` footnote when truncated. |
| `compacto` mode flat-row path regresses during refactor | LOW | Kept verbatim from current `PdfDownloadButton.astro` lines 184-284; only shares `drawTableHeader` and `getLogoBase64` imports. |
| `dist/catalogo/index.html` popup script conflicts with prior inline handlers | LOW | `updatePdfData` (lines 378-414) stays intact; new script is isolated in `PdfOptionsDialog.astro`. |

---

## 10. Open Questions for the Apply Phase

| # | Question | Default if unresolved |
|---|----------|-----------------------|
| Q1 | Exact jsPDF layout coordinates for `renderMachinerySheet` (header band, image dimensions, column widths) | Use `ProductPdfDownloadButton.astro` lines 205-292 as the working template (already does photo + features + spec groups for a single item); adapt for catalog page scale. |
| Q2 | Per-category QR badge visual: vector outline or actual QR code? | Vector outline (20x20mm black square with white random dots). Real QR generation is out of scope. |
| Q3 | Service items placement in `completo` mode: inside their category group or separate `Servicios` section? | Separate `Servicios` section at the end of the PDF, before the back cover. (21 service items live in `service_catalog`, not in `categories.items`.) |
| Q4 | `selectedSlugs` should drive category grouping or remain sidebar-only? | Sidebar-only in this slice; PDF always renders currently visible items (filtered by `updatePdfData` on parent page). `selectedSlugs` in localStorage is purely for the QR badge deep-link. |
| Q5 | Dialog open path when localStorage is corrupt (parse error)? | Treat as "no localStorage": open the dialog with `defaultPdfOptions()` rather than skip-and-crash. |