# Archive: catalog-machinery-assets-embed

## Date
2026-06-25

## Status
ARCHIVED - shipped in PR1 (commit 655f987) + PR2 (commit 5e2e956) on branch feat/catalog-robust-v2-base

## Summary

Slice `catalog-machinery-assets-embed` ships self-contained machinery asset delivery for the v2 catalog. Before this slice, the 14 extended machinery items (the machinery SKUs that carry `specification_groups` plus image and PDF references) pointed at on-disk binaries via URL strings; consumers had to resolve `assets.main_image.url` against `public/products/<sku>.png` and find PDFs by substring matching inside `docs/Catalogo actual/`. The slice closes that gap by base64-embedding the binaries directly into the canonical catalog JSON, so the published catalog artifact is fully self-describing and can be distributed as a single offline file.

The change delivered in two stacked PRs against `feat/catalog-robust-v2-base`. PR1 (commit 655f987, `feat(embed): schema, helper, script, fixture tests for extended machinery assets`) carried zero binary: a +36-line additive schema delta (`data_base64` on `definitions.asset` and `source_pdf` on `definitions.machineryProfile`, both AJV-compatible with the existing `additionalProperties: true` blocks), a pure read-only `resolveImageSrc(item)` helper inlined into `src/lib/catalog.ts`, an idempotent Node 22 ESM embed script (`scripts/embed-extended-assets.mjs`), 11 new TDD tests (5 helper + 6 script) raising the suite from 35 to 46, and two new `package.json` scripts (`embed-assets`, `embed-assets:dry-run`). PR2 (commit 5e2e956, `chore(data): embed extended machinery assets (~17 MB base64)`) was a one-file data commit: the embed script ran against the canonical JSON and the resulting ~17 MB binary delta was committed. The catalog JSON grew from 2.22 MB to 17.30 MB; the post-build `dist/api/catalogs/catalogo-de-productos/catalog.json` measures 18,139,605 bytes, inside the 17-21 MB spec range.

Outcome: 13 of 14 extended machinery SKUs (2202I, 2198I, 2199I, 2208I, 2205I, 2197I, 2194I, 2207I, 2200I, 2201I, 2281I, 2283I, 2280I) carry fully populated `data_base64`, `sha256`, and `byte_size` on both `assets.main_image` and `machinery_profile.source_pdf`. SKU 852 was correctly skipped (empty `specification_groups` per spec scenario "SKU 852 skipped"). SKU 2200I's two matching PDFs resolved deterministically to the smaller `file_name` by UTF-16 code-unit order. Idempotency is structurally proven: re-running `npm run embed-assets` produces byte-identical output (sha256 `E7B3F614...` stable across runs). AJV re-validated the modified JSON with 0 errors. The 673 non-extended items are untouched (zero `data_base64` fields, zero `source_pdf` blocks), preserving slice scope. The catalog landing page (slice 2) is unaffected; the WhatsApp CTA smoke check still shows 690 `wa.me/` links. No CRITICAL issues, no WARNINGs, three non-blocking suggestions deferred to future slices. Ready for archive.

## PRs

- PR1 (commit 655f987): `feat(embed): schema, helper, script, fixture tests for extended machinery assets`
  - 10 files, +1884 / -1, zero binary
  - Tests: 35 -> 46
  - All gates green
- PR2 (commit 5e2e956): `chore(data): embed extended machinery assets (~17 MB base64)`
  - 1 file, +15.08 MB binary
  - Catalog JSON: 2.22 MB -> 17.30 MB
  - Idempotent

## Files changed

PR1 (`655f987`):
- `docs/catalogo_productos_schema_validacion_corregido.json` (M, +36) - additive schema delta
- `src/lib/catalog.ts` (M, +21) - `resolveImageSrc` helper inlined per design section 3.2; T10 was a no-op
- `scripts/embed-extended-assets.mjs` (A, +189) - Node 22 ESM embed script
- `tests/lib/asset-resolver.test.mjs` (A, +47) - 5 helper tests
- `tests/scripts/embed-extended-assets.test.mjs` (A, +227) - 6 script tests including idempotency
- `package.json` (M, +2 / -1) - `embed-assets` and `embed-assets:dry-run` scripts
- `openspec/changes/catalog-machinery-assets-embed/proposal.md` (A, +199)
- `openspec/changes/catalog-machinery-assets-embed/spec.md` (A, +153)
- `openspec/changes/catalog-machinery-assets-embed/design.md` (A, +743)
- `openspec/changes/catalog-machinery-assets-embed/tasks.md` (A, +266)

PR2 (`5e2e956`):
- `docs/catalogo_productos_robusto_completo_corregido.json` (M, ~+17 MB binary embed)

Archive-time (this commit):
- `openspec/changes/catalog-machinery-assets-embed/verify-report.md` (A) - sdd-verify output
- `openspec/changes/catalog-machinery-assets-embed/archive.md` (A) - this file
- `openspec/changes/catalog-machinery-assets-embed/tasks.md` (M) - Final Status section appended
- Folder rename: `openspec/changes/catalog-machinery-assets-embed/` -> `openspec/changes-archive/catalog-machinery-assets-embed/` via `git mv`

## Capabilities delivered

- extended-asset-embedding (delta spec, 8 requirements, 17 scenarios, all PASS)

## Test results

- npm test: 46/46 passing
- npx astro check: 0 errors
- AJV validation: 0 errors
- dist/.../catalog.json: 17.30 MB (spec range 17-21 MB)

## Deviations (final list)

1. Schema +36 lines (multi-line vs compact) - AJV accepts, consistency with existing schema style
2. Idempotency test added exit-status guards - prevents false-pass when script missing
3. parseArgs accepts `--input path` and `--input=path` - child_process test compatibility
4. ROOT = process.cwd() in script - spawnSync cwd resolution in tests
5. 10 files in PR1 (not 8) - includes the 4 OpenSpec docs explicitly listed in tasks

## Rollback

- Revert PR1: `git revert 655f987` - safe, zero dependents
- Revert PR2: `git revert 5e2e956` - restores ~2.22 MB JSON, helper stays intact

## Next steps

- Slice 3: catalog detail page migration to v2 adapter (uses resolveImageSrc for image rendering)
- Final PR to main when slice 3 ships
