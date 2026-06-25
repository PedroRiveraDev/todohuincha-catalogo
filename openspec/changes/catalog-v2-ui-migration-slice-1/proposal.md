# Proposal: catalog-v2-ui-migration-slice-1

## Why

`src/data/catalog.ts` reads a stale v1 JSON. The authoritative data is a
schema-validated v2 model (687 items, 666 families, 10 services) at
`docs/catalogo_productos_robusto_completo_corregido.json`. No contract
ensures the JSON matches its schema, no queryable helper exists, and 6
duplicate SKUs are not deduplicated. Slice 1 adds a build-time AJV adapter
plus a thin shim that preserves page imports. No UI.

## What Changes

| File | Status | Summary |
|------|--------|---------|
| `src/lib/catalog.ts` | NEW | Build-time adapter. AJV-validates v2 JSON. Exposes `items`, `families`, `serviceCatalog`, `categories` (grouped on `category_code`). Dedups by `sku`. Helpers: `getCategory`, `getItem`, `getFamilyByKey`, `itemsByCategory/Family/Type`, `countByType/Group`. Exposes `legacyView` (v1). Reuses types from `catalog-client.ts`. |
| `src/data/catalog.ts` | REWRITE | ≤10-line re-export shim of `legacyView`. Re-exports `categories`, `products`, `catalog`, `getCategory`, `getProduct`. |
| `src/pages/index.astro` | 1 LINE | `category.title` → `category.label`. |
| `tests/lib/catalog.test.mjs` | NEW | `node:test`: AJV, counts 681/666/10 (post-dedup), dedup, `S.CIRCULARES`=101, `countByType`=552/98/31. |
| `.env.example` | NEW | `PUBLIC_SITE_URL`, `PUBLIC_WHATSAPP_NUMBERS`, `PUBLIC_GA_ID` (opt). |

Delete: none. `.gitignore` already covers `.env`.

## Impact

- `src/lib/catalog.ts`: new (sole owner of v2 loading + AJV).
- `src/data/catalog.ts`: rewritten shim, public API preserved.
- `src/pages/index.astro`: 1 line. Other pages unchanged.
- Build: 21 cat pages, 681 product pages, 2 API endpoints (see Risks).

## Capabilities

### New
- `catalog-adapter`: build-time data layer — loads v2 JSON, AJV, derives categories, dedups by `sku`, typed helpers.

### Modified
- None. Shim preserves the API.

## Approach

1. **Fail-fast**: validates on `import`; schema mismatch throws during `astro build`.
2. **Derive + alias**: `categories` reduced from `items` on `category_code`. `title`/`products_count` are aliases on the same object.
3. **Dedup by `sku`** (first wins) at load. **Shim**: 4-line re-export. **Tests** target the adapter, not the shim.

## Decisions (resolved with user)

| Decision | Resolution |
|----------|------------|
| Build produces 21 cat pages (not 22). The 22nd `category_dictionary` key `SERVICIOS` is orphan (zero items). | Confirmed. Adapter skips orphan codes; build emits 21. |
| Build produces 681 product pages (not 687). 6 duplicate SKUs dedup at load. | Confirmed. First occurrence wins; duplicates array exported for diagnostics. |

## Risks

| Risk | Mitigation |
|------|------------|
| Type drift between adapter and `catalog-client.ts` | Reuse `catalog-client.ts` types; do not redefine |

## Rollback Plan

Revert the merge commit. `src/data/catalog.ts` restores its v1 from git.
The new files and the 1-line `index.astro` change are removed. No DB.

## Dependencies

`ajv@^8.20.0` already in deps. `node --test` configured. `catalog-source.ts` pre-existing. No new deps.

## Success Criteria

- [ ] `npm run test` passes (adapter suite, 17/17)
- [ ] `npx astro check` 0 errors
- [ ] `npx astro build` completes (21 cat pages, 681 product pages, 2 API endpoints)
- [ ] AJV throws on schema mismatch (malformed-JSON test)
- [ ] `src/data/catalog.ts` is a thin shim with no transformation logic (mapping lives in adapter)
- [ ] Source-only diff under 800 lines
- [ ] 6 dup SKUs collapse via `getItem(sku)`
