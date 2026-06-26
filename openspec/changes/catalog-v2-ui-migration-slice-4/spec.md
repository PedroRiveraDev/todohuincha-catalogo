# Delta Spec: product-detail-ui

> Slice 4 of `catalog-v2-ui-migration`. Capability: `product-detail-ui`. All ADDED. New capability.

## ADDED Requirements

### Requirement: Adapter-driven lookup

The page SHALL consume the v2 adapter via `adapter.getItem(sku)` from `src/lib/catalog.ts`. Legacy shim SHALL NOT be imported. `getStaticPaths` SHALL emit one sub-page per SKU.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Direct adapter import | the page frontmatter | inspected | no `data/catalog` import AND `adapter` + `resolveImageSrc` come from `src/lib/catalog.ts` |
| 681 sub-pages built | 681 unique items after slice 1 dedup | `npx astro build` runs | 681 sub-pages emit under `dist/productos/<slug>/<sku>/index.html` |

### Requirement: Product image rendering

A `ProductImage` wrapper SHALL call `resolveImageSrc(item)`. Non-empty sets `<img>` `src`; empty renders a gray placeholder with `display_name` overlaid. `<img>` SHALL carry `loading="lazy"`.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| data_base64 passthrough | `assets.main_image.data_base64` non-empty | `resolveImageSrc(item)` runs | returns data URI AND `<img>` `src` is data URI |
| URL fallback | empty base64, non-empty url | `resolveImageSrc(item)` runs | returns the URL AND `<img>` `src` is the URL |
| Gray placeholder when empty | no `assets.main_image` | rendered | `<img>` is absent AND a gray placeholder displays `display_name` |

### Requirement: Type-aware rendering

Render SHALL dispatch by `item_type`. `simple_product` and `spare_part` render sparse `specifications` map. `machinery` renders flat `specification_groups` (`group.label` as `<h3>`, no accordion). `service` redirects to `/catalogo`.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| simple_product sparse layout | `item_type: "simple_product"` with sparse `specifications` | rendered | no `specification_groups` AND only non-empty keys appear |
| machinery flat specification_groups | `item_type: "machinery"` with 9 `specification_groups` | rendered | 9 `<h3>` labels appear with `<dl>` rows AND no accordion renders |
| service redirects | `item_type: "service"` | the guard runs | `Astro.redirect('/catalogo')` returns AND no service markup emits |

### Requirement: JSON-LD Product schema

`<head>` SHALL include `<script type="application/ld+json">` with `@type: "Product"`, fields `name`, `sku`, `description`, `category`, `brand`, `offers.availability` (from `status`), `url`, `inLanguage: "es-CL"`. `image` SHALL appear only when `resolveImageSrc` is non-empty.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Schema valid with in-stock | `status: "in-stock"` | HTML parsed and AJV-validated | `<script>` exists in `<head>` AND `offers.availability` equals `https://schema.org/InStock` |
| Availability maps from status | `status` values `in-stock`, `out-of-stock`, `discontinued` | each JSON-LD parsed | `offers.availability` maps to `InStock`, `OutOfStock`, `Discontinued` |
| Image field omitted when empty | no resolvable image | JSON-LD serialized | `image` is absent from JSON |

### Requirement: Page metadata (SEO/GEO)

`<head>` SHALL include `<title>` shape `{display_name} ({sku}) | Todo Huincha`, `<meta name="description">`, full `og:*` set (type=product, locale=es_CL, site_name), full `twitter:*` set (card=summary_large_image), absolute canonical link.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| All meta tags present | any product page | HTML inspected | `<title>` matches shape AND all meta + canonical exist |
| og:type product and absolute canonical | rendered HTML | canonical and og:* read | `og:type` equals `product` AND `canonical` href is absolute AND `og:locale` equals `es_CL` |

### Requirement: WhatsApp CTA with real number

`WhatsAppCta` SHALL render with `productName`, `sku`, and `context` mapped from `item_type`: `simple_product` -> `sales`, `spare_part` -> `repuestos`, `machinery` -> `machinery`. The href SHALL use real number from `PUBLIC_WHATSAPP_NUMBERS`, never bare `wa.me/?text=...`. When env unset, render disabled.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Real number in href | `PUBLIC_WHATSAPP_NUMBERS` configured | the link is inspected | href has a phone-number segment AND it is NOT `https://wa.me/?text=...` |
| Context per item_type | three item types | each page rendered | `context` is `sales`, `repuestos`, `machinery` AND message includes `{display_name}` and `{sku}` |

### Requirement: Spare part compatibility section

A "Compatibilidad" section SHALL render IF `item.compatibilities` is non-empty. When empty, the section SHALL be omitted entirely.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Non-empty compatibilities renders section | `compatibilities` non-empty | rendered | a "Compatibilidad" heading appears AND each links to its compatible item's page |
| Empty compatibilities omits section | `compatibilities: []` | rendered | no "Compatibilidad" heading or list appears in HTML |

### Requirement: Machinery PDF request CTA

A "Solicitar ficha tecnica" CTA SHALL render when `item.machinery_profile?.source_pdf` exists. The CTA SHALL be a secondary WhatsApp link with datasheet body including `{display_name}` and `{sku}`.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| source_pdf present renders CTA | a machinery item with `source_pdf` defined | rendered | a secondary WhatsApp CTA labeled "Solicitar ficha tecnica" appears AND its href uses real number |
| source_pdf absent omits CTA | a machinery item with no `source_pdf` | rendered | no "Solicitar ficha tecnica" CTA appears |