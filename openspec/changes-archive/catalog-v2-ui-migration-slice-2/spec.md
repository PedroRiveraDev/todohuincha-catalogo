# Delta Spec: catalog-landing-ui

> Slice 2 of `catalog-v2-ui-migration`. All ADDED.

## ADDED Requirements

### Requirement: catalog-landing-ui: whatsapp number parser

The system MUST parse `PUBLIC_WHATSAPP_NUMBERS` env into a `key:value`
Record via `parseWhatsAppNumbers(env)`. Bad entries MUST drop.

| Scenario | WHEN | THEN |
|----------|------|------|
| empty/missing | env undefined or empty | returns `{}` |
| single pair | env `"sales:+56912345678"` | `{ sales: "+56912345678" }` |
| multiple | env `"sales:+5691,repuestos:+5692,machinery:+5693"` | 3 keys present |
| malformed | entry lacks `:` | dropped; valid kept |

### Requirement: catalog-landing-ui: whatsapp URL builder

The system MUST build `wa.me` URLs via `buildWhatsAppUrl(number, message)`.

| Scenario | WHEN | THEN |
|----------|------|------|
| with + | `"+56912345678"`, `"hola"` | `"https://wa.me/56912345678?text=hola"` |
| without + | `"56912345678"`, `"hola"` | `"https://wa.me/56912345678?text=hola"` |
| special chars | msg `"hola mundo & mas"` | msg encoded |

### Requirement: catalog-landing-ui: category sidebar grouping

The system MUST group categories by `category_group` via
`groupCategoriesByGroup(categories)`, in order:
`sierras, consumibles, cuchillos, herramientas, materiales,
servicios, maquinaria, instrumentos`.

| Scenario | WHEN | THEN |
|----------|------|------|
| empty | receives `[]` | empty Map |
| 21 cats | 21 categories | Map with 8 entries, documented order |
| single | 1 category in 1 group | Map with 1 entry |

### Requirement: catalog-landing-ui: alphabetical sort by display_name

The system MUST sort by `display_name` using locale `'es'` via
`sortItemsByDisplayName(items)`.

| Scenario | WHEN | THEN |
|----------|------|------|
| empty | receives `[]` | returns `[]` |
| unordered | names `["z","a","m"]` | returns `["a","m","z"]` |
| accented | Spanish accented names | collation rules apply |

### Requirement: catalog-landing-ui: catalog landing page layout

The system MUST render `src/pages/catalogo/index.astro` with v2
adapter: hero, 8-group sidebar, items + `ItemTypeChip`, search,
PDF button.

| Scenario | WHEN | THEN |
|----------|------|------|
| 8 groups | built with 21 categories | 8 grouped sidebar sections |
| type chip | page lists items | `ItemTypeChip` colored by `item.item_type` |
| search | user types query | matching `display_name`/`sku`/`brand`/`category_label`/`tokens` stay; count updates |
| sidebar | user clicks category | items of that category visible; count updates |
| PDF | user clicks "Descargar PDF" | jsPDF of visible items downloaded |

### Requirement: catalog-landing-ui: whatsapp CTA per category section

The system MUST render `WhatsAppCta` per section header, reading
`PUBLIC_WHATSAPP_NUMBERS` at build, matching `category_group`.

| Scenario | WHEN | THEN |
|----------|------|------|
| match | section "sierras", env `"sales:+56912345678"` | CTA links `wa.me/56912345678` |
| missing | env empty | disabled btn `"Configura PUBLIC_WHATSAPP_NUMBERS en .env"` |
| no match | section "instrumentos", env `"sales"`,`"repuestos"` | falls back to `"sales"` |

### Requirement: catalog-landing-ui: JSON-LD ItemList schema

The system MUST include JSON-LD `ItemList` listing all products
(687 current data) as `ListItem` with `position`, `name`, `url`,
in `<script type="application/ld+json">` at end of body.

| Scenario | WHEN | THEN |
|----------|------|------|
| schema | page built | `ItemList` with 687 `ListItem` entries |
| fields | schema parsed | each `ListItem` has `@type "ListItem"`, `position` 1..687, `name`, `url` |

### Requirement: catalog-landing-ui: design skills applied

The system MUST apply the 5 skills minimally:
- emil-design-eng: cubic-bezier(0.16, 1, 0.3, 1), scale(0.97) `:active`,
  `prefers-reduced-motion` guard
- impeccable: no gradient text, no new side-stripe borders, semantic z-index
- design-taste-frontend: max 1 eyebrow, `text-wrap: balance` h1, no Inter
- high-end-visual-design: double-bezel + button-in-button icon on
  `WhatsAppCta`, py-24+ hero, single-column below 768px
- seo-geo: semantic H1, ItemList JSON-LD, alt on chip icon

Note: the previous explore referenced an existing `.cat-sidebar-item.is-active` `border-left: 3px solid var(--orange)` rule in `Base.astro`. Verification found the rule does not exist anywhere in `src/` (grep returns 0 matches). The "impeccable exception" rationale is moot. The new `CategorySidebar` MUST NOT introduce a side-stripe border on `.is-active`. Use a background tint or full border instead.

| Scenario | WHEN | THEN |
|----------|------|------|
| tokens | page built and inspected | all 5 principles applied |

### Requirement: catalog-landing-ui: tests (TDD)

The system MUST include tests at `tests/lib/whatsapp.test.mjs` and
`tests/lib/category-grouping.test.mjs`. Slice 1's 18 assertions MUST
still pass.

| Scenario | WHEN | THEN |
|----------|------|------|
| passes | `npm test` runs | slice 1 (18) + slice 2 helper assertions all pass |