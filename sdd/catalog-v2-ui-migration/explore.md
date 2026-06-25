# Exploration: catalog-v2-ui-migration

Branch: `feat/catalog-robust-v2-base`
Explored: 2026-06-25
Project: todohuincha-catalogo (Astro 5, output: static)

---

## Executive Summary

The catalog data layer v2 is essentially done — `docs/catalogo_productos_robusto_completo_corregido.json` (687 items, 666 families, 10 services, validates against JSON Schema 2020-12), the two prerendered endpoints (`/api/catalogs/[slug]/schema.json` + `/catalog.json`) compile fine, and `src/data/catalog-client.ts` is a working browser-side schema-first client with AJV validation, localStorage caching, and ETag/version handling. But the **UI layer was half-migrated in the previous commit** and **the build does not pass right now**.

`astro build` fails at the Rollup phase on `src/pages/catalogo/[slug].astro` because it imports `itemsByCategory` and `CatalogItem` from `src/data/catalog.ts`, which exports neither. `astro check` reports 12 errors: missing exports in `catalog.ts`, `category.label` referenced where the old type only has `title`, and `items` referenced where only `products` exists. The two new dynamic pages (`/catalogo/[slug]` and `/productos/[cat]/[ref]`) were written against the v2 data shape (`sku`, `display_name`, `category_code`, `category_label`, `item_type`, `status`, `pricing`) but no Node-side adapter bridges the canonical JSON to those symbols — the old flat JSON adapter is still in place and the old `/catalogo/index.astro` still uses the old shape.

The fix is mechanical and well-scoped: a new build-time adapter (`src/lib/catalog.ts` or replacement of `src/data/catalog.ts`) that loads the canonical JSON + schema via the existing `src/lib/catalog-source.ts`, validates it with AJV, and exposes the v2 shape (`items`, `categories` with `.slug/.code/.label`, `families`, `serviceCatalog`, plus `getCategoryBySlug/Code`, `getItemBySku`, `itemsByCategory`, `searchItems`). The existing `catalog-client.ts` stays as the browser-side counterpart for any dynamic filtering/faceting; the static prerender uses the build-time adapter.

Once the build is green, the actual UX work begins: apply the 5 design skills (emil, impeccable, design-taste-frontend, high-end-visual-design, seo-geo) to the three migrated pages, lock in WhatsApp deep-link as the primary CTA on `/productos/...`, and consolidate the PDF generation logic (currently duplicated in `DownloadPdf.astro`, `index.astro`, `[slug].astro`, `maquinaria.astro`) into a single shared component. First cycle slice: **unblock the build + deliver a working `/catalogo/[slug]` with the new shape** (one page, end-to-end, schema-validated). Everything else cascades from that.

---

## Current State

**What works right now:**
- `astro check` and `astro build` pass on `/` and `/maquinaria` (maquinaria uses its own `src/data/maquinaria.ts`, isolated from the catalog work).
- Schema-first API endpoints prerender correctly (verified via reading code; not yet exercised at runtime because build fails before they emit).
- `src/data/catalog-client.ts` (browser-side, 365 lines) is complete and tested by inspection — uses AJV 2020-12, caches schema in localStorage with 24h TTL, fetches with ETag headers, re-validates on mismatch.
- 6 Node scripts in `scripts/` cover validation and coverage checks; `tests/catalog.test.mjs` validates the OLD flat JSON has 683 rows in 21 categories and 6 duplicates.
- Documentation: 16-section spec (`especificacion_catalogo_industrial_primera_version_corregida.md`), schema (`catalogo_productos_schema_validacion_corregido.json`, JSON Schema 2020-12), and canonical data (2.25MB, 687 items).
- Domain decisions documented in engram: 33 items reclassified from `service` to `simple_product` in commit 523b61b, Excel `CODIGOS_TH.xlsx` is the source of truth for products, 10 abstract services live in `service_catalog[]`.

**What is broken right now:**
- `astro check` reports 12 errors, `astro build` fails at Rollup phase. Cannot ship until this is fixed.
- `src/data/catalog.ts` exports `categories, catalog, products, getCategory, getProduct` (v1 shape, `Category.title`, `Product.internal_reference`, no `items[]`).
- `src/pages/index.astro:49` reads `category.label` but type is `Category` with `title`.
- `src/pages/catalogo/[slug].astro` imports non-existent `itemsByCategory`, `CatalogItem`, references `category.label`, `category.code`, and expects `product.sku`, `product.display_name`, `product.pricing.formatted`, `product.item_type`.
- `src/pages/productos/[category]/[reference].astro` imports non-existent `items`, `CatalogItem`, expects `item.status`, `item.item_type`, `item.display_name`, `item.sku`, `item.category_label`.
- `src/pages/catalogo/index.astro` (the root catalog) is the only page still on v1 shape.

**Data model recap (confirmed by reading JSON):**
- 687 items in `items[]`, breakdown: 558 `simple_product`, 98 `spare_part`, 31 `machinery`, 0 `service`.
- 666 families in `families[]` (heavy deduplication).
- 22 categories (per `catalog.totals.categories`), but items only use 21 distinct `category_code` values (saws, steels, sharpening services, machinery). 21 visible from `Group-Object category_code` test.
- 10 abstract services in `service_catalog[]` (`SERV-TROQUELADO`, `SERV-SOLDADURA-MIG`, etc.), `pricing_mode: "quoted"`, `requires_diagnosis: true`.
- `dictionaries.category_dictionary` already provides `{label, slug, group, entity_class_default, products_count}` — the adapter can derive `Category.slug` and `Category.label` from here.

---

## Affected Areas

Files that **MUST** be created or modified to unblock the build and ship v2 UI:

**New / replacement (build-time adapter):**
- `src/data/catalog.ts` — REPLACE. Becomes a thin re-export from `src/lib/catalog.ts` (or absorbed entirely). Keeps backward-compatible `categories, products` exports if any consumer still needs them.
- `src/lib/catalog.ts` — NEW. The actual adapter: loads JSON via `src/lib/catalog-source.ts`, validates against schema with AJV, exposes `items`, `categories` (with `slug`, `code`, `label`), `families`, `serviceCatalog`, helpers (`getCategoryBySlug`, `getCategoryByCode`, `getItemBySku`, `itemsByCategory`, `searchItems`), types (`CatalogItem`, `CategorySummary`).
- `src/lib/__tests__/catalog.test.ts` (or `.mjs`) — NEW. TDD coverage: schema-valid input produces expected counts, `getItemBySku` returns the right item, `itemsByCategory('MAQUINAS')` returns 31 items, dedup of 6 duplicate SKUs is preserved.

**Modified (consumers):**
- `src/pages/index.astro` — one-line fix: `category.title` → `category.label` (or change adapter to expose `label` everywhere and keep both).
- `src/pages/catalogo/index.astro` — migrate root catalog page from old `categories, products` to v2 `items, categories` shape. Heavy work: search, sidebar, PDF button data prep, total count.
- `src/pages/catalogo/[slug].astro` — already uses v2 shape, just needs the adapter to compile. Apply design skills: emil motion, impeccable clarity, typography.
- `src/pages/productos/[category]/[reference].astro` — already uses v2 shape, just needs the adapter. WhatsApp deep-link is already there (`https://wa.me/?text=...`) but needs the **real** number, not bare `wa.me/?text`. Lock as primary CTA.

**Refactor (deduplication, not blocking but recommended for first cycle):**
- `src/components/DownloadPdf.astro` — extract the 200+ lines of jsPDF logic shared across 4 files into one parameterized component. Current duplication is a maintainability tax; skills demand consolidation.
- `src/components/WhatsAppCta.astro` — NEW. Centralize the WhatsApp deep-link generator with the actual number constant. Make it impossible to ship without a real number.

**No changes needed:**
- `src/data/catalog-client.ts` — browser-side client, stays as-is.
- `src/pages/api/catalogs/[slug]/*.ts` — schema-first endpoints, stay as-is.
- `src/data/maquinaria.ts`, `src/pages/maquinaria.astro`, `src/pages/maquinaria/[slug].astro` — separate domain (maquinaria division), not in scope.
- `src/layouts/Base.astro` — minimal markup + global styles; re-evaluate after design pass.
- `docs/`, `scripts/`, `tests/catalog.test.mjs` — data validation stays.

---

## Approaches

### Approach A: Adapter-replaces-old-file (RECOMMENDED)

1. Create `src/lib/catalog.ts` — the v2 adapter (schema-validated, build-time, no fetch).
2. Replace `src/data/catalog.ts` content to re-export from `src/lib/catalog.ts` for backward compatibility, OR delete it and update imports.
3. Update the 4 `.astro` pages to use the new symbols.
4. Add `tests/lib/catalog.test.mjs` using `node --test` (project already uses it).
5. Apply design skills in subsequent slices (one page per slice).

- **Pros:** Smallest first slice, unblocks build immediately, keeps catalog-client untouched, isolates Node-only code in `lib/` so the browser bundle stays clean.
- **Cons:** Two files (`src/data/catalog.ts` + `src/lib/catalog.ts`) for one concept if you keep backward compat. Decide: re-export from data/catalog.ts OR delete it.
- **Effort:** Low (first slice), Medium (total with design polish).

### Approach B: Adapter-in-place (replace contents of catalog.ts)

Same as A but skip the `lib/` directory and put the adapter directly in `src/data/catalog.ts`. Loses the lib-vs-data separation; the existing `catalog-source.ts` would have to move.

- **Pros:** Fewer files.
- **Cons:** Blurs boundary between "loaders (lib/)" and "domain adapter (data/)". Harder to test in isolation. No real win.
- **Effort:** Low. **Not recommended** — separation matters when we add features.

### Approach C: Browser-only via fetch (reject)

Have Astro pages fetch from `/api/catalogs/[slug]/catalog.json` at build time via Node's `fetch`. The endpoints are already prerendered, so the build could read them back.

- **Pros:** Single source of truth, exercises the API layer.
- **Cons:** Astro `output: 'static'` + prerendered endpoints means the endpoint output is written to disk after pages evaluate. Race condition / chicken-and-egg. Also doubles bundle size at build (JSON inlined in JS AND as a static file). Slower build.
- **Effort:** Medium. **Rejected** — fights the framework.

### Approach D: Skip the adapter, point pages at the JSON directly

Each `.astro` page imports the canonical JSON and re-derives everything inline.

- **Pros:** No adapter code.
- **Cons:** Logic duplication, no validation, no type reuse, `CatalogItem` interface lives in 3 places. Goes against "clean architecture + modularity" constraint.
- **Effort:** Low to start, but rewrite-likely later. **Rejected.**

---

## Recommendation

**Go with Approach A, first slice focused on:**

1. Create `src/lib/catalog.ts` — adapter, ~120 lines, with AJV schema validation at load time.
2. Replace `src/data/catalog.ts` with a re-export shim (or migrate imports and delete it).
3. Fix `src/pages/index.astro` (`category.title` → `category.label`).
4. Migrate `src/pages/catalogo/index.astro` to v2 shape (root catalog page).
5. Add `tests/lib/catalog.test.mjs` — TDD, schema validation, count assertions, dedup check.
6. Run `astro check && astro build` until green.
7. One PR for the unblock (small, reviewable in <800 lines).

**Second slice (after merge):**
- Apply design skills to `/catalogo/[slug]` first (most-touched page, has the new shape already).
- Extract `DownloadPdf.astro` consolidation.
- Add `WhatsAppCta.astro` with the real number.
- Apply impeccable + design-taste-frontend typography and motion.

**Third slice:**
- Apply same design polish to `/productos/[cat]/[ref]` (WhatsApp primary CTA, type-aware spec sheet).
- Apply seo-geo: JSON-LD for `Product` and `Offer` (when price available), `BreadcrumbList`, robots/llms.txt, locale metadata.

**Fourth slice:**
- Apply same polish to `/catalogo` root, faceted search (family, type, price-availability).

Why this ordering: build green → single page done well → fan out. Each slice is one PR, each PR is reviewable in <800 lines per the user's D2 budget. Skills get applied once per page so the team can review the design treatment in context, not all at once.

---

## Risks

- **HIGH (blocks everything):** `astro build` is broken right now. If we ship new features on a broken base, every PR will be a tar-pit. **Unblock first.** A2 says "automatic pace, stop on high risk" — this counts as high risk because nothing can land without it.
- **MEDIUM:** The 21 vs 22 categories count discrepancy (`catalog.totals.categories = 22`, items use 21 distinct `category_code` values). The category_dictionary may have an entry without items, or the totals field is stale. Verify before wiring sidebar counts.
- **MEDIUM:** Items have `category_code` like `S.CIRCULARES` (saw blades), `S.BIMETAL`, `S.CARPINTERAS`, `S.ALIMENTO` — these are saw family codes, not just categories. Naming will confuse users in UI. Decide: display raw `category_label` (e.g. "Sierras Circulares" — derived from dictionary) or humanize. The dictionary already has clean labels — use those.
- **MEDIUM:** WhatsApp number is missing from all current CTAs. `https://wa.me/?text=...` opens WhatsApp web but with no destination. Need the real `+56 9 XXXX XXXX` for Todo Huincha. **User input required.**
- **MEDIUM:** No real product images in v2 JSON (`assets.main_image: null` for nearly all 687 items). PDF will rely on placeholders. Image sourcing is out of scope per spec section 1.1 (PDFs from developer are inputs, not assets) but the catalog UI will look barren. Acknowledge in proposal.
- **LOW:** PDF generation logic is duplicated across 4 files (~600 lines of jsPDF). Consolidate later; don't block first slice.
- **LOW:** Old `tests/catalog.test.mjs` validates the OLD flat JSON (683 rows, 21 categories). After adapter lands, this test becomes obsolete. Either delete or migrate to test the new adapter.

---

## Ready for Proposal

**Status: ok with one open question for the user.**

Open question (must answer before proposal): **What is the real WhatsApp number for Todo Huincha?** (`+56 9 ???? ????`). The current code uses bare `https://wa.me/?text=...` which is a UX dead-end — the user lands on WhatsApp web with a pre-filled message but no recipient. Per the user's "WhatsApp is the sales funnel target" constraint, this is blocking.

Once that's answered, propose the first cycle as: **unblock the build with the v2 adapter** (Approach A, scope above, ~400 lines including tests). Single PR, single goal, end-to-end working catalog root page on v2 data. From there, fan out per the 4-slice plan.
