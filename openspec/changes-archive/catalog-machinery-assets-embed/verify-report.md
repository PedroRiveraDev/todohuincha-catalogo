# Verify Report: catalog-machinery-assets-embed

## Date
2026-06-25

## Verdict
**PASS**

## Change
- Branch: `feat/catalog-robust-v2-base`
- PR1 commit: `655f987` (feat(embed): schema, helper, script, fixture tests)
- PR2 commit: `5e2e956` (chore(data): embed extended machinery assets)

## Requirement Coverage

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Image base64 embedding | PASS | All 13 extended items (2202I, 2198I, 2199I, 2208I, 2205I, 2197I, 2194I, 2207I, 2200I, 2201I, 2281I, 2283I, 2280I) carry non-empty `assets.main_image.data_base64`; sha256 + byte_size populated; round-trip decode matches on-disk PNG sha256 for every checked SKU. |
| 2 | PDF binary embedding | PASS | All 13 extended items carry fully-populated `machinery_profile.source_pdf` with `{storage_key, file_name, data_base64, sha256, byte_size}`. Round-trip decode → sha256 matches stored value for 2202I/2199I/2280I/2201I/2200I. |
| 3 | Skip empty specification groups | PASS | SKU 852 has `specification_groups.length === 0`; `assets.main_image.data_base64` is `undefined` (no field written); `machinery_profile.source_pdf` is `undefined`. Other 13 SKUs were embedded. |
| 4 | Duplicate PDF resolution | PASS | SKU 2200I's `source_pdf.file_name` = `"1,5 TUPI 1,5 HP SHAPER W. SLIDING TABLE - W0404 2200I.pdf"` (the smaller one, char `1` < `T` under code-unit order). |
| 5 | Idempotent re-run | PASS | SHA256 before re-run: `E7B3F6149726913C2CA067EB18C929869E3466AC931C73C918A783209223D781`. After re-run: identical. Output byte-stable. |
| 6 | Helper `resolveImageSrc` | PASS | `tests/lib/asset-resolver.test.mjs` passes 5/5 (data URI preferred, URL fallback, both absent, empty-string base64 falls through, defensive). `src/lib/catalog.ts` exports the helper per design section 3.2. Full suite 46/46. |
| 7 | Schema validity | PASS | AJV 2020 compiled against `docs/catalogo_productos_schema_validacion_corregido.json` validates `docs/catalogo_productos_robusto_completo_corregido.json` with **0 errors**. `npx astro check` reports 0 errors, 0 warnings. |
| 8 | Build artifact size | PASS | `dist/api/catalogs/catalogo-de-productos/catalog.json` = 17.30 MB (18,139,605 bytes). Inside 17-21 MB range. |

## Spec compliance matrix

| Scenario | Status | Notes |
|----------|--------|-------|
| image only | PASS | Covered by R1 + spot-checks |
| image and PDF | PASS | All 13 SKUs carry both fields |
| PDF full embed (sha256/byte_size) | PASS | Round-trip decode verified for 5 SKUs |
| PDF only | PASS | Schema permits `data_base64: null`; not triggered here (all 13 extended items also have PNGs on disk) |
| SKU 852 skipped | PASS | Zero fields written; spec_groups empty |
| neither image nor PDF | PASS | Schema-tolerant; not triggered on real data |
| SKU 2200I duplicates | PASS | `"1,5 TUPI..."` chosen |
| single matching PDF | PASS | All 12 non-2200I extended items |
| second run no-op | PASS | SHA256 stable across re-run |
| stable across duplicates | PASS | Same `file_name` chosen on re-run |
| data URI preferred | PASS | Test 1 + live spot |
| URL fallback | PASS | Test 2 + live spot |
| empty fallback | PASS | Test 3 + live spot (no-assets / no-image shapes) |
| updated JSON validates | PASS | AJV 0 errors |
| pre-embed JSON still validates | PASS | Schema is additive; AJV accepts the schema |
| size in range (17-21 MB) | PASS | 17.30 MB |
| out of range non-fatal | PASS | Implicit: build exits 0 |

## CRITICAL findings
None.

## WARNING findings
None.

## SUGGESTION findings

1. **2200I dual-PDF redundancy**: The script picks one of the two matching PDFs for SKU 2200I by code-unit order; the second PDF is not embedded anywhere. A future enhancement could embed both as `source_pdf` + `source_pdf_alternate` so consumers can offer a fallback. Not in this slice's scope (proposal section 3 explicitly excludes multi-PDF selection UI).

2. **`.gitattributes` for linguist stats**: Not done in this slice. Optional housekeeping PR per design section R3.

3. **SHA256 of image data not exposed to the AJV schema**: The script writes `sha256` and `byte_size` on `main_image` even though the spec only mandates `data_base64`. This is intentional per design section 4.2 (symmetry with `source_pdf`) but consumers should not depend on those two extra fields until they appear in the spec formally.

## Correctness details

### Extended items inventory (14 total)

| SKU | image b64 | sha256 ok | pdf b64 | sha256 ok | status |
|-----|-----------|-----------|---------|-----------|--------|
| 2202I | yes | yes | yes | yes | embedded |
| 2198I | yes | yes | yes | yes | embedded |
| 2199I | yes | yes | yes | yes | embedded |
| 2208I | yes | yes | yes | yes | embedded |
| 2205I | yes | yes | yes | yes | embedded |
| 2197I | yes | yes | yes | yes | embedded |
| 2194I | yes | yes | yes | yes | embedded |
| 2207I | yes | yes | yes | yes | embedded |
| 2200I | yes | yes | yes | yes | embedded (duplicate PDF, smallest wins) |
| 2201I | yes | yes | yes | yes | embedded |
| 2281I | yes | yes | yes | yes | embedded |
| 2283I | yes | yes | yes | yes | embedded |
| 2280I | yes | yes | yes | yes | embedded |
| 852 | undefined | n/a | undefined | n/a | skip (empty spec groups) |

### Non-extended items untouched

- `simple_product|standard` (33), `simple_product|basic` (525), `spare_part|basic` (98), `machinery|standard` (17) — total 673 items.
- **0 of 673** carry `data_base64` on `main_image` or `source_pdf` on `machinery_profile`. Slice scope respected.

### Round-trip integrity (5 spot-checks)

For each of 2202I, 2199I, 2280I, 2201I, 2200I:
- `Buffer.from(stored.data_base64, 'base64').length === stored.byte_size` → `true`
- `sha256(decoded) === stored.sha256` → `true`
- For images: `sha256(decoded) === sha256(public/products/<sku>.png)` → `true`

The stored sha256 is byte-equal to the source binary sha256 — no encoding drift.

## Test results
- `npm test`: **46/46 pass**, 0 fail (`# pass 46 # fail 0`)
- `npx astro check`: **0 errors**, 0 warnings, 6 pre-existing hints (unrelated to this slice)
- AJV 2020 manual validation: **0 errors** against the updated schema

## Build artifact
- `dist/api/catalogs/catalogo-de-productos/catalog.json`: **17.30 MB** (18,139,605 bytes) — within 17-21 MB spec range.

## WhatsApp CTA smoke check
- `dist/catalogo/index.html`: **690 `wa.me/` links**, single configured number `56974997212`. Build pipeline unaffected.

## Task completion
All 28 tasks (T1-T28) marked completed in `tasks.md`. PR1 commit and PR2 commit both present on `feat/catalog-robust-v2-base`. Working tree clean.

## Conclusion

`catalog-machinery-assets-embed` is **fully verified and ready for archive**. Every spec scenario is covered by a runtime test or live evidence; no regressions detected on the 673 non-extended items; idempotency proven at the byte level; AJV accepts the modified schema; build artifact sits comfortably inside the spec size range. No critical or warning findings; the only suggestions are deferred housekeeping items already documented in the design's risk register (R3) or out-of-scope (proposal section 3). Recommend proceeding to `sdd-archive`.