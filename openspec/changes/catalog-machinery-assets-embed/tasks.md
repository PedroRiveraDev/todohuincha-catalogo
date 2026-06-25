# Tasks: catalog-machinery-assets-embed

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines (PR1) | 500-600 source lines across 8 files, zero binary |
| Estimated changed lines (PR2) | ~17 MB across 1 file (`docs/catalogo_productos_robusto_completo_corregido.json`) |
| 400-line budget risk (PR1) | High naively; mitigated because PR1 is mostly new files, no binary, well below the 800-line D2 ceiling |
| 400-line budget risk (PR2) | High on absolute size; trivial on review effort (data, not logic) |
| Chained PRs recommended | Yes (per user decision 1a/2a/3B; both PRs target same branch `feat/catalog-robust-v2-base`) |
| Suggested split | PR1 (code-only) on top of branch; PR2 (data-only) on top of PR1, both merge to `feat/catalog-robust-v2-base` |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (same branch, sequential review) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema delta + `resolveImageSrc` helper + embed script + 11 new tests + `package.json` scripts | PR 1 | Base: `feat/catalog-robust-v2-base`. Zero binary. ~600 source lines. Gates: `npm test` 46/46, `npx astro check` 0 errors, dry-run table prints 13+1 rows. |
| 2 | Run `npm run embed-assets` against canonical JSON; commit the resulting diff | PR 2 | Base: PR 1 commit. One file, ~17 MB. Gates: `npm test` 46/46, `npx astro build` succeeds, `dist/.../catalog.json` is 17-21 MB, second run produces zero diff (idempotency proof). |

## 1. Setup

### T1. Verify clean working tree on `feat/catalog-robust-v2-base`

- **File(s)**: none (read-only)
- **Validation**: `git status --short` shows only `?? openspec/changes/catalog-machinery-assets-embed/` (the four new SDD files). `git branch --show-current` prints `feat/catalog-robust-v2-base`. Do NOT checkout `main`.
- **Rollback**: N/A.

### T2. Confirm test baseline (35/35 green)

- **File(s)**: none (read-only)
- **Validation**: `npm test` exits 0 with output `# pass 35`. If fewer, abort and surface the regression before any change.
- **Rollback**: N/A.

### T3. Confirm supporting directories exist; create `tests/scripts/`

- **File(s)**: `tests/scripts/` (new dir)
- **Validation**: `Test-Path tests\scripts` returns `True` after creation. `tests/lib/`, `tests/lib/__fixtures__/`, `scripts/`, `src/lib/` already exist from slice 1.
- **Rollback**: `Remove-Item tests\scripts -Recurse -Force` (empty dir).

## 2. Schema delta

### T4. Read insertion points in `docs/catalogo_productos_schema_validacion_corregido.json`

- **File(s)**: `docs/catalogo_productos_schema_validacion_corregido.json` (read-only)
- **Validation**: open the file and confirm: (a) `definitions.asset` is at lines 987-1076, `url` ends around line 1030, `storage_key` begins at line 1031; (b) `definitions.machineryProfile` ends around line 747 with `price_observations` at lines 740-745; (c) both blocks carry `"additionalProperties": true`. Cite exact line numbers in the PR description.
- **Rollback**: N/A.

### T5. Apply additive schema delta

- **File(s)**: `docs/catalogo_productos_schema_validacion_corregido.json` (MODIFY, +22 lines)
- **Content shape**:
  - Insert `data_base64` block (`type: ["string","null"]`, description string) between `url` and `storage_key` inside `definitions.asset` (design section 2.1).
  - Append `source_pdf` block (`type: ["object","null"]`, `additionalProperties: true`, with `storage_key`, `file_name`, `data_base64`, `sha256` (pattern `^[a-f0-9]{64}$`), `byte_size` (integer, minimum 0)) as the last property of `definitions.machineryProfile` (design section 2.2).
  - DO NOT remove or rename any existing property.
- **Validation**: `git diff docs/catalogo_productos_schema_validacion_corregido.json` shows only added lines, no deletions. Total diff is +22 lines exactly.
- **Rollback**: `git checkout -- docs/catalogo_productos_schema_validacion_corregido.json`.

### T6. Validate JSON parses and AJV accepts the schema

- **File(s)**: none (read-only)
- **Validation**: `node -e "JSON.parse(require('fs').readFileSync('docs/catalogo_productos_schema_validacion_corregido.json'))"` exits 0. The schema self-loads (the existing `src/lib/catalog.ts` already calls AJV at module load — `npx astro check` is the integration gate in T18).
- **Rollback**: N/A.

## 3. Adapter helper TDD - RED

### T7. Create empty test file with 5 failing assertions for `resolveImageSrc`

- **File(s)**: `tests/lib/asset-resolver.test.mjs` (NEW, ~60 lines)
- **Content shape**: imports `node:test` and `node:assert/strict`; imports `{ resolveImageSrc }` from `../../src/lib/catalog.ts` (path chosen to match slice 1's existing test import style). Five `test('...', () => { ... assert.equal(...) })` blocks: data URI preferred, URL fallback, both absent returns empty string, empty `data_base64` falls through to URL, no-assets defensive case returns empty string. Use the fixture literals from design section 3.3.
- **Validation**: `npm test -- tests/lib/asset-resolver.test.mjs` SHOULD FAIL (red): 5/5 fail with `SyntaxError: The requested module '../../src/lib/catalog.ts' does not provide an export named 'resolveImageSrc'`.
- **Rollback**: `Remove-Item tests\lib\asset-resolver.test.mjs`.

### T8. Confirm 5/5 RED on the helper suite

- **File(s)**: none (read-only)
- **Validation**: `npm test -- tests/lib/asset-resolver.test.mjs` reports `# pass 0 # fail 5` and exit code non-zero. If any test passes accidentally, the helper already exists somewhere — abort and investigate.
- **Rollback**: N/A.

## 4. Adapter helper TDD - GREEN

### T9. Add `resolveImageSrc` named export to `src/lib/catalog.ts`

- **File(s)**: `src/lib/catalog.ts` (MODIFY, +13 lines appended after line 293)
- **Content shape**: literal block from design section 3.2. Local `AssetEmbed` cast (`{ url?: string | null; data_base64?: string | null }`) on `item.assets?.main_image`. Return `data:image/png;base64,${b64}` when `b64 && b64.length > 0`, else `asset?.url ?? ""`. Pure read, no IO, no mutations. Do NOT modify the frozen `adapter` object.
- **Validation**: `npx tsc --noEmit` exits 0 (or `npx astro check` exit 0 — equivalent). `git diff src/lib/catalog.ts` shows only the appended block, no edits above line 293.
- **Rollback**: `git checkout -- src/lib/catalog.ts`.

### T10. Re-export `resolveImageSrc` from the adapter module's public surface (defensive)

- **File(s)**: `src/lib/catalog.ts` (MODIFY, +1 line)
- **Content shape**: append `export { resolveImageSrc } from './asset-resolver';` ONLY if the helper is split into `src/lib/asset-resolver.ts`. If the helper stays inline in `catalog.ts` per design section 3.2, this task is a no-op — skip and document in the PR description. Decision belongs to the apply agent based on whether T9 inlined or split.
- **Validation**: if implemented, `rg "resolveImageSrc" src/lib` shows the function defined in one file and re-exported from the other; if skipped, `rg "resolveImageSrc" src/lib` shows exactly one definition.
- **Rollback**: revert the single added line or N/A.

### T11. Confirm GREEN on the helper suite (40/40 total)

- **File(s)**: none (read-only)
- **Validation**: `npm test -- tests/lib/asset-resolver.test.mjs` exits 0 with `# pass 5`. Full `npm test` exits 0 with `# pass 40` (35 baseline + 5 helper). Total cumulative = 40.
- **Rollback**: N/A (revert T9/T10 if a test regresses).

## 5. Embed script TDD - RED

### T12. Create empty test file with 6 failing assertions for `scripts/embed-extended-assets.mjs`

- **File(s)**: `tests/scripts/embed-extended-assets.test.mjs` (NEW, ~155 lines)
- **Content shape**: imports `node:test`, `node:assert/strict`, `node:child_process` (`spawnSync`), `node:fs` (`mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync`), `node:os.tmpdir`, `node:path`, `node:crypto`, `node:url`. Six `test(...)` blocks using the fixture helpers (`makeFixture`, `writePng`, `writePdf`, `writeCatalog`, `item`, `runScript`, `withFx`) from design section 4.6. Tests in order: (1) SKU 852 empty spec groups → not modified, stderr matches `[skip] sku=852 reason=empty specification_groups`; (2) no PNG → only PDF embedded with correct sha256; (3) no PDF → only image embedded, source_pdf undefined, stderr matches `[warn] sku=... no PDF found`; (4) both → both embedded with correct sha256 + byte_size; (5) two PDF candidates → smallest filename wins (`1,5 TUPI 2200I.pdf`), stderr matches `[info] sku=2200I 2 PDFs found, using 1,5 TUPI 2200I.pdf`; (6) idempotency → run script twice, sha256 of output JSON matches. Each test wraps `withFx(...)` for temp-dir cleanup.
- **Validation**: `npm test -- tests/scripts/embed-extended-assets.test.mjs` SHOULD FAIL (red): 6/6 fail with `Error: spawnSync ... ENOENT scripts/embed-extended-assets.mjs`.
- **Rollback**: `Remove-Item tests\scripts\embed-extended-assets.test.mjs`.

### T13. Confirm 6/6 RED on the script suite

- **File(s)**: none (read-only)
- **Validation**: `npm test -- tests/scripts/embed-extended-assets.test.mjs` reports `# pass 0 # fail 6` and exit code non-zero.
- **Rollback**: N/A.

## 6. Embed script TDD - GREEN

### T14. Create `scripts/embed-extended-assets.mjs` with the design algorithm

- **File(s)**: `scripts/embed-extended-assets.mjs` (NEW, ~135 lines)
- **Content shape**: literal block from design section 4.3. Node 22 ESM, no deps. Imports `node:fs/promises`, `node:fs.existsSync`, `node:crypto.createHash`, `node:path`. `parseArgs(argv)` accepts `--input=`, `--output=`, `--dry-run`, `--verbose`. `findPdfsForSku(sku)` filters `docs/Catalogo actual/*.pdf` by `includes(sku)`, sorts with default `Array.prototype.sort()` (UTF-16 code-unit order, deterministic). `embedOne(item, verbose)` resolves image from `public/products/<sku>.png`, PDF from candidates, writes `data_base64`/`byte_size`/`sha256` on `main_image` and `machinery_profile.source_pdf` (storage_key, file_name, data_base64, sha256, byte_size). Stderr lines: `[skip] sku=<sku> reason=empty specification_groups`, `[warn] sku=<sku> img missing at <path>`, `[warn] sku=<sku> no PDF found`, `[info] sku=<sku> N PDFs found, using <first>`, `[info] reading <path>`, `[info] wrote <path>`, `[dry-run] no write performed`. `printSummaryTable(rows)` prints the 6-column table. `main()` writes `JSON.stringify(data, null, 2) + '\n'` to `outputPath` unless `--dry-run`. Top-of-file comment block: docstring pointing at `openspec/changes/catalog-machinery-assets-embed/{proposal,spec,design}.md`.
- **Validation**: `node scripts/embed-extended-assets.mjs --help 2>&1 | Select-Object -First 3` exits 1 (no `--help` flag per design section 5 — the top-of-file comment is the docs) OR runs the default dry-run path and exits 0; either is acceptable. The behavior is exercised by T15 tests, not by manual invocation here.
- **Rollback**: `Remove-Item scripts\embed-extended-assets.mjs`.

### T15. Confirm GREEN on the script suite (46/46 total)

- **File(s)**: none (read-only)
- **Validation**: `npm test -- tests/scripts/embed-extended-assets.test.mjs` exits 0 with `# pass 6`. Full `npm test` exits 0 with `# pass 46` (40 from T11 + 6 script). Total cumulative = 46.
- **Rollback**: N/A (revert T14 if any test fails).

### T16. Run dry-run against the real canonical JSON and capture the table

- **File(s)**: `docs/catalogo_productos_robusto_completo_corregido.json` (read-only)
- **Content shape**: `node scripts/embed-extended-assets.mjs --dry-run --verbose 2>&1` against the real file.
- **Validation**: stdout contains exactly 14 rows: 13 with `status=embedded` (img_found=true, pdf_found=true except for items with no PDF match), 1 with `status=skip` for SKU 852. stderr contains `[skip] sku=852 reason=empty specification_groups` and at least one `[info] sku=2200I 2 PDFs found, using 1,5 TUPI 2200I.pdf`. Capture full output for the PR description. Working tree is unchanged (`--dry-run` does not write).
- **Rollback**: N/A (no mutation).

## 7. package.json scripts

### T17. Add `embed-assets` and `embed-assets:dry-run` scripts

- **File(s)**: `package.json` (MODIFY, +2 lines under `scripts`)
- **Content shape**: append two entries (order matches design section 5):
  ```json
  "embed-assets": "node scripts/embed-extended-assets.mjs",
  "embed-assets:dry-run": "node scripts/embed-extended-assets.mjs --dry-run --verbose"
  ```
  Existing `dev`, `build`, `preview`, `test` untouched.
- **Validation**: `node -e "const p=require('./package.json'); console.log(p.scripts['embed-assets'], p.scripts['embed-assets:dry-run'])"` prints both commands. `git diff package.json` shows only the two added lines, no other changes.
- **Rollback**: `git checkout -- package.json`.

## 8. Build verify (PR1 gate)

### T18. Run `astro check` and `astro build` to confirm PR1 leaves the build green

- **File(s)**: none (read-only)
- **Validation**: `npx astro check` exits 0 with 0 errors (warnings OK). `npx astro build` exits 0. The static `dist/api/catalogs/catalogo-de-productos/catalog.json` is still ~2.15 MB (we have not run `embed-assets` yet — this is the pre-embed size, which proves PR1 carries zero binary). Confirm with `(Get-Item dist\api\catalogs\catalogo-de-productos\catalog.json).Length` returning ~2,200,000 bytes (rough tolerance ±10%).
- **Rollback**: N/A (no mutation).

## 9. Commit PR1

### T19. Stage only the intended PR1 files

- **File(s)**: `git add` on the 8 files (NO others):
  - `docs/catalogo_productos_schema_validacion_corregido.json` (M, +22)
  - `src/lib/catalog.ts` (M, +13 or +14 with re-export)
  - `tests/lib/asset-resolver.test.mjs` (A, ~60)
  - `scripts/embed-extended-assets.mjs` (A, ~135)
  - `tests/scripts/embed-extended-assets.test.mjs` (A, ~155)
  - `package.json` (M, +2)
  - `openspec/changes/catalog-machinery-assets-embed/{proposal,spec,design,tasks}.md` (A, ~1500 — already on disk from earlier phases)
- **Validation**: `git status --short` after `git add` shows exactly 8 paths with `M ` or `A ` prefixes. NO `docs/catalogo_productos_robusto_completo_corregido.json` (the canonical JSON must NOT appear in PR1 — it is PR2's payload). `git diff --cached --stat` totals +500-700 lines, zero binary files.
- **Rollback**: `git reset HEAD`.

### T20. Commit PR1 with conventional message

- **File(s)**: none (git command)
- **Content shape** (no AI attribution, no emoji, no section symbol):
  - Subject: `feat(embed): schema, helper, script, fixture tests for extended machinery assets`
  - Body (one paragraph): schema delta adds `data_base64` on `asset` and `source_pdf` on `machineryProfile` (additive, AJV-compatible); `resolveImageSrc` helper prefers base64 over URL with empty-string fallback; idempotent `scripts/embed-extended-assets.mjs` walks the 14 extended items, base64-encodes PNG + PDF, writes sha256 + byte_size, skips empty spec groups, picks smallest `file_name` for duplicate PDFs; 11 new TDD tests (5 helper + 6 script) bring total to 46; `package.json` exposes `embed-assets` and `embed-assets:dry-run`.
  - Refs: `openspec/changes/catalog-machinery-assets-embed/`.
- **Validation**: `git log -1 --format=%s` prints the subject exactly. `git log -1 --format=%b` does NOT contain `Co-Authored-By`, `🤖`, or `§`. `git diff HEAD~1 --stat` shows ~500-700 source lines added, zero binary.
- **Rollback**: `git reset --soft HEAD~1` then `git restore --staged .`.

### T21. Push PR1 to `feat/catalog-robust-v2-base`

- **File(s)**: none (git command)
- **Validation**: `git push origin feat/catalog-robust-v2-base` exits 0. `git log origin/feat/catalog-robust-v2-base --oneline -1` shows the new commit on the remote.
- **Rollback**: `git push origin :feat/catalog-robust-v2-base` only if no PR is open (destructive).

## 10. PR1 verify checkpoint

### T22. STOP. Report PR1 state and wait for user OK before PR2

- **File(s)**: none (human checkpoint)
- **Content shape**: report (a) commit SHA, (b) files changed with `git show --stat HEAD`, (c) line count `git diff --stat HEAD~1..HEAD | tail -1`, (d) test count `# pass 46 # fail 0`, (e) `dist/.../catalog.json` size (must still be ~2.15 MB), (f) dry-run output excerpt showing 13 embed rows + 1 skip row for SKU 852 + 1 info line for SKU 2200I.
- **Validation**: user replies "go" or equivalent. NO automatic progression.
- **Rollback**: N/A.

## 11. Embed data - PR2

### T23. Run `npm run embed-assets` against the real canonical JSON

- **File(s)**: `docs/catalogo_productos_robusto_completo_corregido.json` (MODIFY, ~17 MB added)
- **Content shape**: `npm run embed-assets` reads the JSON once, walks all 14 extended items, inlines PNG + PDF where available, writes back in place. Stderr logs one `[skip]` for SKU 852 and one `[info]` for SKU 2200I duplicates.
- **Validation**: process exits 0. stderr contains `[info] wrote <path>`. `git status --short` now shows `M  docs/catalogo_productos_robusto_completo_corregido.json` with a ~17 MB diff (`git diff --stat` shows ~17,000,000 bytes for that file).
- **Rollback**: `git checkout -- docs/catalogo_productos_robusto_completo_corregido.json` (binary-safe restore from last commit).

### T24. Validate the modified JSON parses

- **File(s)**: none (read-only)
- **Validation**: `node -e "JSON.parse(require('fs').readFileSync('docs/catalogo_productos_robusto_completo_corregido.json'))"` exits 0. The object shape unchanged (top-level keys: `schema_version`, `catalog`, `catalog_assets`, `catalog_generation`, `dictionary_version`, `dictionaries`, `families`, `items`). Item count unchanged (681 post-dedup).
- **Rollback**: N/A (no mutation).

### T25. Run `astro check` and `astro build`; confirm dist catalog is 17-21 MB

- **File(s)**: none (read-only)
- **Validation**: `npx astro check` exits 0 (AJV validates the modified JSON against the updated schema; zero errors). `npx astro build` exits 0. `(Get-Item dist\api\catalogs\catalogo-de-productos\catalog.json).Length` is between 17,000,000 and 21,000,000 bytes (spec range). Build log shows no AJV validation errors. Per spec "out of range non-fatal" scenario: if size is outside the range, build still exits 0 but logs the out-of-range value.
- **Rollback**: revert the canonical JSON (T23 rollback) and re-run the build.

### T26. Run full test suite as final gate

- **File(s)**: none (read-only)
- **Validation**: `npm test` exits 0 with `# pass 46 # fail 0`. The new test #6 (idempotency) provides structural evidence that the script is byte-stable.
- **Rollback**: N/A.

### T27. Idempotency proof + stage + commit + push PR2

- **File(s)**: `docs/catalogo_productos_robusto_completo_corregido.json` (stage only this file)
- **Content shape**: (a) run `npm run embed-assets` a SECOND time; (b) `git status --short` shows zero diff after the second run (idempotency); (c) `git add docs/catalogo_productos_robusto_completo_corregido.json`; (d) commit with subject `chore(data): embed extended machinery assets (~17 MB base64)` and body noting SKU 852 was skipped, SKU 2200I picked the smaller `file_name`, and AJV re-validation passed at build; (e) `git push origin feat/catalog-robust-v2-base`.
- **Validation**: pre-commit `git diff --cached --stat` shows exactly one file at ~17 MB. `git log -1 --format=%s` matches the subject. `git log -1 --format=%b` contains no AI attribution, no emoji, no section symbol. Post-push `git log origin/feat/catalog-robust-v2-base --oneline -2` shows PR1 commit then PR2 commit.
- **Rollback**: `git reset --soft HEAD~1` then `git restore --staged .` if pre-push; if pushed, `git revert HEAD` (single clean revert of the data commit).

## 12. Final verify

### T28. Inspect the final branch state

- **File(s)**: none (read-only)
- **Validation**: `git log --oneline -15 feat/catalog-robust-v2-base` confirms (a) 2 new commits at the top (PR1 + PR2), (b) all prior slice commits intact (slice 1 `a54b8a7`, slice 2 `c849821`, drift fix `64c67c6`, archive `2eb9661`, slice 2 verify `1b701bd`), (c) branch is ahead of `main` by the expected N commits. `git log --oneline main..feat/catalog-robust-v2-base` enumerates the slice commits only. `npm test` still 46/46 green. `npx astro check` still 0 errors.
- **Rollback**: N/A (read-only audit).

## Rollback

- **Revert PR1**: `git revert <pr1-commit-sha>` — safe, zero dependents (no consumer of `resolveImageSrc` exists in this slice; `src/pages/maquinaria/[slug].astro` is out of scope per proposal section 3).
- **Revert PR2**: `git revert <pr2-commit-sha>` — reverts the ~17 MB embed in one commit. After revert, the canonical JSON returns to its pre-embed ~2.15 MB shape. The helper still ships and is safe to leave (returns URL fallback for all items lacking `data_base64`). Re-running `npm run embed-assets` re-generates the embed deterministically.
- **Re-run embed**: `npm run embed-assets` is idempotent. Re-running after a partial state produces the same final JSON (sha256 stable, see design section 4.4).
- **Full revert to pre-slice**: `git revert <pr2-sha>` then `git revert <pr1-sha>` (two clean commits, history preserved, no force-push needed).

## Handoff notes for apply agent

1. **T7-T11 RED-then-GREEN is mandatory.** Do not skip T8 or T11; the skill's TDD discipline exists to catch contract drift. If T8 shows anything other than 5/5 fail, stop and investigate.
2. **T12-T15 same discipline.** Six RED in T13, six GREEN in T15. Total suite grows from 35 to 46 across the two cycles.
3. **T10 is conditional.** If T9 inlines the helper in `catalog.ts` (design section 3.2), T10 is a no-op. If T9 splits into `src/lib/asset-resolver.ts`, T10 is one re-export line. The apply agent decides based on diff size.
4. **T16 dry-run output goes into the PR description.** Capture the 14-row table excerpt verbatim. Reviewers skim the table.
5. **T22 is a hard stop.** Do not auto-progress to PR2. The user reviews PR1 first; if PR1 is rejected, PR2 never opens.
6. **T27 idempotency proof is the structural reviewer check.** The second `npm run embed-assets` must produce zero `git diff`. If it produces any diff, abort — there is a non-determinism bug in the script.
7. **No dev server.** Per the repo rule (AGENTS.md), do not run `astro dev` at any point. The user starts their own dev server for manual smoke checks.
8. **Conventional commits only.** No `Co-Authored-By`, no AI attribution, no emoji, no `§`.