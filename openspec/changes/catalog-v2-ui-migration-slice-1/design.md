# Design: catalog-adapter (Slice 1 of catalog-v2-ui-migration)

> Architectural and technical design for the `catalog-adapter` capability
> introduced by `catalog-v2-ui-migration-slice-1`. Scope: build-time data
> layer that loads the v2 catalog JSON, validates it against its schema
> with AJV, derives v1-compatible collections, and exposes a typed
> helper API consumed by existing Astro pages through a thin shim.

---

## 1. Architecture Overview

### 1.1 Data flow diagram

```
            docs/ (filesystem, build time)
            |
            |  catalogo_productos_schema_validacion_corregido.json
            |  catalogo_productos_robusto_completo_corregido.json
            v
  +---------------------------+
  | src/lib/catalog-source.ts |   (existing, unchanged)
  |  loadSchema()  loadCatalog()  loadSchemaRaw()  loadCatalogRaw()
  +-------------+-------------+
                |
                |  raw schema + raw JSON
                v
  +---------------------------+
  | src/lib/catalog.ts        |   (NEW adapter)
  |  - AJV compile (strict:false)
  |  - validate, throw on fail
  |  - dedup items by sku
  |  - derive categories, serviceCategories
  |  - build legacyView projection
  |  - expose helpers
  +-------------+-------------+
                |
                |  adapter / adapter.legacyView
                v
  +---------------------------+
  | src/data/catalog.ts       |   (REWRITTEN shim, <= 10 lines)
  |  re-exports only, no logic
  +-------------+-------------+
                |
                |  { categories, products, getCategory, ... }
                v
  +---------------------------+
  | existing Astro pages      |   (unchanged except src/pages/index.astro
  |  src/pages/index.astro    |    line 49: category.title -> category.label)
  |  src/pages/catalogo/...   |
  |  src/pages/productos/...  |
  +---------------------------+

  Parallel (unchanged):
  src/pages/api/catalogs/[slug]/{schema,catalog.json}.ts -> catalog-source.ts
  src/data/catalog-client.ts (runtime, fetches /api/.../catalog.json)
```

### 1.2 Module responsibilities

**`src/lib/catalog-source.ts`** (existing, unchanged). Sole owner of
filesystem reads. Exposes four async functions (`loadSchema`,
`loadCatalog`, `loadSchemaRaw`, `loadCatalogRaw`) and the
`CATALOG_SLUG` constant. Paths are resolved relative to
`import.meta.url` so the file is portable across dev/build/CI. Astro
endpoints already import it. The adapter reuses the same functions;
no new file IO is introduced.

**`src/lib/catalog.ts`** (NEW). Sole owner of v2 loading + AJV
validation + derivation. Runs at module top-level (synchronous-looking
API: the file is read and validated on first import; consumers just
import the exports). Compiles AJV with `{allErrors: true, strict:
false}` to mirror the runtime client in `src/data/catalog-client.ts`.
Exposes v2 native collections (`items`, `families`, `categories`,
`serviceCategories`), v1-shape projection (`legacyView`), and a
helper API (`getCategory`, `getCategoryBySlug`, `getItem`,
`getFamilyByKey`, `itemsByCategory`, `itemsByFamily`,
`itemsByType`, `countByType`, `countByGroup`).

**`src/data/catalog.ts`** (REWRITTEN). 4-line re-export shim. Maps
adapter exports to the names existing pages import. NO mapping logic
lives here; the legacy projection is computed in the adapter's
`legacyView` and the shim just re-exports it. The shim is fully
reversible: reverting to a v1 JSON loader restores prior behavior.

### 1.3 Why this separation

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where the load+validate lives | `src/lib/catalog.ts` | Single source of truth for v2 data. AJV is owned in one file; the runtime client (`catalog-client.ts`) and the build-time adapter cannot drift because both consume the same on-disk JSON+schema and the same AJV config. |
| Where the legacy projection lives | Inside the adapter, not the shim | The shim is forbidden to contain mapping logic (spec). Putting the projection in the adapter keeps the shim to pure re-exports and makes the projection unit-testable independently. |
| Where the shim lives | `src/data/catalog.ts` (rewrite, not new file) | The shim MUST occupy the same module path every page imports from. A new file would force touching all 4 consumer pages; the rewrite keeps imports stable. |
| Sync vs async API | Sync (load happens at module top-level) | `astro build` (output: 'static') is the only consumer. A top-level await in the adapter is valid ESM and embeds the data into the static bundle. Tests run in plain `node --test` against the same module without needing async wrappers. |

---

## 2. Module Design: `src/lib/catalog.ts`

### 2.1 Public API surface (full signatures)

The adapter exports a single frozen object `adapter` with the
following shape. All functions are pure (no IO) once the module is
loaded.

```
import type {
  CatalogItem, Money, Status, ItemAssets, ItemSearch, ServiceProfile, JSONSchema
} from '../data/catalog-client';

export interface CategorySummary {       // v2 native
  code: string;                          // item.category_code
  label: string;                         // from category_dictionary
  slug: string;                          // from category_dictionary
  group: string;                         // from category_dictionary
  products_count: number;                // items[].length for this code
  items: CatalogItem[];                  // sorted by display_name asc
  // Backward-compat aliases (see 2.5):
  title: string;                         // === label
  products: LegacyProduct[];             // === items mapped to v1 shape
}

export interface LegacyCategory {        // v1 shape, surfaced via legacyView
  title: string;
  slug: string;
  products_count: number;
  products: LegacyProduct[];
  // Backward-compat alias:
  label: string;                         // === title
}

export interface LegacyProduct {         // v1 shape, surfaced via legacyView
  internal_reference: string;            // === sku
  name: string;                          // === display_name
  sale_price: number;                    // === pricing.sale_amount (null -> 0)
  category: { title: string; slug: string };
}

export interface ServiceCategorySummary {
  service_code: string;
  service_name: string;
  pricing_mode: ServiceProfile['pricing_mode'];
  is_schedulable: boolean;
  requires_diagnosis: boolean;
  capabilities: unknown[];
}

export const adapter: {
  // --- raw v2 collections (post-dedup where applicable) ---
  items: CatalogItem[];                  // length 681, deduped by sku (first wins)
  families: unknown[];                   // length 666, shape from JSON
  serviceCategories: ServiceCategorySummary[];  // length 10
  categories: CategorySummary[];         // length 21, sorted by label asc
  duplicates: string[];                  // ['1790I','216I','212I','217I','474I','1993I']

  // --- v1-shape projection (consumed by shim) ---
  legacyView: {
    categories: LegacyCategory[];        // same 21 entries, legacy shape
    products: LegacyProduct[];           // 681 entries, flat across categories
    catalog: { total_products: number; total_categories: number; categories: LegacyCategory[] };
  };

  // --- lookup helpers (operate on items post-dedup) ---
  getCategory(code: string): CategorySummary | undefined;
  getCategoryBySlug(slug: string): CategorySummary | undefined;
  getItem(sku: string): CatalogItem | undefined;
  getFamilyByKey(family_key: string): unknown | undefined;
  itemsByCategory(code: string): CatalogItem[];
  itemsByFamily(family_key: string): CatalogItem[];
  itemsByType(t: 'simple_product'|'spare_part'|'machinery'|'service'): CatalogItem[];
  countByType(): Record<string, number>;  // e.g. {simple_product:552,spare_part:98,machinery:31}
  countByGroup(): Record<string, number>;  // e.g. {servicios:...,materiales:...}
};
```

Type re-use policy: `CatalogItem`, `Money`, `Status`, `ItemAssets`,
`ItemSearch`, `ServiceProfile`, `JSONSchema` are imported from
`src/data/catalog-client.ts` (the single source of truth, already
published and consumed by the runtime client). No redeclaration.

### 2.2 Internal steps at module top-level

```
1. const schema = await loadSchema();       // unknown
2. const raw    = await loadCatalog();       // unknown
3. const ajv    = new Ajv({ allErrors: true, strict: false });
4. const validate = ajv.compile(schema as JSONSchema);
5. if (!validate(raw)) {
     const msg = (validate.errors ?? [])
       .slice(0, 5)
       .map(e => `${e.instancePath || '<root>'}: ${e.message}`)
       .join('; ');
     throw new Error(`Catalog schema mismatch: ${msg}`);
   }
6. const catalog = raw as Catalog;
7. const seen = new Set<string>(); const dups: string[] = [];
   const uniqueItems: CatalogItem[] = [];
   for (const it of catalog.items) {
     if (seen.has(it.sku)) { dups.push(it.sku); continue; }
     seen.add(it.sku);
     uniqueItems.push(it);
   }
8. const categoryDict = catalog.dictionaries.category_dictionary as Record<string, ...>;
   const categories: CategorySummary[] = (() => {
     const byCode = new Map<string, CatalogItem[]>();
     for (const it of uniqueItems) {
       const arr = byCode.get(it.category_code) ?? [];
       arr.push(it);
       byCode.set(it.category_code, arr);
     }
     const out: CategorySummary[] = [];
     for (const [code, items] of byCode) {
       const dict = categoryDict[code];
       if (!dict) continue;                 // skip orphan codes
       const sorted = [...items].sort((a, b) => a.display_name.localeCompare(b.display_name));
       const label = String(dict.label ?? code);
       const slug  = String(dict.slug  ?? code.toLowerCase());
       const group = String(dict.category_group ?? dict.group ?? '');
       out.push(buildCategorySummary(code, label, slug, group, sorted));
     }
     return out.sort((a, b) => a.label.localeCompare(b.label));
   })();
9. const serviceCategories: ServiceCategorySummary[] =
     (catalog.service_catalog as ServiceProfile[]).map(s => ({
       service_code: s.service_code,
       service_name: s.service_name,
       pricing_mode: s.pricing_mode,
       is_schedulable: s.is_schedulable,
       requires_diagnosis: s.requires_diagnosis,
       capabilities: s.capabilities ?? []
     }));
10. const legacyView = buildLegacyView(categories);   // see 2.3
11. export const adapter = Object.freeze({ ... });
```

### 2.3 legacyView projection

For each `CategorySummary` in `categories` (post-dedup, post-sort):

- `legacyView.categories[i]`:
  - `title` = `categorySummary.label`
  - `slug`  = `categorySummary.slug`
  - `products_count` = `categorySummary.products_count`
  - `products` = `categorySummary.items` mapped to `LegacyProduct`:
    - `internal_reference` = `item.sku`
    - `name` = `item.display_name`
    - `sale_price` = `item.pricing.sale_amount ?? 0`
    - `category` = `{ title: categorySummary.label, slug: categorySummary.slug }`
  - `label` = `title` (alias for index.astro migration)

- `legacyView.products`: flat `LegacyProduct[]` of all 681 items in
  category order, then by `internal_reference` ascending.

- `legacyView.catalog`: aggregate
  `{total_products: 681, total_categories: 21, categories}`.

### 2.4 Helper semantics

| Helper | Input | Output | Notes |
|--------|-------|--------|-------|
| `getCategory(code)` | `category_code` (e.g. `'MAQUINAS'`) | `CategorySummary` or `undefined` | Returns `undefined` for orphan codes like `'SERVICIOS'` (matches spec test 14). |
| `getCategoryBySlug(slug)` | `slug` (e.g. `'maquinas'`) | `CategorySummary` or `undefined` | Built by scanning `categories[].slug`. |
| `getItem(sku)` | SKU string | `CatalogItem` or `undefined` | First match in the post-dedup `items`. `getItem('LA1071')` works; `getItem('NOTFOUND')` returns `undefined`. |
| `getFamilyByKey(key)` | `family_key` | `unknown` or `undefined` | Linear scan of `families[]`; families are not the dedup subject. |
| `itemsByCategory(code)` | `category_code` | `CatalogItem[]` (sorted by display_name) | |
| `itemsByFamily(key)` | `family_key` | `CatalogItem[]` | |
| `itemsByType(t)` | `item_type` enum | `CatalogItem[]` | Spec assertions: `machinery`=31, `spare_part`=98, `simple_product`=552 (post-dedup). |
| `countByType()` | none | `Record<item_type, number>` | |
| `countByGroup()` | none | `Record<category_group, number>` | Optional, not in spec but documented in tasks T1. |

All helpers operate on the post-dedup `items` array; results are
deterministic (the module is loaded once).

### 2.5 Backward-compat aliases (CRITICAL DESIGN DECISION)

The literal 4-line shim sources `categories` from `adapter` (v2
native, with `label`). The proposal and the user's design both
require "Other pages unchanged" — yet existing pages read
`category.title` and `category.products[].internal_reference`. To
satisfy BOTH the literal shim AND unchanged pages, the adapter adds
two backward-compat fields to each `CategorySummary`:

- `title` = `label` (read-only alias, set in `buildCategorySummary`).
- `products` = `items.map(toLegacyProduct)` (legacy-shaped array).

These aliases are computed once at module load and frozen. The spec
core shape `{code, label, slug, group, products_count, items[]}` is
preserved; the aliases are additive. The aliases live in the adapter
(allowed to have logic), not the shim (forbidden). This is the only
way to keep the shim at 4 lines and keep existing pages working.

### 2.6 fail-fast behavior

- Schema mismatch: build aborts with `Catalog schema mismatch: <path>: <msg>; ...` (top 5 errors, AJV `instancePath || '<root>'`).
- TypeScript drift between catalog-client and catalog: the adapter
  imports types from `catalog-client.ts` directly, so a JSON shape
  change in `catalog-client.ts` surfaces as a compile error in
  `catalog.ts`, not a runtime crash.
- File IO failure: bubbles up from `loadSchema/loadCatalog`; the
  build fails with the underlying Node error. Acceptable: a missing
  catalog file is a hard error during build.

---

## 3. Module Design: `src/data/catalog.ts`

The shim is exactly 4 lines (per user spec). It contains NO mapping
logic, NO validation, NO derivation — it only re-exports.

```
export { adapter, adapter.legacyView as legacyCatalog } from '../lib/catalog';
export const { items, families, categories, serviceCategories } = adapter;
export const { categories: legacyCategories, products } = legacyCatalog;
```

What existing pages get when they import from `'../data/catalog'`:

- `categories`: from `adapter` (v2 native + backward-compat aliases `title` and `products`). Existing pages reading `.title` and `.products[]` keep working.
- `products`: from `legacyCatalog` (v1 shape with `internal_reference`, `name`, `category.{title,slug}`). Existing pages reading `.internal_reference` keep working.
- `items`, `families`, `serviceCategories`: from `adapter` (v2 native). Available for upcoming slices.
- `adapter`, `legacyCatalog`: full object export for advanced use (tests, future slices).

Backward-compat exports (not in the 4 lines, added in the same file
because spec/proposal require them):

- `catalog` = `legacyCatalog.catalog` (aggregate with `total_products`, `total_categories`, `categories`).
- `getCategory` = `adapter.getCategoryBySlug` (legacy callers passed a slug, not a code; the alias preserves the call site).
- `getProduct` = `(categorySlug: string, reference: string) => legacyCatalog.products.find(p => p.category.slug === categorySlug && p.internal_reference === reference)`. Helper that walks the legacy products array; trivial lookup, no mapping logic.

These three additions bring the file to ~8 lines, well under the
<=10-line ceiling in the proposal.

### 3.1 Reversibility

The shim is fully reversible: revert the file to a v1 JSON loader and
the prior behavior is restored. No other file depends on the new
exports until upcoming slices.

---

## 4. Env Contract

### 4.1 `.env.example` content (literal)

```
# =============================================================================
# Todo Huincha — public env contract (catalog-v2-ui-migration-slice-1)
# Copy to .env and fill in. .env is gitignored.
# =============================================================================

# Public origin URL for the site. Used by share links, OG tags, canonical URLs.
# Local dev: http://localhost:4322
# Production: https://todohuincha.cl
PUBLIC_SITE_URL=http://localhost:4322

# Comma-separated key:value pairs of WhatsApp contact numbers.
# Format: <key>:<E.164-number>,<key>:<E.164-number>,...
# Example (placeholders only — replace with real values in your local .env):
# PUBLIC_WHATSAPP_NUMBERS=sales:+56912345678,repuestos:+56912345679,machinery:+56912345680
PUBLIC_WHATSAPP_NUMBERS=

# Optional: Google Analytics 4 measurement ID. Uncomment to enable.
# PUBLIC_GA_ID=
```

### 4.2 Documentation

- `PUBLIC_WHATSAPP_NUMBERS` is documented as comma-separated `key:value` pairs. Empty string is the default (no numbers). Real values live only in `.env` (gitignored). The header comment makes the placeholder intent explicit so contributors do not commit real numbers.
- `PUBLIC_SITE_URL` defaults to `http://localhost:4322` (matches the existing Astro dev port, see `astro.config.mjs`).
- `PUBLIC_GA_ID` is optional and documented as commented-out.
- `.gitignore` already excludes `.env`, `.env.local`, `.env.*.local`, `.env.production`, `.env.development` (verified at lines 32-36).

---

## 5. Test Design: `tests/lib/catalog.test.mjs`

### 5.1 Framework and structure

- Test runner: `node --test` (configured in `package.json` scripts.test).
- Imports: `import test from 'node:test'; import assert from 'node:assert/strict';`.
- Adapter import: `import { adapter } from '../src/lib/catalog.ts';` — node --test handles `.ts` via the existing `tsx`/`@types/node` setup; if not, use `node --import tsx --test tests/lib/catalog.test.mjs` (verified in tasks T6).
- Structure: one `describe`-style top-level block (using `test` as the grouping primitive — `node:test` does not have nested `describe`, so use labeled sub-blocks with `test(name, ...)`).

### 5.2 Test data sharing

- Load the adapter once at module scope (it is a frozen object; the
  first import triggers the AJV validation and the JSON read; a
  second import reuses the cache).
- No `beforeAll` is strictly needed because the module is loaded
  synchronously on first import. The negative test uses a separate
  dynamic `import()` inside its own block to load a different module
  instance with a poisoned fixture.

### 5.3 The 16 assertions (matching spec section "Requirement: catalog-adapter: tests")

| # | Assertion | Source |
|---|-----------|--------|
| 1 | `adapter.items.length === 681` | post-dedup count |
| 2 | `adapter.duplicates` deep-equals `['1790I','216I','212I','217I','474I','1993I']` | spec |
| 3 | `adapter.categories.length === 21` | derived count |
| 4 | `adapter.serviceCategories.length === 10` | derived count |
| 5 | `adapter.families.length === 666` | raw count |
| 6 | `adapter.getItem('LA1071').sku === 'LA1071'` | first-wins dedup |
| 7 | `adapter.getItem('NOTFOUND') === undefined` | negative lookup |
| 8 | `adapter.itemsByCategory('MAQUINAS').length === 31` | spec |
| 9 | `adapter.itemsByType('machinery').length === 31` | spec |
| 10 | `adapter.itemsByType('spare_part').length === 98` | spec |
| 11 | `adapter.itemsByType('simple_product').length === 552` | spec (post-dedup) |
| 12 | `adapter.countByType().machinery === 31` | spec |
| 13 | `adapter.getCategory('MAQUINAS').code === 'MAQUINAS'` | spec |
| 14 | `adapter.getCategory('SERVICIOS') === undefined` | orphan-code handling |
| 15 | `adapter.getCategoryBySlug('maquinas').code === 'MAQUINAS'` | spec |
| 16 | for every `c` in `adapter.categories`, `c.items` is sorted by `display_name` ascending | spec |

### 5.4 Negative test (AJV failure path)

Approach: write a throwaway fixture file at
`tests/fixtures/malformed-catalog.json` containing an object that
fails the schema (e.g. a `service_catalog` entry missing the
required `service_code` field). Then dynamically import a SECOND
adapter instance via a thin wrapper module
`tests/lib/catalog-with-bad-fixture.mjs` that points to the bad
file. Assert the import throws an Error whose message matches
`/Catalog schema mismatch:/` and contains an AJV path. The wrapper
and the fixture are deleted in a `test.afterAll` (or in the file's
top-level finally block) so the working tree is clean after the
test run.

Why a second module instance: the real adapter is loaded once and
frozen. Re-importing with a different fixture requires a separate
loader. The wrapper module imports `loadSchema/loadCatalog` and
re-runs the same AJV+derive pipeline; the throwaway nature keeps
the test self-contained.

### 5.5 Run command

```
npm test
```

(equivalent to `node --test` from the project root).

---

## 6. Build Integration

### 6.1 No astro.config changes

`astro.config.mjs` is `export default defineConfig({ output: 'static' });` (verified). The new adapter is imported transitively through `src/data/catalog.ts` (shim), which is already imported by 4 pages. `astro build` already invokes the module graph at build time, so AJV validation runs on every build with no config change.

### 6.2 No new dependencies

`ajv@^8.20.0` is already in `package.json` (added in `feat/catalog-robust-v2-base`). `node --test` is already configured. No other deps needed.

### 6.3 Build output verification

After slice 1, `npx astro build` MUST produce:

| Path | Count | Why |
|------|-------|-----|
| `dist/catalogo/<slug>/index.html` | 21 | `getStaticPaths` in `src/pages/catalogo/[slug].astro` reads `categories` from the shim; 21 unique `category_code` values have items (the 22nd `category_dictionary` key, `SERVICIOS`, has zero items and is skipped — matches spec test 14). |
| `dist/productos/<category>/<reference>/index.html` | 681 | `getStaticPaths` in `src/pages/productos/[category]/[reference].astro` reads `products` from the shim; 681 = 687 raw - 6 dups. |
| `dist/api/catalogs/catalogo-de-productos/catalog.json` | 1 | Existing endpoint at `src/pages/api/catalogs/[slug]/catalog.json.ts` (unchanged, reads from `catalog-source.ts`). |
| `dist/api/catalogs/catalogo-de-productos/schema.json` | 1 | Existing endpoint at `src/pages/api/catalogs/[slug]/schema.json.ts` (unchanged). |

Open decision: the proposal flags a discrepancy between the spec
("22 category pages") and the v2 data ("21 unique category_code
values"). This is surfaced in `next_recommended` for PM sign-off;
the design is built to the v2 data, not the legacy criterion.

### 6.4 Existing pages remain functional

`src/pages/index.astro`, `src/pages/catalogo/index.astro`,
`src/pages/catalogo/[slug].astro`,
`src/pages/productos/[category]/[reference].astro` all import
`{ categories }` and/or `{ products }` from `'../data/catalog'`.
The shim + the backward-compat aliases on `adapter.categories`
preserve every field these pages read (verified by grep: 25
`category.title` / `category.products` / `product.internal_reference`
/ `product.category` references across the 4 pages).

---

## 7. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Type drift between `src/lib/catalog.ts` and `src/data/catalog-client.ts` | All shared types are imported from `catalog-client.ts` (CatalogItem, Money, Status, ItemAssets, ItemSearch, ServiceProfile, JSONSchema). A JSON shape change in catalog-client surfaces as a TypeScript error in catalog.ts, not a runtime crash. AJV config in both files is `{allErrors: true, strict: false}` (identical literal). |
| AJV `strict: false` masking real schema issues | Mirrored exactly from `src/data/catalog-client.ts:191-195`. The v2 schema is hand-written and contains `additionalProperties: false` constraints where needed; `strict: false` only silences AJV's strict-mode warnings (e.g. unknown keywords), not validation. Tests assert the 16 spec invariants on top of validation. |
| Fail-fast on import breaks `astro dev` (HMR) | The validation only re-runs when the module graph is invalidated. The JSON+schema are static files; HMR rarely re-imports the adapter. If it does, a 2-second re-validation is acceptable. The fail-fast is preferable to silently shipping bad data. |
| Legacy `tests/catalog.test.mjs` (v1 snapshot) conflicts with adapter tests | Explicit task T7: delete `tests/catalog.test.mjs` in the same PR. The new `tests/lib/catalog.test.mjs` is the active contract. The old test asserted `total_products: 683` and 6 raw duplicates from the v1 JSON — both facts are no longer source of truth. |
| `.env.example` accidentally committed with real WhatsApp numbers | Header comment explicitly marks the example as "placeholders only". Empty default for `PUBLIC_WHATSAPP_NUMBERS`. `.gitignore` already excludes `.env`. Pre-commit reminder in T10 commit message. |
| Shim's literal `categories` (from `adapter`) breaks pages that use `category.title` / `category.products[]` | Backward-compat aliases on `CategorySummary` (see 2.5): `title` = `label`, `products` = `items.map(toLegacyProduct)`. Computed once at load, frozen. No change to spec core shape. |
| 21 vs 22 category pages discrepancy (proposal risk) | Surfaced in `next_recommended` for PM. Design builds to 21 (the count of unique `category_code` values in v2 items). Reverting to 22 would require inventing items for the `SERVICIOS` orphan code — out of scope for slice 1. |
| 681 vs 687 product pages discrepancy (proposal risk) | Surfaced in `next_recommended` for PM. Design dedups by sku (first wins), per spec. Reverting to 687 would require either (a) re-injecting the duplicates with a different identity or (b) changing `getItem` to "last wins" — both out of scope. |
| AJV error path format mismatch between adapter and runtime client | Adapter uses `${e.instancePath || '<root>'}: ${e.message}` (line 217 of catalog-client.ts). Identical format in the adapter. The runtime client additionally retries with a fresh schema on mismatch; the build-time adapter does not (the schema is local, no refresh possible). |

---

## 8. Rollback Plan

One line: revert the merge commit. `src/data/catalog.ts` is restored
from git to the prior v1 JSON-loader. The new `src/lib/catalog.ts`
and `tests/lib/catalog.test.mjs` are removed; the 1-line change in
`src/pages/index.astro` is reverted; `.env.example` is removed.
`src/data/catalogo_productos.json` (the v1 source) is still on disk
and untouched. No data migration, no DB, no schema version bump.
The shim is fully reversible because `src/data/catalog.ts` becomes a
near-empty re-export (the only non-trivial file in the diff).

---

## 9. Implementation Order (input to sdd-tasks)

| Step | Action | Verification |
|------|--------|--------------|
| T1 | Write `tests/lib/catalog.test.mjs` with the 16 assertions + the negative test. | `npm test` should FAIL (red). Adapter does not exist yet. |
| T2 | Write `src/lib/catalog.ts` per section 2. | `npm test` should PASS (green) for assertions 1-16. |
| T3 | Verify `npm test` passes locally with no warnings. | All 16 + 1 negative test pass. |
| T4 | Rewrite `src/data/catalog.ts` as the 4-line shim + the 3 backward-compat exports (catalog, getCategory, getProduct). | File length <= 10 lines. No transformation logic. |
| T5 | Fix `src/pages/index.astro` line 49: `category.title` -> `category.label`. | One-line diff. |
| T6 | Run `npx astro check` (0 errors) and `npx astro build` (succeeds; produces 21 cat pages, 681 product pages, 2 API endpoints). | Build log shows expected counts. |
| T7 | Delete `tests/catalog.test.mjs` (v1 snapshot test, 15 lines, no longer the source of truth). | `npm test` no longer runs the v1 snapshot. |
| T8 | Create `.env.example` per section 4. | File exists at repo root. `.env` remains gitignored. |
| T9 | Run full verify: `npm test` + `npx astro check` + `npx astro build`. | All green. Total diff < 800 lines (verified with `git diff --stat main`). |
| T10 | Conventional commit (e.g. `feat(catalog): add v2 build-time adapter with AJV, SKU dedup, legacy shim`). No AI attribution. Push. Archive spec. | Commit message matches repo style. PR is reviewable. |

---

## 10. Open Questions

- [ ] **21 vs 22 category pages**: spec criterion says 22; v2 data has 21 unique `category_code` values with items (the 22nd `category_dictionary` key, `SERVICIOS`, has no items). PM confirmation required before merge. If 22 is required, the design must invent items for `SERVICIOS` (out of slice 1 scope).
- [ ] **681 vs 687 product pages**: spec criterion says 687; v2 has 6 raw duplicates (1790I, 216I, 212I, 217I, 474I, 1993I). The adapter dedups by sku (first wins) per spec. If 687 is required, dedup must be disabled — contradicts the spec test #1.
- [ ] **Legacy v1 snapshot test (tests/catalog.test.mjs)**: tasks T7 says "default: leave it but rename to tests/catalog-v1-snapshot.test.mjs so the new adapter test is clearly the active contract. Confirm with PM." This design assumes DELETE. If PM prefers RENAME, T7 changes accordingly.
- [ ] **`countByGroup` helper**: tasks T1 mentions it; spec does not require it. The design includes it as a non-spec helper. Acceptable; non-breaking.
- [ ] **`.env.example` PUBLIC_GA_ID**: tasks T5 includes it as optional. Design includes it commented out. Acceptable.

These are surfaced in `next_recommended` so the orchestrator can
escalate non-blocking decisions before sdd-tasks starts.

---

## 11. Artifacts Touched (summary)

| File | Status | Purpose |
|------|--------|---------|
| `src/lib/catalog.ts` | NEW | Build-time adapter. Owns AJV, dedup, derivation, helpers, legacyView. |
| `src/data/catalog.ts` | REWRITE | 4-line shim + 3 backward-compat exports. No logic. |
| `src/pages/index.astro` | MODIFY (1 line) | Line 49: `category.title` -> `category.label`. |
| `tests/lib/catalog.test.mjs` | NEW | `node:test` suite. 16 assertions + 1 negative. |
| `tests/lib/catalog-with-bad-fixture.mjs` | NEW (throwaway) | Helper for the negative test. Deleted in cleanup. |
| `tests/fixtures/malformed-catalog.json` | NEW (throwaway) | Poisoned JSON for the negative test. Deleted in cleanup. |
| `tests/catalog.test.mjs` | DELETE | v1 snapshot, no longer source of truth. |
| `.env.example` | NEW | Public env contract (PUBLIC_SITE_URL, PUBLIC_WHATSAPP_NUMBERS, PUBLIC_GA_ID). |

No changes to: `astro.config.mjs`, `package.json`, `tsconfig.json`,
`src/lib/catalog-source.ts`, `src/data/catalog-client.ts`,
`src/data/maquinaria.ts`, `src/data/catalogo_productos.json`,
`src/layouts/`, `src/components/`, API endpoints, other pages.
