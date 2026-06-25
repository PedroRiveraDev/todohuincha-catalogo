# Delta Spec: catalog-adapter

> Slice 1 of `catalog-v2-ui-migration`. Adds the `catalog-adapter` capability.
> All sections are ADDED because the capability is new and has no prior
> behavior to modify.

## ADDED Requirements

### Requirement: catalog-adapter: data load and validate

The system MUST load `docs/catalogo_productos_robusto_completo_corregido.json` and its schema at build time, validate the JSON against the schema with AJV using `strict: false`, and throw a clear build-time error on mismatch. The error MUST include the AJV error path and message.

#### Scenario: valid catalog JSON

- WHEN `astro build` runs against JSON that matches the schema
- THEN the adapter exports the parsed catalog

#### Scenario: invalid catalog JSON

- WHEN `astro build` runs against JSON that does not match the schema
- THEN the build fails with a message containing the AJV error path and message

### Requirement: catalog-adapter: SKU deduplication

The adapter MUST deduplicate `items` by `sku`, keeping the first occurrence, and MUST export the duplicate SKUs in order of first appearance for diagnostics. For the current catalog the post-dedup `items` length is 681; duplicates are `1790I`, `216I`, `212I`, `217I`, `474I`, `1993I`.

#### Scenario: 6 known duplicates collapse

- WHEN the adapter loads the current catalog JSON
- THEN `items` has 681 entries
- AND the diagnostics array equals `['1790I','216I','212I','217I','474I','1993I']`

### Requirement: catalog-adapter: derived collections

The adapter MUST expose, computed from the validated JSON:

- `items`: 681 unique items, shape `CatalogItem`
- `families`: 666 entries from `families[]`
- `categories`: 21 summaries derived from `items[]` (one per `category_code` with at least one item); each entry has `code`, `label`, `slug`, `group`, `products_count`, and `items[]` sorted alphabetically by `display_name`
- `serviceCategories`: 10 entries derived from `service_catalog[]`; each has `service_code`, `service_name`, `pricing_mode`, `is_schedulable`, `requires_diagnosis`, `capabilities[]`

#### Scenario: collections are stable

- WHEN `getStaticPaths` consumes any derived array
- THEN the result is deterministic and matches the documented size

### Requirement: catalog-adapter: lookup helpers

The adapter MUST expose `getCategory(code)`, `getCategoryBySlug(slug)`, `getItem(sku)`, `getFamilyByKey(family_key)`, `itemsByCategory(code)`, `itemsByFamily(family_key)`, `itemsByType(itemType)` where `itemType` is `simple_product` | `spare_part` | `machinery`, and `countByType()` returning `Record<string, number>`. All helpers MUST operate on the post-dedup `items` array.

#### Scenario: helpers return correct subsets

- WHEN calling `itemsByCategory('MAQUINAS')` on the current catalog
- THEN the result has 31 items

### Requirement: catalog-adapter: legacy view (shim)

The system MUST preserve the v1 public API through a re-export shim at `src/data/catalog.ts`. The shim MUST expose a `legacyView` with v1-shape fields aliased to v2 fields: `categories[]` as `{ title, slug, products_count, products: [] }`; `products[]` as `{ internal_reference, name, sale_price, category: { title, slug } }`. The shim file MUST contain no mapping logic; it only re-exports `legacyView` from the adapter.

#### Scenario: existing pages work without changes

- WHEN `src/pages/index.astro` imports `{ categories }` from `src/data/catalog`
- THEN each item exposes `title`, `slug`, `products_count`, `products`
- AND rendering of `category.title` works unchanged

### Requirement: catalog-adapter: env contract

The system MUST document the public env contract in `.env.example` at the repo root. Required keys: `PUBLIC_WHATSAPP_NUMBERS` (comma-separated `key:value` pairs, e.g. `sales:+56912345678,repuestos:+56912345679,machinery:+56912345680`; default empty string) and `PUBLIC_SITE_URL` (full origin URL; default `http://localhost:4322`). `.env` MUST remain excluded from version control via `.gitignore`.

#### Scenario: env.example committed

- WHEN the slice is merged
- THEN `.env.example` exists at the repo root with both keys documented
- AND `.env` is in `.gitignore`

### Requirement: catalog-adapter: tests (TDD)

The system MUST include tests at `tests/lib/catalog.test.mjs` using `node:test` and `node:assert/strict`. The suite MUST assert: (1) `items.length === 681`; (2) `duplicates === ['1790I','216I','212I','217I','474I','1993I']`; (3) `categories.length === 21`; (4) `serviceCategories.length === 10`; (5) `families.length === 666`; (6) `getItem('LA1071').sku === 'LA1071'`; (7) `getItem('NOTFOUND') === undefined`; (8) `itemsByCategory('MAQUINAS').length === 31`; (9) `itemsByType('machinery').length === 31`; (10) `itemsByType('spare_part').length === 98`; (11) `itemsByType('simple_product').length === 552`; (12) `countByType().machinery === 31`; (13) `getCategory('MAQUINAS').code === 'MAQUINAS'`; (14) `getCategory('SERVICIOS') === undefined`; (15) `getCategoryBySlug('maquinas').code === 'MAQUINAS'`; (16) each `legacyCategory.title` aliases its `label` (backward compatibility); (17) items inside each `categories` entry are alphabetically sorted by `display_name`. Plus (18) a negative test that loads a malformed JSON fixture and asserts the AJV validation throws with a message matching `Catalog schema mismatch:`.

#### Scenario: test suite passes

- WHEN `node --test tests/lib/catalog.test.mjs` runs
- THEN all 18 assertions pass