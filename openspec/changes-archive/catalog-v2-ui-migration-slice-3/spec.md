# Delta Spec: catalog-detail-ui

> Slice 3 of `catalog-v2-ui-migration`. All ADDED. New capability.

## ADDED Requirements

### Requirement: category metadata helper

`src/lib/category-meta.ts` SHALL export `getCategoryMeta(slug)` returning `{ title, description, ogImage, canonicalPath, breadcrumb }`. Unknown slugs fall back without throwing.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Known slug | slug in `category_dictionary` | `getCategoryMeta(slug)` runs | `title` equals `category.label` AND fields deterministic |
| Unknown slug | slug absent | `getCategoryMeta(slug)` runs | generic meta returned, canonicalPath `/catalogo/{slug}`, AND no throw |

### Requirement: adapter consumption

`src/pages/catalogo/[slug].astro` SHALL import `getCategoryBySlug` from `src/lib/catalog.ts`. The legacy shim SHALL NOT be imported.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Direct imports | page frontmatter | inspected | no import references `'../../data/catalog'` AND source is the adapter |
| 21 sub-pages | adapter exposes 21 categories | `astro build` runs | 21 sub-pages emit under `dist/catalogo/<slug>/index.html` AND no build error |

### Requirement: sidebar with active highlight

`CategorySidebar` SHALL mark the current category active when its slug matches the page slug.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Active state | a category detail page | rendered | `CategorySidebar` present with 21 entries AND exactly one has `is-active` matching the page slug |
| Nav links | the sidebar | user clicks a non-active category | browser navigates to `/catalogo/{clicked-slug}` AND only clicked item is active on destination |

### Requirement: item rendering with type chip

Each item SHALL render as a horizontal card with an `ItemTypeChip` whose color and label reflect `item.item_type`.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Chip count | category with N items | page renders | N `ItemTypeChip` elements appear AND each `data-type` matches `item.item_type` |
| Spanish labels | `item_type` `simple_product`, `spare_part`, `machinery` | rendered | text reads "Producto", "Repuesto", "Maquinaria" AND color maps to soft / muted / navy |

### Requirement: WhatsApp CTA

The page SHALL render `WhatsAppCta` at the bottom with `context="general"`. The number SHALL come from `PUBLIC_WHATSAPP_NUMBERS['general']` with `sales` fallback.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Category context | a category detail page | rendered | `WhatsAppCta` present with `context="general"` AND message encodes `{category.label}` plus item count |
| Disabled fallback | `PUBLIC_WHATSAPP_NUMBERS` unset or empty | page renders | CTA renders disabled with copy `Configura PUBLIC_WHATSAPP_NUMBERS en .env` |

### Requirement: category PDF download

The page SHALL render `CategoryPdfDownloadButton` in the header. Clicking SHALL generate a jsPDF with the category title and all per-item rows.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Button renders | a category detail page | rendered | one `CategoryPdfDownloadButton` visible in header |
| PDF rows + paging | category with N items | button clicked | PDF downloads with title, N rows match `category.items.length`, AND auto-paginates for large categories (machinery 31 -> 2+ pages) |

### Requirement: JSON-LD CollectionPage

The page `<head>` SHALL include `<script type="application/ld+json">` blocks with `@context: "https://schema.org"`: a `CollectionPage` plus nested `ItemList` (`ListItem` with `position`, `name`, `url`) and `BreadcrumbList` (Home > Catalogo > Slug).

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Script + schema | a category detail page | rendered HTML inspected AND AJV-validated against schema.org CollectionPage | `<script type="application/ld+json">` block exists in `<head>` AND validation passes |
| ItemList completeness | category with N items | JSON-LD parsed | `mainEntity.itemListElement.length === N` AND entries have `position` 1..N, `name`, `url` of shape `SITE/productos/{slug}/{sku}` |
| BreadcrumbList order | the JSON-LD | `breadcrumb.itemListElement` read | 3 items in order: `Inicio` (`/`), `Catalogo` (`/catalogo`), `{category.label}` (`/catalogo/{slug}`) |

### Requirement: page metadata (SEO/GEO)

The `<head>` SHALL include title, description, og:*, twitter:*, canonical, and `<html lang="es-CL">`.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| All meta tags | a category detail page | rendered HTML inspected | `<title>` matches `{category.label} | Todo Huincha` AND all listed meta tags present |
| Canonical + locale | the rendered HTML | inspected | canonical `href` is absolute `${PUBLIC_SITE_URL}/catalogo/{slug}`, `<html lang="es-CL">` set on root, AND `og:locale` is `es_CL` |

### Requirement: motion and accessibility

The page SHALL apply staggered entry to item cards (60ms increments, capped at 600ms total). `prefers-reduced-motion: reduce` SHALL zero all transforms and transitions. Interactive elements SHALL be keyboard-navigable; images SHALL carry alt text; color contrast SHALL meet WCAG AA.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Stagger visible | no `prefers-reduced-motion` preference | page first paints | cards fade in `opacity 0 -> 1` and `translateY(8px) -> 0`, AND `animation-delay` increments 60ms up to 600ms cap |
| Reduced motion | OS `prefers-reduced-motion: reduce` matches | page renders | `transform` and `opacity` transitions are zero AND no entrance animation runs |
| Keyboard + a11y | the rendered page | `Tab` pressed repeatedly | focus reaches all interactive elements in DOM order AND Lighthouse accessibility score is >= 90 |