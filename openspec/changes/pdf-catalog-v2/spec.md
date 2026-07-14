# Delta Spec: pdf-catalog-v2

> Modular per-type catalog PDF + options popup. All ADDED.

## ADDED Requirements

### Requirement: pdf-catalog-v2: pdf options popup

The system MUST render an accessible `<dialog aria-labelledby="pdf-options-title">` containing four form controls: radio group `modo` with values `completo` (default) and `compacto`; checkboxes `incluirPortada`, `incluirContraportada`, `incluirQrPorCategoria` (each defaulting to `true`); and a submit button. The dialog MUST open via `dialog.showModal()` on trigger click, MUST close on Esc key, click outside the inner card, or X button, MUST trap focus while open, and MUST restore focus to the trigger element on close. Layout MUST be a full-screen sheet below 640px viewport width and a centered modal at >=640px. Transitions MUST honor `prefers-reduced-motion: reduce`.

On open the dialog MUST deserialize `localStorage['cat:pdf:options']` via `deserializePdfOptions`; an invalid `modo` value MUST be rejected and the form MUST fall back to `defaultPdfOptions()`. On submit the dialog MUST serialize the form state via `serializePdfOptions`, write the payload to `localStorage['cat:pdf:options']`, close the dialog, and pass the resulting options object to the PDF generator.

#### Scenario: opens with default options

- GIVEN `localStorage['cat:pdf:options']` is unset
- WHEN the user clicks the trigger button
- THEN `dialog.showModal()` opens the dialog
- AND `modo` radio is `completo`
- AND all three toggles are checked

#### Scenario: persists options to localStorage on confirm

- GIVEN the dialog is open with `modo=compacto` and `incluirPortada=false`
- WHEN the user submits the form
- THEN `localStorage['cat:pdf:options']` holds the serialized payload
- AND the dialog closes
- AND the PDF generator receives the persisted options

#### Scenario: rejects invalid persisted mode and falls back to defaults

- GIVEN `localStorage['cat:pdf:options']` holds `{"modo":"weird"}` (not in the allowed set)
- WHEN the dialog opens
- THEN the form fields reflect `defaultPdfOptions()`
- AND `modo` radio is `completo`

#### Scenario: closes on Esc and restores focus

- GIVEN the dialog is open and the trigger button was the most recently focused element
- WHEN the user presses Esc
- THEN the dialog closes
- AND document.activeElement is the trigger button

### Requirement: pdf-catalog-v2: per-type template dispatcher

The system MUST dispatch rendering by `item.item_type` via `dispatchItemKind(item)`. The dispatcher MUST route as follows.

- `machinery` → `renderMachinerySheet(item, y, pdf, ctx)`: photo block max 60mm height + brand + model + display_name heading + description + features bullets capped at 8 + grouped specs table capped at 25 rows total + price line (or the literal text `A cotizar` when `sale_amount` is missing) + WhatsApp CTA footer.
- `simple_product` and `spare_part` → `renderCompactRow(item, y, pdf, ctx)`: code + name + category tag; spare parts MUST additionally render a `manufacturer_reference` column when `item.specifications.manufacturer_reference` is a non-empty string.
- `service` → `renderServiceCard(item, y, pdf, ctx)`: service name + short description + capabilities bullets from `service_profile.capabilities` + `A cotizar` stamp + WhatsApp deep-link via `buildWhatsAppUrl` using the `sales` context from `parseWhatsAppNumbers`.

Each sub-renderer MUST return the new y coordinate. The page MUST auto-`addPage()` when the next item would not fit in the remaining page height. Each sub-renderer MUST tolerate missing `machinery_profile`, `service_profile`, or `specifications` without throwing.

#### Scenario: machinery item renders full sheet

- GIVEN an item with `item_type: 'machinery'` and a populated `machinery_profile` containing `features` and `specification_groups`
- WHEN `dispatchItemKind` resolves
- THEN `renderMachinerySheet` is invoked
- AND the page shows photo, brand, model, features bullets, grouped specs table, price, WhatsApp footer

#### Scenario: spare part shows manufacturer reference when present

- GIVEN an item with `item_type: 'spare_part'` and `specifications.manufacturer_reference = 'ABC-123'`
- WHEN `renderCompactRow` runs
- THEN the row includes the manufacturer reference text

#### Scenario: service card uses sales context for WhatsApp

- GIVEN an item with `item_type: 'service'` and `PUBLIC_WHATSAPP_NUMBERS` containing `sales:+56912345678`
- WHEN `renderServiceCard` runs
- THEN the WhatsApp deep-link href is `https://wa.me/56912345678?text=...`

#### Scenario: missing machinery_profile does not throw

- GIVEN an item with `item_type: 'machinery'` and `machinery_profile: undefined`
- WHEN `renderMachinerySheet` runs
- THEN no exception is thrown
- AND the sheet renders with the available fields only

### Requirement: pdf-catalog-v2: image fallback chain

The system MUST resolve item images via `resolvePdfImageSrc(item, category, family, catalogAssets): Promise<string>`. The function MUST walk the chain in this exact order and return the first non-null entry:

1. `item.assets.main_image.data_base64` (returned verbatim)
2. `item.assets.main_image.url`
3. `family.assets.main_image.url`
4. `category.assets.banner.url`
5. `catalogAssets.placeholder_image.url`

When every level is null or undefined, the function MUST return the sentinel string `__vector__`; the caller MUST render an orange `#FB4D08` rectangle at the image slot. The function MUST cache resolved URLs in a module-scope `Map<string, Promise<string>>` keyed by URL to avoid duplicate network fetches within a single PDF generation run. URL entries MUST be fetched via `fetch(url)` -> `Response.blob()` -> `URL.createObjectURL(blob)` -> `<img>` -> canvas -> base64. The function MUST NOT throw when `item.assets`, `family`, or `category` is null.

#### Scenario: data_base64 returned verbatim

- GIVEN an item with `assets.main_image.data_base64 = "data:image/png;base64,XYZ"`
- WHEN `resolvePdfImageSrc(item, cat, fam, assets)` resolves
- THEN the returned string equals `data:image/png;base64,XYZ`

#### Scenario: total miss returns vector sentinel

- GIVEN item, family, category, and catalogAssets all with null or undefined image fields
- WHEN `resolvePdfImageSrc` resolves
- THEN the returned string is `"__vector__"`

#### Scenario: null item assets does not throw

- GIVEN an item with `assets: null`
- WHEN `resolvePdfImageSrc` resolves
- THEN no exception is thrown
- AND the returned string is `"__vector__"`

#### Scenario: same URL is cached

- GIVEN an item with `assets.main_image.url = "/img/x.jpg"` and family/category null
- WHEN `resolvePdfImageSrc` is called twice with the same arguments in the same run
- THEN the underlying network fetch happens exactly once
- AND the second call returns the cached promise from the module-scope Map

### Requirement: pdf-catalog-v2: compact mode flat table

The system MUST, when `options.modo === 'compacto'`, skip the per-type dispatcher entirely and render all items as a single flat table grouped by category using the slice 2 layout. Cover (`incluirPortada`), back cover (`incluirContraportada`), and QR-per-category (`incluirQrPorCategoria`) toggles MUST still apply on top of compact mode and MUST NOT be silently dropped.

#### Scenario: compacto renders flat grouped-by-category table

- GIVEN `options = { modo: 'compacto', incluirPortada: false, incluirQrPorCategoria: false, incluirContraportada: false }`
- WHEN the PDF generator runs over 681 items
- THEN each item renders as a single row inside its category group
- AND `dispatchItemKind` is never invoked

#### Scenario: compacto still respects QR per category

- GIVEN `options = { modo: 'compacto', incluirQrPorCategoria: true }`
- WHEN the PDF generator runs
- THEN each category section shows a QR badge above the table
- AND each badge links to a `wa.me/` URL matching its group context

### Requirement: pdf-catalog-v2: cover and back cover pages

The system MUST, when `options.incluirPortada === true`, prepend a cover page containing an orange top band, the centered logo via `getLogoBase64`, the cover image via `getCoverImageBase64`, the catalog title, the subtitle, and the current date. Cover image resolution MUST walk `catalog_assets.cover_image.url` -> `/hero/taller-maquinaria.jpg` -> `/hero/taller.jpg` -> vector fallback (solid orange rectangle). When `options.incluirContraportada === true`, the system MUST append a back cover page containing company info, a WhatsApp CTA, three social-media placeholders (Instagram, Facebook, web), and a QR placeholder.

When `options.incluirPortada === false`, the first page of the PDF MUST be the first catalog item; no cover page is prepended. When `options.incluirContraportada === false`, the last page of the PDF MUST be the last catalog item; no back cover is appended.

#### Scenario: cover prepended when toggle on

- GIVEN `options.incluirPortada === true`
- WHEN the PDF generator finishes
- THEN the first page contains the cover layout (logo + hero image + title + subtitle + date)
- AND the cover image resolves to `/hero/taller-maquinaria.jpg` or the vector fallback when missing

#### Scenario: cover skipped when toggle off

- GIVEN `options.incluirPortada === false`
- WHEN the PDF generator finishes
- THEN the first page is the first catalog item
- AND no cover page is rendered

#### Scenario: back cover appended when toggle on

- GIVEN `options.incluirContraportada === true`
- WHEN the PDF generator finishes
- THEN the last page contains the WhatsApp CTA, three social placeholders, and a QR placeholder

#### Scenario: both toggles off

- GIVEN `options.incluirPortada === false` and `options.incluirContraportada === false`
- WHEN the PDF generator finishes
- THEN the PDF contains only the catalog items in their natural order
- AND neither a cover nor a back cover page is rendered

### Requirement: pdf-catalog-v2: QR per category

The system MUST, when `options.incluirQrPorCategoria === true`, draw a QR-code placeholder badge at the top of each category section. In `modo === 'compacto'` the badge MUST sit above the category table; in `modo === 'completo'` the badge MUST sit above the first machinery sheet of each category that contains machinery items. Each badge MUST link to a category-specific WhatsApp message built via `buildWhatsAppUrl` using the category's `category_group` as the context key resolved through `parseWhatsAppNumbers`. When `options.incluirQrPorCategoria === false`, no QR badge MUST be drawn anywhere.

#### Scenario: QR badge per category in compacto

- GIVEN `options = { modo: 'compacto', incluirQrPorCategoria: true }` and `PUBLIC_WHATSAPP_NUMBERS` containing `sales:+56912345678`
- WHEN the PDF generator finishes
- THEN every category group has a QR badge above its table
- AND each badge href begins with `https://wa.me/56912345678?text=`

#### Scenario: no QR when toggle off

- GIVEN `options.incluirQrPorCategoria === false`
- WHEN the PDF generator finishes
- THEN no QR badge is drawn in any section

### Requirement: pdf-catalog-v2: logo extraction helper

The system MUST export `getLogoBase64(): Promise<string | null>` from `src/lib/pdf-brand.ts`. The function MUST attempt DOM canvas extraction from `<img class="brand img">` first (with `crossorigin="anonymous"`), MUST fall back to `fetch('/logo-todohuincha.svg')` -> `<img>` -> canvas -> base64, and MUST resolve to `null` when both attempts fail. The vector fallback (drawn circle + `TODO HUINCHA` text) MUST live in the calling component, not in `pdf-brand.ts`.

`CategoryPdfDownloadButton.astro` MUST import `getLogoBase64` from `../lib/pdf-brand.ts` and MUST NOT define its own inline copy of the DOM-fetch-canvas chain. The rewritten `PdfDownloadButton.astro` MUST likewise import from `pdf-brand.ts`. The remaining inline copies in `DownloadPdf.astro` and `ProductPdfDownloadButton.astro` are explicitly out of scope for this change.

#### Scenario: returns null when DOM img missing and fetch fails

- GIVEN no `<img class="brand img">` exists in the document AND `fetch('/logo-todohuincha.svg')` rejects or returns non-OK
- WHEN `getLogoBase64()` resolves
- THEN the returned value is `null`

#### Scenario: returns base64 when DOM img is present

- GIVEN `<img class="brand img" src="/logo-todohuincha.svg" crossorigin="anonymous">` is in the DOM
- WHEN `getLogoBase64()` resolves
- THEN the returned value starts with `data:image/`

#### Scenario: CategoryPdfDownloadButton no longer duplicates the helper

- GIVEN the refactor is complete
- WHEN `CategoryPdfDownloadButton.astro` is read
- THEN it contains `import { getLogoBase64 } from '../lib/pdf-brand.ts'`
- AND it does NOT contain an inline `getLogoBase64` arrow function with a `fetch(...)` call
