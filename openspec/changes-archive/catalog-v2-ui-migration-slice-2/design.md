# Design: catalog-landing-ui (Slice 2 of catalog-v2-ui-migration)

> Architectural and technical design for the catalog-landing-ui capability.
> Scope: migrate `src/pages/catalogo/index.astro` (447 lines) to consume the
> frozen v2 adapter directly (bypassing the legacy shim), introduce a grouped
> 8-group sidebar with type chips, integrate a context-aware WhatsApp CTA
> that reads `PUBLIC_WHATSAPP_NUMBERS` at build, move the catalog PDF logic
> into a reusable component, and emit JSON-LD `ItemList` schema.

---

## 1. Architecture Overview

### 1.1 Component / data flow

```
            docs/ (filesystem, build time)
                       |
                       v
   +-------------------------------+
   | src/lib/catalog.ts (FROZEN)   |   slice 1 adapter, 293 lines
   |  adapter.items[681]           |
   |  adapter.categories[21]       |
   |  adapter.serviceCategories[10]|
   |  getCategory/getItem helpers  |
   +-------+--------------+--------+
           |              |
           | used by      | used by
           v              v
   +--------------+   +-------------------------+
   | src/lib/     |   | src/lib/categories.ts   |   NEW
   | whatsapp.ts  |   | CATEGORY_GROUP_ORDER[8] |
   | parse/build  |   | groupCategoriesByGroup  |
   +------+-------+   | sortItemsByDisplayName  |
          |           +--------------------------+
          |                       |
          | both consumed by      v
          |              +--------------------------------+
          |              | src/components/*.astro (NEW)  |
          |              |  CategorySidebar              |
          |              |  ItemTypeChip                 |
          |              |  WhatsAppCta                  |
          |              |  PdfDownloadButton            |
          |              +----------------+--------------+
          |                               |
          v                               v
   +----------------------------------------------------+
   | src/pages/catalogo/index.astro (REWRITE, ~200 ln)  |
   |  - hero (dark) + search + PdfDownloadButton        |
   |  - layout: <CategorySidebar> + main                |
   |  - main: per-section header + items + WhatsAppCta  |
   |  - JSON-LD ItemList at end of body                 |
   +----------------------------------------------------+

   Env: import.meta.env.PUBLIC_WHATSAPP_NUMBERS  (read at build)
   Build outputs: dist/catalogo/index.html  (1 file, 21 cat + 681 product
                  pages unchanged; only landing HTML changes)
```

### 1.2 Module responsibilities

| Module | Status | Responsibility |
|--------|--------|---------------|
| `src/lib/catalog.ts` | FROZEN | Sole owner of v2 data; slice 2 READS only via `adapter.*` exports. No modification. |
| `src/lib/whatsapp.ts` | NEW | Pure helpers. `parseWhatsAppNumbers(env)` returns `Record<key,number>`. `buildWhatsAppUrl(number, message)` returns wa.me URL with `encodeURIComponent` on message. No IO, no DOM, no env reads (env passed in). |
| `src/lib/categories.ts` | NEW | Pure helpers. `CATEGORY_GROUP_ORDER` is the fixed 8-group contract. `groupCategoriesByGroup(cats)` returns `Map` keyed in fixed order. `sortItemsByDisplayName(items)` uses `localeCompare(..., 'es')`. |
| `src/components/CategorySidebar.astro` | NEW | Presentation. Renders 8 grouped sections, sticky on desktop, `<dialog>` off-canvas drawer below 768px. Pure props in; HTML out. |
| `src/components/ItemTypeChip.astro` | NEW | Presentation. Renders a `<span>` with color per `item_type`. Trivial. |
| `src/components/WhatsAppCta.astro` | NEW | Composition. Reads `import.meta.env.PUBLIC_WHATSAPP_NUMBERS` at module top, calls `parseWhatsAppNumbers`, picks the context key (sales/repuestos/machinery), calls `buildWhatsAppUrl`, renders either an `<a>` or a disabled `<button>`. |
| `src/components/PdfDownloadButton.astro` | NEW | Owns the catalog-level jsPDF generator (moved verbatim from `index.astro:84-446`). Props provide defaults; click handler reads visible rows from `.cat-row:not(.is-hidden)` in the DOM (same pattern as current inline code). |
| `src/pages/catalogo/index.astro` | REWRITE | Composition root. 447 -> ~200 lines. Frontmatter imports adapter + helpers + components, computes derived collections, renders hero + grid, adds vanilla-JS filter `<script>`, emits JSON-LD. |
| `tests/lib/whatsapp.test.mjs` | NEW | 8 assertions per spec (parse: 5 + build: 3). |
| `tests/lib/category-grouping.test.mjs` | NEW | 6 assertions per spec (group: 3 + sort: 3). |

### 1.3 Separation rationale

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where the WhatsApp URL logic lives | `src/lib/whatsapp.ts` (pure) | Lets `WhatsAppCta` and slices 3/4 reuse the same `parseWhatsAppNumbers` + `buildWhatsAppUrl` without duplication. TDD-first because the function is pure. |
| Where the grouping logic lives | `src/lib/categories.ts` (pure) | Same reason: lets the page compute `groups` once in frontmatter; the component just renders. TDD-first on the pure function. |
| Where env is read | Inside `WhatsAppCta.astro` frontmatter via `import.meta.env.PUBLIC_WHATSAPP_NUMBERS` | Astro inlines `import.meta.env.*` at build time, so the value is baked into the static HTML. The pure helper `parseWhatsAppNumbers` still gets unit-tested with synthetic env strings. |
| Where jsPDF lives | `PdfDownloadButton.astro` (its own component) | The ~260 lines of jsPDF logic is a single responsibility (catalog PDF); it does not belong in the page frontmatter. Mirrors `DownloadPdf.astro` (product detail PDF), which stays untouched. |
| Where filter logic lives | Page-level `<script>` (vanilla JS) | Matches existing pattern (`index.astro:84-446` today). Astro components have no `<script>`-sharing primitive; a single bottom-of-page `<script>` is the simplest fit. |

---

## 2. Module Design: `src/lib/whatsapp.ts`

### 2.1 Public API

```typescript
export function parseWhatsAppNumbers(
  env: string | undefined
): Record<string, string>

export function buildWhatsAppUrl(
  number: string,
  message: string
): string
```

### 2.2 Internal logic

`parseWhatsAppNumbers(env)`:
- Input: `string | undefined`. Empty, whitespace-only, and undefined all return `{}`.
- Split by `,`. For each token, split by `:`. Drop tokens with no `:` (malformed). Trim keys and values. Skip empty keys.
- Return `Record<string, string>`. Frozen by convention (consumer must not mutate).

`buildWhatsAppUrl(number, message)`:
- Strip leading `+` from number.
- `encodeURIComponent(message)` for the text query value.
- Return `` `https://wa.me/${number}?text=${encoded}` ``.
- No validation on `number` format — the env contract guarantees E.164.

### 2.3 Imports

No imports from project code. Stdlib only.

---

## 3. Module Design: `src/lib/categories.ts`

### 3.1 Public API

```typescript
import type { CatalogItem, CategorySummary } from './catalog'

export const CATEGORY_GROUP_ORDER: readonly string[] = [
  'sierras',
  'consumibles',
  'cuchillos',
  'herramientas',
  'materiales',
  'servicios',
  'maquinaria',
  'instrumentos',
] as const

export function groupCategoriesByGroup(
  categories: CategorySummary[]
): Map<string, CategorySummary[]>

export function sortItemsByDisplayName(
  items: CatalogItem[]
): CatalogItem[]
```

### 3.2 Internal logic

`groupCategoriesByGroup(categories)`:
- Build `Map<string, CategorySummary[]>` keyed by `category.group`.
- For each group, preserve the input order of categories within that group (no re-sort inside a group; the adapter already sorts categories by label).
- Iterate `CATEGORY_GROUP_ORDER` to populate the result Map (Map preserves insertion order, so the returned map's keys are in fixed 8-group order).
- Empty categories array returns an empty Map.

`sortItemsByDisplayName(items)`:
- Copy the input array (do not mutate).
- Sort by `display_name` using `localeCompare(..., 'es', { sensitivity: 'base' })`.
- Returns a new array of the same length.

### 3.3 Type re-use

`CatalogItem` and `CategorySummary` are imported from `src/lib/catalog.ts` (the frozen adapter). If they are not exported there in a future adapter refactor, fall back to local interfaces mirroring the v2 shape.

---

## 4. Module Design: `src/components/CategorySidebar.astro`

### 4.1 Props

```typescript
import type { CategorySummary } from '../lib/catalog'

interface Props {
  categories: CategorySummary[]   // 21 entries
  activeSlug: string | null       // null = "__all__"
  totalProducts: number           // for the "Todos" badge
}
```

### 4.2 Behavior

- Wraps in `<aside role="navigation" aria-label="Categorias">`.
- Top: `<button class="sidebar-all" data-slug="__all__">Todos los productos <span class="count">{totalProducts}</span></button>`.
- For each `group` in `CATEGORY_GROUP_ORDER` (computed in the page and passed via the categories order OR re-derived in the component using `groupCategoriesByGroup`):
  - `<section class="sidebar-group">` with `<h3 class="sidebar-group-label">{groupLabel}</h3>`.
  - For each `cat` in the group: `<button class="sidebar-item" data-slug={cat.slug} class:list={[{ 'is-active': cat.slug === activeSlug }]}><span>{cat.label}</span><span class="count">{cat.products_count}</span></button>`.
- Desktop (>=768px): scoped `position: sticky; top: 24px; max-height: calc(100vh - 48px); overflow-y: auto;`.
- Mobile (<768px): scoped display:none for the sidebar content; a `<button class="sidebar-toggle" aria-expanded="false">Filtrar por categoria</button>` opens an off-canvas `<dialog class="sidebar-dialog">` containing the same content. Click on backdrop closes; ESC closes.

### 4.3 Styles

  Scoped `<style>` block. Uses `var(--orange)`, `var(--charcoal)`, `var(--muted)`, `var(--soft)`, `var(--surface)`, `var(--line)`, `var(--radius)` from Base.astro `:root`. NO new global CSS variables.

  Active state (`.is-active`): use background tint (`background: var(--soft)` or `var(--orange)10` equivalent) or a full border. NEVER a side-stripe `border-left`. Verification found that the previously-claimed `border-left: 3px solid var(--orange)` rule does not exist anywhere in `src/`. The "impeccable exception" rationale was moot.

### 4.4 Imports

```typescript
import type { CategorySummary } from '../lib/catalog'
import { groupCategoriesByGroup, CATEGORY_GROUP_ORDER } from '../lib/categories'
```

---

## 5. Module Design: `src/components/ItemTypeChip.astro`

### 5.1 Props

```typescript
interface Props {
  itemType: 'simple_product' | 'spare_part' | 'machinery' | 'service'
  itemId?: string
}
```

### 5.2 Behavior

- Renders `<span class="cat-row-type type-{itemType}" aria-label="Tipo: {humanLabel(itemType)}">{shortLabel(itemType)}</span>`.
- `shortLabel`: `simple_product` -> "Producto", `spare_part` -> "Repuesto", `machinery` -> "Maquinaria", `service` -> "Servicio".
- `humanLabel` (for aria-label): same text, expanded to title case ("Tipo: Maquinaria").

### 5.3 Styles

Scoped `<style>`. Per-type background/text:
- `simple_product`: `background: var(--soft); color: var(--charcoal);`
- `spare_part`: `background: var(--muted); color: #fff;`
- `machinery`: `background: #1f3a8a; color: #fff;`
- `service`: `background: var(--orange); color: #fff;` (reserved; no v2 items currently have type=service).

Display: `inline-flex; align-items: center; padding: 2px 8px; border-radius: 99px; font-size: 0.7rem; font-weight: 850; letter-spacing: 0.06em; text-transform: uppercase;`.

---

## 6. Module Design: `src/components/WhatsAppCta.astro`

### 6.1 Props

```typescript
interface Props {
  context: 'sales' | 'repuestos' | 'machinery' | 'general'
  productName?: string
  sku?: string
}
```

### 6.2 Behavior

- Module top: `const numbers = parseWhatsAppNumbers(import.meta.env.PUBLIC_WHATSAPP_NUMBERS)`.
- Build the message by context:
  - `general`: "Hola, quiero cotizar productos de Todo Huincha."
  - `sales`: "Hola, quiero cotizar {productName || 'productos'} (codigo {sku || 'N/A'})."
  - `repuestos`: "Hola, necesito un repuesto: {productName || 'repuesto'} (codigo {sku || 'N/A'})."
  - `machinery`: "Hola, quiero cotizar maquinaria: {productName || 'maquinaria'} (codigo {sku || 'N/A'})."
- Lookup `numbers[context]`. If missing, fallback to `numbers.sales`. If `sales` also missing, render disabled state.
- If `numbers[resolvedKey]` exists: render `<a href={buildWhatsAppUrl(number, message)} target="_blank" rel="noreferrer noopener" class="button whatsapp-cta">Solicitar cotizacion por WhatsApp <span class="wa-icon-wrapper" aria-hidden="true">[WhatsApp icon SVG]</span></a>`.
- If neither key exists: render `<button type="button" disabled aria-disabled="true" class="button whatsapp-cta-disabled">Configura PUBLIC_WHATSAPP_NUMBERS en .env <span class="info-icon" aria-hidden="true">[info icon]</span></button>`.

### 6.3 Styles

Scoped `<style>`. Double-bezel: outer `box-shadow: inset 0 0 0 1px var(--orange-deep), 0 8px 24px rgba(251,77,8,.18);`. Button-in-button trailing icon: the WhatsApp icon sits inside a `<span>` with `background: rgba(255,255,255,.18); border-radius: 99px; padding: 4px; margin-left: 10px;`. Hover: `transform: translateY(-1px);`. Active: `transform: scale(0.97);` (per emil-design-eng). Transition: `cubic-bezier(0.16, 1, 0.3, 1) 150ms`. Disabled variant: `background: var(--soft); color: var(--muted); border-color: var(--line); cursor: not-allowed;`.

`@media (prefers-reduced-motion: reduce)` block: zero transforms, instant transitions.

---

## 7. Module Design: `src/components/PdfDownloadButton.astro`

### 7.1 Props

```typescript
interface Props {
  title: string          // initial title (page may update data-title on filter)
  subtitle: string       // initial subtitle
  rows: string[]         // initial full 681-row list, e.g. "SKU | NAME | CATEGORY"
}
```

### 7.2 Behavior

- Renders `<button id="cat-pdf-btn" class="pdf-btn-dark" data-title={title} data-subtitle={subtitle} data-rows={JSON.stringify(rows)}>Descargar PDF</button>`.
- Owns the entire ~260 lines of jsPDF logic from the current `index.astro:84-446` (moved verbatim, with one refactor: `pdfRows` is no longer derived from `data-rows` but from the current VISIBLE rows in the DOM).
- Click handler: read visible rows by selecting `.cat-row:not(.is-hidden)` in the DOM, map each to a string of `code | name | category`, then run the existing jsPDF generator with `pdfRows`. Title/subtitle are read from `data-title`/`data-subtitle` (the page's filter JS updates these just like today).
- Logo: identical fallback logic (`.brand img` canvas extraction, fallback to `/logo-todohuincha.svg`, fallback to vector-drawn circle + "TODO HUINCHA" text).
- Filename: same slugification `${title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-')}.pdf`.

### 7.3 Why props + DOM read (hybrid)

Props provide the initial defaults baked at build. The page's filter script updates `data-title`/`data-subtitle`/`data-rows` on every filter change (same pattern as today's `updatePdf()`). The component's click handler reads the live values from data attributes. This preserves the existing runtime behavior without forcing the page to dispatch custom events.

### 7.4 Imports

```typescript
import { jsPDF } from 'jspdf'  // already in package.json
```

No CSS imports needed; `.pdf-btn-dark` class is styled by Base.astro's existing global block.

---

## 8. Module Design: `src/pages/catalogo/index.astro`

### 8.1 Frontmatter

```typescript
import Base from '../../layouts/Base.astro'
import { adapter } from '../../lib/catalog'
import { groupCategoriesByGroup, sortItemsByDisplayName } from '../../lib/categories'
import CategorySidebar from '../../components/CategorySidebar.astro'
import ItemTypeChip from '../../components/ItemTypeChip.astro'
import WhatsAppCta from '../../components/WhatsAppCta.astro'
import PdfDownloadButton from '../../components/PdfDownloadButton.astro'

const allItems = sortItemsByDisplayName(adapter.items)         // 681 sorted
const groups = groupCategoriesByGroup(adapter.categories)     // Map<group, CategorySummary[]>
const totalProducts = allItems.length                          // 681
const rowsForPdf = allItems.map(it =>
  `${it.sku} | ${it.display_name} | ${adapter.getCategory(it.category_code)?.label ?? ''}`
)

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  numberOfItems: allItems.length,                              // 681 (post-dedup, matches visible)
  itemListElement: allItems.map((it, idx) => ({
    '@type': 'ListItem',
    position: idx + 1,
    name: it.display_name,
    url: `${import.meta.env.PUBLIC_SITE_URL}/productos/${adapter.getCategory(it.category_code)?.slug ?? ''}/${encodeURIComponent(it.sku)}`,
  })),
}
```

### 8.2 Body

```html
<Base title="Catalogo | Todo Huincha" description="Catalogo completo de productos Todo Huincha.">
  <section class="catalog-hero-dark">
    <div class="wrap">
      <span class="eyebrow">Catalogo</span>
      <h1 id="cat-label">Todos los productos</h1>
      <p><span id="cat-count">{totalProducts}</span> productos disponibles</p>
      <input id="cat-search" type="search" placeholder="Buscar por producto o codigo..." aria-label="Buscar productos" />
      <PdfDownloadButton title="Catalogo Todo Huincha" subtitle={`${totalProducts} productos en ${adapter.categories.length} categorias`} rows={rowsForPdf} />
    </div>
  </section>

  <div class="catalog-layout wrap">
    <CategorySidebar categories={adapter.categories} activeSlug={null} totalProducts={totalProducts} />

    <main>
      <div class="cat-table-header"><span>PRODUCTO</span><span>TIPO</span><span>CODIGO</span><span>ACCION</span></div>
      <div class="catalog-list" id="cat-list">
        {[...groups.entries()].map(([groupKey, cats]) => (
          <section class="cat-section" data-group={groupKey}>
            <header class="cat-section-header">
              <h2>{groupLabel(groupKey)}</h2>
              <WhatsAppCta context={groupKey} />
            </header>
            {cats.flatMap(cat => cat.items.map(item => (
              <article class="cat-row" data-slug={cat.slug} data-search={`${item.display_name} ${item.sku} ${cat.label} ${item.search?.tokens?.join(' ') ?? ''}`.toLowerCase()}>
                <span class="cat-row-name">{item.display_name}</span>
                <ItemTypeChip itemType={item.item_type} />
                <span class="cat-row-code">Cod. {item.sku}</span>
                <a class="button cat-row-btn" href={`/productos/${cat.slug}/${encodeURIComponent(item.sku)}`}>Ver y cotizar</a>
              </article>
            )))}
          </section>
        ))}
      </div>
      <p class="catalog-empty" id="cat-empty" style="display:none">No se encontraron productos para esta busqueda.</p>
      <div class="catalog-final-cta"><WhatsAppCta context="general" /></div>
    </main>
  </div>

  <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
</Base>
```

### 8.3 Script (vanilla JS)

```typescript
// Pseudocode for the bottom-of-page <script>
let activeSlug = '__all__'
let searchTerm = ''
let debounceTimer: number | undefined

function render() {
  const rows = document.querySelectorAll<HTMLElement>('.cat-row')
  let visible = 0
  rows.forEach(r => {
    const slugMatch = activeSlug === '__all__' || r.dataset.slug === activeSlug
    const searchMatch = !searchTerm || (r.dataset.search ?? '').includes(searchTerm)
    const show = slugMatch && searchMatch
    r.classList.toggle('is-hidden', !show)
    if (show) visible++
  })
  // update hero count + label + empty + pdf data attrs
}

document.querySelectorAll<HTMLButtonElement>('.sidebar-item, .sidebar-all').forEach(btn => {
  btn.addEventListener('click', () => {
    activeSlug = btn.dataset.slug ?? '__all__'
    // toggle .is-active, update label
    render()
  })
})

document.querySelector<HTMLInputElement>('#cat-search')?.addEventListener('input', (e) => {
  clearTimeout(debounceTimer)
  const v = (e.target as HTMLInputElement).value.toLowerCase().trim()
  debounceTimer = window.setTimeout(() => { searchTerm = v; render() }, 100)
})

render()
```

### 8.4 Net diff

Current: 447 lines. Target: ~200 lines. The reduction comes from moving jsPDF (~260 lines) into `PdfDownloadButton.astro` and replacing the inline flat-list with `.map()` over the grouped Map.

### 8.5 JSON-LD count resolution

Spec criterion 7 said 687 ListItem entries. The actual rendered HTML lists 681 items (post-dedup by SKU). The JSON-LD MUST match the visible content; emitting 687 would mismatch what Google sees. **Resolution: 681 ListItem entries** (= `adapter.items.length`). Surfaced as Open Question #1 in section 12.

---

## 9. Design Skills Applied (minimal)

| Skill | What we adopt | What we skip |
|-------|---------------|--------------|
| emil-design-eng | `cubic-bezier(0.16, 1, 0.3, 1)` easing on all buttons (150ms); `scale(0.97)` on `:active` for non-link buttons (sidebar toggle, dialog close); `prefers-reduced-motion: reduce` guard block | Mass refactor of Base.astro animations |
| impeccable | No gradient text on hero; no side-stripe borders anywhere in new code; semantic z-index (sidebar dialog = 50, mobile toggle = 40, button-in-button icon = 1); WCAG AA contrast verified on chip text via tokens | Verified the prior claimed Base.astro side-stripe does not exist |
| design-taste-frontend | `text-wrap: balance` on h1; max 1 eyebrow per page (hero only); h1 `letter-spacing: -0.03em`; max 20 words hero subtitle | Inter ban (Base.astro already uses Inter; rewriting is out of scope) |
| high-end-visual-design | WhatsAppCta double-bezel + button-in-button trailing WhatsApp icon in circular wrapper; hero `padding-top: clamp(96px, 12vw, 144px)`; mobile collapse: sidebar -> off-canvas `<dialog>`, rows -> full-width single column below 768px | Premium palette overhaul (tokens are locked in Base.astro) |
| seo-geo | JSON-LD ItemList schema at end of body; semantic `<h1>` with primary keyword ("Todos los productos"); `<ItemTypeChip>` aria-label provides text alternative for the colored span | Per-product image alt (no images in slice 2) |

---

## 10. Risk Mitigation

| Risk | L | Mitigation |
|------|---|------------|
| Astro components not unit-testable with `node:test` | HIGH | TDD on the two pure lib helpers (`whatsapp.ts`, `categories.ts`). Manual smoke on `dist/catalogo/index.html` after `astro build` (verify: 8 grouped sections, chips visible, search filter, WhatsApp CTA, PDF download, JSON-LD block). Same pattern slice 1 used for the adapter. |
| `PdfDownloadButton` jsPDF duplication with `DownloadPdf` | MED | Catalog jsPDF moves verbatim into the new component (single responsibility). `DownloadPdf.astro` (product detail, 297 lines) untouched. Future slice may consolidate via a shared generator; out of scope for slice 2. |
| JSON-LD count mismatch (spec says 687, visible says 681) | LOW | RESOLVED in design: emit 681 ListItem entries from `adapter.items`. Add a comment in the frontmatter explaining the resolution. |
| Test path glob mismatch (`tests/**/*.test.mjs` does not pick up `src/lib/__tests__/`) | LOW | New tests live at `tests/lib/whatsapp.test.mjs` and `tests/lib/category-grouping.test.mjs` (matches the existing glob). |
| Sidebar group order drift if adapter order changes | LOW | `CATEGORY_GROUP_ORDER` is the hardcoded 8-group contract in `src/lib/categories.ts`. `groupCategoriesByGroup` iterates this list to build the Map. Adapter can change `categories` order; sidebar order stays locked. |
| `PUBLIC_WHATSAPP_NUMBERS` env empty at build | LOW | `WhatsAppCta` renders disabled-state with copy `Configura PUBLIC_WHATSAPP_NUMBERS en .env`. Build never fails. |
| Diff budget pressure (D2 = 800 lines) | LOW | Estimated ~340 lines net: 4 components ~200 + 2 helpers ~60 + 2 tests ~80 + page rewrite ~200 - 447 (current) ~= +93 net. Comfortable margin. |
| Slice 5 image integration may require page rewrite again | LOW | `ItemTypeChip` and `CategorySidebar` are image-aware by prop signature (they accept any future `imageUrl?: string` without breaking). |

---

## 11. Rollback Plan

`git revert <slice-2-merge-commit>` restores the prior 447-line `src/pages/catalogo/index.astro` (the v1-shim version with the flat sidebar) and removes the 8 new files:

- Deleted: `src/lib/whatsapp.ts`, `src/lib/categories.ts`, `src/components/CategorySidebar.astro`, `src/components/ItemTypeChip.astro`, `src/components/WhatsAppCta.astro`, `src/components/PdfDownloadButton.astro`, `tests/lib/whatsapp.test.mjs`, `tests/lib/category-grouping.test.mjs`.

Unchanged (and unaffected by the revert): `src/lib/catalog.ts` (slice 1 adapter, frozen), `src/data/catalog.ts` (shim), `src/components/DownloadPdf.astro` (product-detail PDF, untouched), `.env.example`, slice 1 test suite. The dead-end WhatsApp links on `src/pages/productos/[category]/[reference].astro` and `src/pages/maquinaria/[slug].astro` stay as-is (out of slice 2 scope; slices 3 and 4 will fix them once they adopt `src/lib/whatsapp.ts`).

No data migration, no DB, no schema version bump.

---

## 12. Open Questions and Implementation Order

### 12.1 Open Questions

- [x] **(RESOLVED)** JSON-LD ItemList count: spec said 687, but the rendered HTML lists 681 (post-dedup). Design emits 681. `numberOfItems: 681` and `itemListElement` of length 681.
- [ ] **Slice 5 image integration**: deferred. Components are image-aware by prop signature so a future slice can add banners without restructuring.
- [ ] **Public CTA at the end of the list**: included as `<div class="catalog-final-cta"><WhatsAppCta context="general" /></div>`. PM sign-off needed if a different CTA copy is preferred.

### 12.2 Implementation Order (input to sdd-tasks)

| Step | Action | Verification |
|------|--------|--------------|
| T1 | Write `tests/lib/whatsapp.test.mjs` with 8 assertions. | `npm test` FAILS (red). `src/lib/whatsapp.ts` does not exist. |
| T2 | Write `src/lib/whatsapp.ts` (parse + build helpers). | `npm test` PASSES the new 8 assertions (green). |
| T3 | Write `tests/lib/category-grouping.test.mjs` with 6 assertions. | `npm test` FAILS for the new file (red). |
| T4 | Write `src/lib/categories.ts` (CATEGORY_GROUP_ORDER + 2 helpers). | `npm test` PASSES (green). |
| T5 | Create `src/components/ItemTypeChip.astro` (simplest component; no logic). | `npx astro check` 0 errors. |
| T6 | Create `src/components/CategorySidebar.astro` (uses categories.ts). | `npx astro check` 0 errors. |
| T7 | Create `src/components/WhatsAppCta.astro` (uses whatsapp.ts + import.meta.env). | `npx astro check` 0 errors. |
| T8 | Create `src/components/PdfDownloadButton.astro` (jsPDF moved verbatim). | `npx astro check` 0 errors. |
| T9 | Rewrite `src/pages/catalogo/index.astro` (447 -> ~200 lines). | `npx astro check` 0 errors. |
| T10 | `npx astro check && npm test && npx astro build`. | All green. Build log shows 21 cat + 681 product + 2 API JSON + 1 landing page. |
| T11 | Manual smoke on `dist/catalogo/index.html`: verify 8 grouped sections in fixed order, chips colored per type, search filter (100ms debounce), sidebar click, WhatsApp CTA recipient visible (or disabled state if env empty), PDF download triggers jsPDF generation, JSON-LD `<script type="application/ld+json">` present with 681 ListItem entries. | All visible. |
| T12 | `git add` + conventional commit (no AI attribution) + push. | Commit message matches repo style (e.g. `feat(catalog-ui): migrate catalog landing to v2 data model (slice 2)`). |

---

## 13. Artifacts Touched

| File | Status | Purpose |
|------|--------|---------|
| `src/lib/whatsapp.ts` | NEW | Pure: parse env, build URL. TDD-first. |
| `src/lib/categories.ts` | NEW | Pure: fixed 8-group order, locale-aware sort. TDD-first. |
| `src/components/CategorySidebar.astro` | NEW | 8-group sidebar, sticky desktop, dialog drawer mobile. Scoped styles. |
| `src/components/ItemTypeChip.astro` | NEW | Per-type colored chip. Scoped styles. |
| `src/components/WhatsAppCta.astro` | NEW | Context-aware CTA with disabled fallback. Scoped styles. |
| `src/components/PdfDownloadButton.astro` | NEW | Catalog-level jsPDF generator. Owns ~260 lines. |
| `src/pages/catalogo/index.astro` | REWRITE | 447 -> ~200 lines. Composition root. JSON-LD at end of body. |
| `tests/lib/whatsapp.test.mjs` | NEW | 8 assertions. |
| `tests/lib/category-grouping.test.mjs` | NEW | 6 assertions. |

Untouched (per the slice 1 contract and the slice 2 scope):
`src/lib/catalog.ts`, `src/data/catalog.ts`, `src/components/DownloadPdf.astro`,
`.env.example`, `src/layouts/Base.astro`, slices 3 and 4 pages,
`astro.config.mjs`, `package.json`, `tsconfig.json`.