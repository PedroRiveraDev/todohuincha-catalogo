# Proposal: catalog-machinery-assets-embed

Branch: `feat/catalog-robust-v2-base`
Date: 2026-06-25
Project: todohuincha-catalogo (Astro 5, output: static)

---

## 1. Why

The catalog JSON is the single source of truth for downstream automation
(PDF generation, offline preview, exports). For 14 `machinery` items with
`technical_profile_level: "extended"`, that source is currently incomplete:

- **Image** is a URL pointing to `public/products/<sku>.png`. The binary is
  not in the JSON, so any consumer that does not have access to the served
  site (offline tools, exports, programmatic generation) cannot render the
  product card.
- **PDF datasheet** is referenced by URL only (or not at all in some items).
  The binary lives in `docs/Catalogo actual\` outside the JSON, breaking
  the "single artifact" invariant the rest of the catalog follows.

Goal: make `machinery_profile.extended` items **self-contained in the
canonical JSON** — image bytes inline as base64, PDF datasheet inline as
base64, with stable hashes for reproducibility. No regression for the other
673 items, no UI changes in this slice.

## 2. What Changes

| File | Status | Summary |
|------|--------|---------|
| `docs/catalogo_productos_schema_validacion_corregido.json` | MODIFY | Add optional `data_base64` + `sha256` + `byte_size` to `asset` object. Add optional `source_pdf.storage_key` / `file_name` / `data_base64` / `sha256` / `byte_size` to `machineryProfile.source_pdf`. All additions are additive (optional, `additionalProperties: true` already permits). |
| `scripts/embed-extended-assets.mjs` | NEW | Node script (no deps). Reads canonical JSON, scans `items[].machinery_profile.technical_profile_level === "extended"`, resolves image + PDF on disk, base64-encodes, computes sha256, writes back in-place. Supports `--dry-run` (prints table, no write). Idempotent (re-running is a no-op once `data_base64` matches sha256). |
| `src/lib/catalog.ts` | MODIFY | New helper `resolveImageSrc(item): string` — returns `item.asset.data_base64` (as `data:image/png;base64,...`) if present, else `item.asset.url`, else empty string. ~10 lines, no new deps. |
| `tests/lib/catalog.test.mjs` | MODIFY | Add 5 helper tests: base64 preferred, URL fallback, both missing → empty, item without `asset`, item with malformed base64 (length 0) treated as missing. |
| `tests/scripts/embed-extended-assets.test.mjs` | NEW | Fixture of 5 items (image-only, pdf-only, both, neither, SKU 852 skip). Assert dry-run table, real run writes correct fields + sha256, idempotency (second run is no-op). |
| `package.json` | MODIFY | Add `"embed-assets": "node scripts/embed-extended-assets.mjs"` and `"embed-assets:dry": "node scripts/embed-extended-assets.mjs --dry-run"`. |

Delete: nothing.

## 3. Out of Scope

- `simple_product`, `spare_part`, and `machinery` items with
  `technical_profile_level: "standard"` — untouched.
- Compression / WebP conversion. Raw base64 (~19 MB JSON) accepted by user.
- Frontend migration. `src/pages/maquinaria/[slug].astro` (which uses
  `src/data/maquinaria.ts`, not the v2 adapter) stays as-is. No component
  in this repo currently consumes `data_base64`; that is a later slice.
- PDF download button for the embedded PDF. PDF stays URL-referenced in the
  UI; the JSON copy is for automation, not browser display.
- Resize/re-encode of the source PNGs. We embed byte-for-byte what is on
  disk today.

## 4. Capabilities

### New

- `extended-asset-embedding`: optional base64 + sha256 of image and PDF
  binaries for `machinery_profile.technical_profile_level: "extended"`
  items, surfaced via the catalog adapter. Determined by helper and
  embedded by an idempotent build-time script.

### Modified

- None. The schema change is purely additive; the helper is new. No
  existing capability's requirement changes.

## 5. Approach

1. **Schema first, additive only.** Both new fieldsets are under paths
   already covered by `additionalProperties: true` in
   `docs/catalogo_productos_schema_validacion_corregido.json`. AJV
   re-validation of the modified JSON must pass without removing anything.
2. **Helper, TDD.** `resolveImageSrc(item)` in `src/lib/catalog.ts`
   implemented in three lines (preference + fallback + empty). Tests in
   `tests/lib/catalog.test.mjs` cover all five branches before commit.
3. **Script, isolated I/O.** `scripts/embed-extended-assets.mjs` reads the
   JSON once, builds the new objects in memory, writes once at the end.
   Uses `node:fs/promises`, `node:crypto`, `node:path`. No `ajv` import in
   the script — schema validation already runs in the adapter at build.
4. **Skip rules (in script):**
   - For each candidate item: if `machinery_profile.specification_groups`
     is empty, log `[skip] sku=... reason=empty spec groups` and skip.
     Excludes SKU `852`.
   - For duplicate PDF matches (2200I): sort matches by `file_name` and
     take the first. Deterministic.
5. **Dry-run by default for reviews.** Script exits 0 without writing when
   `--dry-run` is passed; prints a table: `sku | img found | img bytes |
   pdf found | pdf bytes | status`.
6. **Two-PR split** is the operational layer on top (see section 7).

## 6. Decisions (resolved with user)

| Decision | Resolution |
|----------|------------|
| 1. PR strategy | Two chained PRs on the same branch `feat/catalog-robust-v2-base`. PR1 code-only, PR2 data-only (~17 MB). |
| 2. JSON size | 19 MB accepted. No compression. |
| 3. SKU 852 skip | Embed only if `machinery_profile.specification_groups.length > 0`. |
| 4. 2200I duplicate PDF | First match by sorted `file_name`. |
| 5. Schema strategy | Additive optional fields under `additionalProperties: true` paths. No breaking change. |
| 6. Adapter surface | New `resolveImageSrc` helper only. No other consumer in this slice. |

## 7. Two-PR Split

Both commits land on `feat/catalog-robust-v2-base`. Same integration branch,
different review surfaces.

### PR1 — `feat(embed): schema, helper, script, fixture tests`

Scope:
- Schema edits in `docs/catalogo_productos_schema_validacion_corregido.json`.
- `src/lib/catalog.ts` + 5 helper tests in `tests/lib/catalog.test.mjs`.
- `scripts/embed-extended-assets.mjs` + 5 fixture-based tests in
  `tests/scripts/embed-extended-assets.test.mjs`.
- `package.json` script entries (`embed-assets`, `embed-assets:dry`).
- Fixture JSON lives only inside `tests/scripts/fixtures/`. Not the
  canonical file.

Gates:
- `npm test` green, ≥40 tests (35 prior + 5 new).
- `npx astro check` 0 errors.
- Source diff < 800 lines. Zero binary changes.

### PR2 — `chore(data): embed extended machinery assets`

Scope:
- One run: `npm run embed-assets` against
  `docs/catalogo_productos_robusto_completo_corregido.json`.
- Commit the resulting ~17 MB diff.

Gates:
- `npm test` still green.
- `npx astro build` succeeds.
- `dist/api/catalogs/catalogo-de-productos/catalog.json` ≈ 19 MB.
- AJV validation of the JSON against the updated schema still passes
  (run via the existing build-time adapter).

The split keeps PR1 reviewable in under 10 minutes and isolates the binary
diff to a single data-only commit that gets merged with a one-line title.

## 8. Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| PR2 diff ~17 MB slows review tooling, blocks merge buttons | HIGH | Split into PR1 (code) + PR2 (data). PR1 carries zero binary. Reviewer merges PR1 with full attention, PR2 with eyeball + green CI. |
| Browser RAM peak on `JSON.parse` of 19 MB at runtime | MED | The JSON is only consumed server-side at build. The API endpoint is prerendered to a static file. No browser client parses the full 19 MB today. |
| Repo size growth ~700% (~2.15 MB → ~19 MB JSON) | MED | Accepted by user. `.gitattributes` could mark the file as `linguist-generated` to soften GitHub language stats if it matters later. |
| 2200I duplicate PDF picked non-deterministically across OS/filesystems | LOW | Sort matches by `file_name` (UTF-16 codepoint order, stable on every platform with case-sensitive compare via `Intl.Collator`). |
| SKU 852 silently dropped from the embed | LOW | Script logs `[skip] sku=852 reason=empty specification_groups` on every run, visible in `--dry-run` table. |
| Base64 encoding of already-base64 data in re-runs | LOW | Script checks `asset.data_base64` + `asset.sha256` against the freshly computed sha256 before writing. Idempotent. |
| Adapter helper called on item missing `asset` entirely | LOW | Covered by test #4 in the helper suite (returns `''`). `maquinaria/[slug].astro` not yet a caller. |

## 9. Rollback Plan

- **PR1 not yet merged:** `git revert` the commit. No data touched.
- **PR1 merged, PR2 not yet merged:** `git revert` PR1. Schema reverts,
  helper reverts, script reverts. Canonical JSON untouched. No production
  impact.
- **Both merged:** `git revert` PR2. JSON returns to its pre-embed 2.15 MB
  shape. Helper still ships and is safe to leave (returns URL fallback for
  all items that have no `data_base64`). Optionally `git revert` PR1 too
  for a clean state. No DB. No user-facing state. No migration.

## 10. Dependencies

- `node:fs/promises`, `node:crypto`, `node:path` — stdlib. No new deps.
- `ajv@^8.20.0` — already in deps; reused by the build-time adapter, not
  by the new script.
- `node --test` + `tsx` — already configured (see `package.json`).
- Source files required at runtime of the script:
  `public/products/<sku>.png`, `docs/Catalogo actual/<sku>.pdf`.
  Both already exist; verified during exploration.

## 11. Success Criteria

- [ ] `npm test` passes, ≥ 40 tests (35 prior + 5 helper + 5 script tests,
      minus any duplicated fixtures).
- [ ] `npx astro check` 0 errors after PR1.
- [ ] `npx astro build` succeeds after PR2.
- [ ] `dist/api/catalogs/catalogo-de-productos/catalog.json` exists and is
      between 18 MB and 20 MB.
- [ ] `npm run embed-assets:dry` prints a 14-row table: 13 will-embed rows
      and 1 skip row for SKU 852.
- [ ] `npm run embed-assets` (no flag) mutates the canonical JSON.
      `git status` shows a ~17 MB diff.
- [ ] Re-running `npm run embed-assets` produces zero diff.
- [ ] AJV re-validation of the modified JSON against the updated schema
      still passes (no errors, no warnings).
- [ ] `resolveImageSrc(item)` returns a `data:image/png;base64,...` string
      for embedded items, falls back to the URL for the rest, returns `''`
      for items with no asset.
- [ ] PR1 source-only diff < 800 lines. PR2 is the 17 MB JSON commit only.

## 12. Open Questions

- None for the user. Sections 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 are
  resolved. Section 5.4 (skip rules) is locked. Section 7 (PR split) is
  locked. Internal implementation choices (helper signature, fixture
  format, exact log line wording) are owned by `sdd-design`.