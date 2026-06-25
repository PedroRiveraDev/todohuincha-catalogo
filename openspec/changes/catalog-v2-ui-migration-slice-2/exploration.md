# Exploration: catalog-v2-ui-migration-slice-2 (catalog landing page migration)

> Slice 2 of `catalog-v2-ui-migration`. Migrates `src/pages/catalogo/index.astro`
> to consume the v2 adapter directly (not via the legacy shim), adds the
> WhatsApp sales CTA, refreshes the UI with grouped sidebar + type chips +
> double-bezel search, generates the catalog PDF from adapter rows, and
> emits JSON-LD ItemList schema. No new backend work; no changes to
> `/catalogo/[slug]`, `/productos/...`, or `/maquinaria/...`.

---

## Current State

### Data layer (verified, slice 1 deliverable — NO changes in this slice)

`src/lib/catalog.ts` (293 lines, frozen `adapter`) exposes:
- `adapter.items` — 681 `CatalogItem[]` post-dedup, sorted inside each category by `display_name` asc.
- `adapter.categories` — 21 `CategorySummary[]` (the 22nd `category_dictionary` key, `SERVICIOS`, is orphan and skipped). Each has `code`, `label`, `slug`, `group`, `products_count`, `items[]`, plus backward-compat aliases `title === label` and `products === items.map(toLegacyProduct)`.
- `adapter.serviceCategories` — 10 service profiles.
- `adapter.families` — 666 entries.
- `adapter.legacyView` — v1-shape projection (`categories[].title/slug/products_count/products`, flat `products[]`, `catalog` aggregate). This is what the shim re-exports today.
- Helpers: `getCategory`, `getCategoryBySlug`, `getItem`, `getFamilyByKey`, `itemsByCategory`, `itemsByFamily`, `itemsByType`, `countByType`, `countByGroup`.

Tests: `tests/lib/catalog.test.mjs` (18/18 passing — 17 positive + 1 AJV negative).

### Page being migrated (447 lines)

`src/pages/catalogo/index.astro` currently:
1. Imports `{ categories, products }` from `../../data/catalog` (the legacy shim).
2. Renders a dark hero with title "Todos los productos" + count "{products.length} productos disponibles" + search input + PDF button.
3. Renders a sidebar with "Todos los productos" + 21 flat category buttons (no grouping).
4. Renders a list of 681 product rows: `name | category.tag | Cód. sku | "Ver y cotizar"` button.
5. Inline `<script>` (~260 lines): search filter, sidebar category filter, jsPDF "Catálogo de productos" generation (full A4 layout with logo, page numbers, grouped rows by category).

CSS lives in `src/layouts/Base.astro` line 48+, as a single minified `<style is:global>` block. The relevant selectors are `.catalog-hero-dark`, `.catalog-search-dark`, `.pdf-btn-dark`, `.cat-sidebar*`, `.cat-row*`, `.cat-table-header`, `.catalog-list`, `.catalog-empty`. **The sidebar active state uses `border-left: 3px solid var(--orange)`** — see Risks #3.

### Existing WhatsApp usage (already in the codebase, but buggy)

`src/pages/productos/[category]/[reference].astro:18` and `src/pages/maquinaria/[slug].astro:23` both already have:
```html
<a class="button" href={`https://wa.me/?text=${message}`} target="_blank" rel="noreferrer">Solicitar cotización por WhatsApp</a>
```
**No recipient number is set.** Bare `wa.me/?text=...` opens WhatsApp web with the message but no destination — UX dead end. A previous `sdd/catalog-v2-ui-migration/explore.md` flagged this. Slice 2 is the right slice to centralize the WhatsApp helper that these existing pages will consume in slice 3+4.

### Env contract (slice 1)

`.env.example` (19 lines) at repo root: `PUBLIC_SITE_URL` (default `http://localhost:4322`), `PUBLIC_WHATSAPP_NUMBERS` (empty default, commented placeholder `sales:+56912345678,repuestos:+56912345679,machinery:+56912345680`), optional `PUBLIC_GA_ID` (commented out). Format: comma-separated `key:value` pairs. `.env` is gitignored.

### Image assets on disk (NOT in `public/` yet)

`docs/img-categorias/` contains 5 images totaling ~1 MB:
- `agricola.webp` (264 KB)
- `forestal.webp` (112 KB)
- `jardin.webp` (202 KB)
- `madera.jpg` (154 KB)
- `otros.jpg` (174 KB)

The `public/maquinaria/` directory has identically-named copies of these (different path, same files). The prompt requires copying them to `public/img-categorias/` so Astro serves them at `/img-categorias/*.webp` and `/img-categorias/otros.webp`.

### Test infrastructure

`package.json` script: `"test": "node --import tsx --test \"tests/**/*.test.mjs\""`. So the test glob is `tests/**/*.test.mjs`. The user's prompt says `src/lib/__tests__/whatsapp.test.mjs` and `src/components/__tests__/category-grouping.test.mjs` — **these paths are NOT picked up by the glob.** See Risks #4.

---

## Affected Areas

### READ ONLY (do not modify in this slice)

- `src/lib/catalog.ts` — slice 1 frozen. Verified: 293 lines, AJV + dedup + derivation all present.
- `src/data/catalog.ts` — 42-line shim, preserved as-is.
- `src/pages/catalogo/[slug].astro` — category detail, slice 3.
- `src/pages/productos/[category]/[reference].astro` — product detail, slice 4.
- `src/pages/maquinaria.astro`, `src/pages/maquinaria/[slug].astro`, `src/pages/index.astro`, `src/pages/contacto.astro` — out of scope.
- `src/data/catalog-client.ts`, `src/lib/catalog-source.ts`, `src/data/maquinaria.ts` — out of scope.
- `src/pages/api/catalogs/[slug]/*` — API endpoints, out of scope.
- `docs/catalogo_productos_robusto_completo_corregido.json` — source data, untouched.

### MODIFY

- `src/pages/catalogo/index.astro` (447 → ~180 lines). Rewrites imports to consume adapter directly, adds grouped sidebar, JSON-LD ItemList schema, integrates new components, replaces inline PDF script with `<PdfDownloadButton>` invocation.

### NEW

- `src/lib/whatsapp.ts` — pure helpers: `parseWhatsAppNumbers(env)`, `buildWhatsAppUrl(number, message)`. TDD-first.
- `src/components/CategorySidebar.astro` — grouped sidebar with 8 groups (NOT 6; see Risks #2).
- `src/components/ItemTypeChip.astro` — colored chip for `item_type`.
- `src/components/WhatsAppCta.astro` — context-aware CTA reading `PUBLIC_WHATSAPP_NUMBERS` at build time via `import.meta.env`. Falls back to disabled state when env is empty.
- `src/components/PdfDownloadButton.astro` — wraps the catalog PDF logic that currently lives inline in `src/pages/catalogo/index.astro:84-446`. NOTE: this is a NEW component, not a wrap of `src/components/DownloadPdf.astro` (which is the product-detail PDF, different layout).

### ASSETS

- Copy 5 images from `docs/img-categorias/` to `public/img-categorias/`, renaming `otros.jpg` to `otros.webp` (per prompt). This means: `agricola.webp`, `forestal.webp`, `jardin.webp`, `madera.webp` (rename from .jpg), `otros.webp` (rename from .jpg). Astro's static-asset pipeline will serve them at `/img-categorias/`.

### TESTS

- `tests/lib/whatsapp.test.mjs` — TDD for `parseWhatsAppNumbers` + `buildWhatsAppUrl`.
- `tests/lib/category-grouping.test.mjs` — TDD for the `groupCategoriesByGroup` helper used in `CategorySidebar.astro`.
- Manual smoke: `dist/catalogo/index.html` renders the new UI after `npx astro build`.

---

## Approaches

### Approach 1 — Slice 2 as the user described (RECOMMENDED)

Migrate the page, add WhatsApp CTA, add 4 new components, generate the catalog PDF from adapter rows, emit ItemList schema. Apply the 5 design skills with the prompt's "minimal" caveat — i.e. select the parts of each skill that genuinely serve the page (easing curve, sidebar sticky, JSON-LD, WCAG contrast) and skip the parts that contradict existing project conventions (side-stripe borders, em-dash bans, Inter ban, premium-consumer palette bans — these would require touching Base.astro and the brand identity, which is out of scope for "one page").

- Pros: matches user intent, single PR (well under D2's 800 lines), reusable helpers (whatsapp.ts is consumed by slices 3+4), unblocks the WhatsApp dead-end that slice 1 left as documented debt.
- Cons: Sidebar active-state `border-left: 3px solid var(--orange)` violates impeccable's "side-stripe borders" ban. Resolved by exception (existing brand identity, out-of-scope rewrite of Base.astro).
- Effort: Medium. ~600 source lines net (5 components × ~60-90 + 1 lib × ~40 + 2 tests × ~80 + page rewrite -447 + ~180 ≈ +600).

### Approach 2 — Component-only slice, defer PDF

Migrate the page, add components, emit schema, but leave the existing inline PDF script in place. Defer `PdfDownloadButton.astro` to slice 2.5.

- Pros: smaller slice (~350 lines), less risk.
- Cons: doesn't move the PDF logic out of the page; leaves a 260-line `<script>` block in the page that this slice was supposed to clean up per the prompt.
- Effort: Low.

### Approach 3 — Bigger slice (also add slice 3 surfaces here)

Migrate the page + the category detail + the product detail all in one slice.

- Pros: "go little by little" inverted; bigger blast radius per change.
- Cons: violates slice-by-slice discipline. Three different page templates means three different design challenges. 1500+ lines, blows D2.
- Effort: High.

**Recommendation: Approach 1.** Matches the prompt exactly. Approach 2 is the fallback if the 800-line budget gets tight (skip PdfDownloadButton, keep inline PDF script).

---

## Recommendation

**Go with Approach 1.** Execute the prompt as written. The slice is well-bounded: 5 new files (4 components + 1 lib helper), 1 modified file (the page itself, going from 447 → ~180 lines), 2 test files, 5 image copies, 1 JSON-LD block in the page.

Critical sequencing to keep TDD honest:
1. Write `tests/lib/whatsapp.test.mjs` RED. Write `src/lib/whatsapp.ts` GREEN.
2. Write `tests/lib/category-grouping.test.mjs` RED. Extract `groupCategoriesByGroup` from `CategorySidebar.astro` into a pure helper in `src/lib/whatsapp.ts` (or a new `src/lib/categories.ts`) GREEN.
3. Build the 4 components. Each component reads from adapter / props; no business logic.
4. Rewrite the page to use the components. Replace inline PDF script with `<PdfDownloadButton>`. Add ItemList JSON-LD.
5. Copy the 5 images to `public/img-categorias/`.
6. Run `npx astro check` + `npm test` + `npx astro build`. Manual smoke: open `dist/catalogo/index.html` and verify the sidebar groups, the chip colors, the search filter, the PDF download.

---

## Risks

### RISK 1 — HIGH: 8 category groups, not 6 (USER PROMPT MISALIGNMENT)

The prompt says: "Each group has a label header ... `servicios, materiales, maquinaria, sierras, consumibles, cuchillos`". **The actual data has 8 groups**: `sierras` (5 cats, 279 items), `consumibles` (3 cats, 146 items), `cuchillos` (5 cats, 97 items), `herramientas` (1 cat, 40 items), `materiales` (2 cats, 40 items), `servicios` (4 cats, 33 items), `maquinaria` (1 cat, 31 items), `instrumentos` (1 cat, 21 items). Total 22 category-dict entries, 21 with items. The prompt's 6 are missing `herramientas` and `instrumentos`.

**Action for orchestrator**: confirm with the user before proposal: (a) display all 8 groups in the sidebar, (b) collapse the 2 minor ones (`herramientas`, `instrumentos`) under "Otros", or (c) the prompt's 6 was a misremember and the user actually wants 8.

### RISK 2 — MEDIUM: Banner images don't semantically map to category groups

The 5 images in `docs/img-categorias/` are named `agricola`, `forestal`, `jardin`, `madera`, `otros`. The 8 category groups are `sierras`, `consumibles`, `cuchillos`, `herramientas`, `materiales`, `servicios`, `maquinaria`, `instrumentos`. There is no semantic mapping (e.g. `agricola.webp` ≠ `maquinaria` group; `madera.jpg` ≠ `materiales` group).

**Action for orchestrator**: confirm the intent. Options: (a) use the 5 images as **section background** for the 5 biggest groups by item count, ignoring semantic mismatch, (b) rename images to match groups, (c) drop image-banner plan, use the 5 images only as **fallback category hero images** keyed by `category.slug` (the images exist already and the original intent might have been per-category, not per-group).

### RISK 3 — LOW: impeccable skill bans conflict with existing Base.astro

impeccable bans `border-left > 1px` on cards/list items. The existing `.cat-sidebar-item.is-active` uses `border-left: 3px solid var(--orange)`. The user prompt says "apply 5 skills minimally" — interpreted as: do not rewrite Base.astro for this slice. Keep the side-stripe border as the brand convention; only adopt the parts of impeccable that don't require Base.astro changes (WCAG contrast, semantic z-index scale, no gradient text).

**Action**: note in the spec as an explicit exception. Re-evaluate in slice 5 (when the brand refresh happens, if the user wants it).

### RISK 4 — MEDIUM: Test path glob mismatch

The test glob is `"tests/**/*.test.mjs"`. The prompt's paths are `src/lib/__tests__/whatsapp.test.mjs` and `src/components/__tests__/category-grouping.test.mjs`. Neither path matches the glob. The tests will NOT run via `npm test`.

**Action**: write tests at `tests/lib/whatsapp.test.mjs` and `tests/lib/category-grouping.test.mjs` (or `tests/components/...`). Same content, correct path. Surface this to the user during apply.

### RISK 5 — MEDIUM: T2 testing-capabilities gate (component tests)

The prompt says "TDD-first for the lib helpers, snapshot for components". Astro components compile to HTML strings at build time via the `.astro` frontmatter. `node:test` does NOT have a built-in Astro component renderer. The existing test suite only tests pure JS/TS modules. A snapshot test for `CategorySidebar.astro` would need: (a) `@astrojs/check` + `astro build` then snapshot the rendered HTML, OR (b) extract the rendering logic into a pure function in `src/lib/categories.ts` and unit-test that function.

**Action**: the orchestrator's T2 says "TDD-first for lib helpers, snapshot for components." Recommend: keep the TDD contract for the lib helpers (`whatsapp.ts`, `categories.ts`). Skip Astro-component snapshot tests — replace them with a manual smoke test on `dist/catalogo/index.html` after `npx astro build`. This matches slice 1's pattern (T14 was a manual smoke, not a snapshot test).

### RISK 6 — LOW: `public/maquinaria/` already has 5 identically-named images

`public/maquinaria/{agricola.webp, forestal.webp, jardin.webp, madera.jpg, otros.jpg}` already exist (duplicates from `docs/img-categorias/`). Adding `public/img-categorias/` with the same files duplicates storage. Two options: (a) symlink / reference — not portable across Astro static deploys, (b) accept the duplicate bytes (~1 MB total), (c) have the catalog page reference `/maquinaria/*.webp` directly (avoid the copy).

**Action**: option (c) — reference the existing `public/maquinaria/` images. Zero bytes added. Skip the copy. Surface to user during apply: "the images already exist at `/maquinaria/`; we can reference them directly".

### RISK 7 — LOW: PdfDownloadButton vs DownloadPdf component confusion

`src/components/DownloadPdf.astro` is the **product detail PDF** ("FICHA TÉCNICA DE PRODUCTO", 297 lines). The catalog page's inline PDF script generates a **catalog PDF** ("CATÁLOGO DE PRODUCTOS", ~260 lines of jsPDF logic). These are different layouts. The prompt says "PdfDownloadButton.astro reuses the existing DownloadPdf.astro but wraps it so the data-rows prep happens in a single place." This is technically wrong — they don't share code today.

**Action**: clarify with user. Recommend: `PdfDownloadButton.astro` is a NEW component that wraps the catalog PDF logic. `DownloadPdf.astro` stays as-is for product detail. Slices 3+4 might unify them later. Document in the proposal.

### RISK 8 — LOW: em-dash ban from design-taste-frontend conflicts with existing copy

The existing page uses "—" in `Comercializadora Todo Huincha Ltda. · Longitudinal Sur 4277, Padre Las Casas · info@todohuincha.com · (45) 240 0000` (the `·` is a middle-dot, not an em-dash, so this is fine). The H1 says "Todos los productos" (no em-dash). The aria-labels and button text are em-dash-free. The PDF generation script uses `·` middle-dots and `—` em-dashes in body copy (e.g. `Comercializadora Todo Huincha Ltda. · Longitudinal Sur ...` PDF footer, no em-dash). Audit likely clean, but should be verified during design phase.

**Action**: zero impact for the page rewrite; the prompt's copy is clean. PDF script em-dashes are user-facing in the downloaded PDF — out of slice 2 scope (PDF logic moves verbatim).

---

## Open Decisions (surfaced to user)

1. **6 vs 8 category groups** (Risk #1): the prompt's 6 are missing `herramientas` and `instrumentos`. Confirm: display all 8 in the sidebar, or merge minor groups?
2. **Banner image mapping** (Risk #2): 5 images don't semantically match 8 groups. Confirm intent (per-group background, per-category fallback, or skip).
3. **WhatsApp default when env var empty**: prompt recommends "disabled button with 'Configura PUBLIC_WHATSAPP_NUMBERS en .env'". Confirmed? Or hide entirely?
4. **Per-item vs per-section WhatsApp CTA**: prompt recommends per-section (1 at hero, 1 at end of category section). 687 per-item CTAs would dominate the page. Confirmed?
5. **Search debounce**: prompt recommends client-side with 100ms debounce. Confirmed?
6. **Mobile sidebar**: prompt recommends off-canvas `<dialog>` drawer below 768px. Confirmed?

---

## Ready for Proposal

**Yes, with conditions.** The orchestrator can launch `sdd-propose` after resolving Open Decisions #1 and #2 with the user. The remaining open decisions (#3-6) can be resolved during proposal/spec writing.

Pre-flight:
- A2 (automatic) — OK to proceed without user in the loop, except for #1 and #2 which need surfacing.
- B1 (OpenSpec) — `openspec/changes/catalog-v2-ui-migration-slice-2/` directory exists (created during this exploration). No `openspec/config.yaml`; the project uses the minimal OpenSpec structure (only `changes/` and `changes-archive/`). The orchestrator should confirm whether a config file is required.
- C3 (chained) — yes, this slice consumes slice 1's adapter (frozen). Slices 3+4 will consume this slice's `whatsapp.ts` helper.
- D2 (800 lines) — estimated +600 source lines, well under budget. PdfDownloadButton could push higher if it duplicates the full 260-line PDF script; if so, defer to slice 2.5.

Estimated file inventory at the end of this slice:
- New: `src/lib/whatsapp.ts`, `src/lib/categories.ts` (for the grouping helper), `src/components/CategorySidebar.astro`, `src/components/ItemTypeChip.astro`, `src/components/WhatsAppCta.astro`, `src/components/PdfDownloadButton.astro`, `tests/lib/whatsapp.test.mjs`, `tests/lib/category-grouping.test.mjs`. (8 files)
- Modified: `src/pages/catalogo/index.astro` (447 → ~180 lines).
- Assets: 5 images at `public/img-categorias/` IF we copy (Risk #6 says we can reference existing `/maquinaria/` files instead).
- Net source delta: roughly +600 lines (excluding image bytes).

Build acceptance:
- `npx astro check` — 0 errors.
- `npm test` — 18 (existing) + ~8 (new) = ~26 passing.
- `npx astro build` — 21 cat pages + 681 product pages + 2 API JSON + 1 catalog landing page (unchanged count; only the catalog landing's HTML changes).
- Manual smoke: `dist/catalogo/index.html` shows grouped sidebar, ItemTypeChips, search filter, WhatsApp CTA, PDF button.

---

## References (for the orchestrator)

- `openspec/changes-archive/catalog-v2-ui-migration-slice-1/{proposal,spec,design,tasks,archive}.md` — slice 1 contract, the data layer slice 2 builds on.
- `src/lib/catalog.ts` — adapter, frozen.
- `src/data/catalog.ts` — shim, unchanged.
- `src/pages/catalogo/index.astro` — current page, to be rewritten.
- `src/layouts/Base.astro` line 48+ — existing catalog CSS, including the `.cat-sidebar*` rules to preserve or override.
- `src/components/DownloadPdf.astro` — product detail PDF, stays untouched.
- `docs/catalogo_productos_robusto_completo_corregido.json` — source data, 8 category_groups confirmed.
- `.env.example` — PUBLIC_WHATSAPP_NUMBERS contract.
- `package.json` — `npm test` glob: `tests/**/*.test.mjs`.