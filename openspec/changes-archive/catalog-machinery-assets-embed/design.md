# Design: catalog-machinery-assets-embed

> Technical design for the `extended-asset-embedding` capability introduced
> by `catalog-machinery-assets-embed`. Scope: schema delta for additive
> optional fields, a 4-line pure helper for image-src resolution, and an
> idempotent build-time script that inlines PNG + PDF binaries into the
> canonical JSON for the 14 `machinery_profile.technical_profile_level:
> "extended"` items. No frontend consumers in this slice; this slice
> prepares the data layer.

## 1. Context Recap

The v2 canonical JSON at
`docs/catalogo_productos_robusto_completo_corregido.json` is the
single source of truth for downstream automation. For 14 `machinery`
items with `technical_profile_level: "extended"`, that source is
incomplete: the image is a URL to `public/products/<sku>.png` and
the PDF datasheet is URL-only (or absent). The binaries live on
disk in `public/products/` and `docs/Catalogo actual/`, breaking
the "single artifact" invariant the rest of the catalog follows.

Three user decisions frame this slice:

1. **Two-PR split** chained on `feat/catalog-robust-v2-base`. PR1
   code-only with zero binary; PR2 data-only with one ~17 MB JSON
   diff. No sub-branches.
2. **19 MB JSON is acceptable.** No compression, byte-for-byte embed.
3. **SKU 852 skipped via `specification_groups.length > 0` rule.**
   SKU 852 has `extended` but empty spec groups (verified in 4.5).
   For SKU 2200I (two matching PDFs), the smaller `file_name` under
   code-unit order wins. Both rules are deterministic across OS.

This slice fits on top of the frozen v2 adapter from slice 1
(`src/lib/catalog.ts`, 293 lines). Slice 1 froze the **behavior** of
the adapter (AJV, dedup, derived collections, frozen `adapter`
object). This slice adds one **new named export** (`resolveImageSrc`)
without modifying the frozen surface. The adapter remains the
single owner of catalog types; the helper is a sibling, not on
`adapter`.

## 2. Schema Delta

Both additions are strictly additive, under paths already covered by
`additionalProperties: true` (verified at schema lines 1075 and 746).
AJV re-validation of the modified JSON must pass without removing
anything.

### 2.1 Add `data_base64` to `definitions.asset`

Inserted between `url` (lines 1025-1030) and `storage_key` (line
1031) inside `definitions.asset` (lines 987-1076). The
`["string", "null"]` union mirrors the existing `url` typing exactly;
the script writes either a non-empty string or omits the field
entirely.

```diff
--- a/docs/catalogo_productos_schema_validacion_corregido.json
+++ b/docs/catalogo_productos_schema_validacion_corregido.json
@@ -1028,6 +1030,10 @@
         "url": {
           "type": [
             "string",
             "null"
           ]
         },
+        "data_base64": {
+          "type": ["string", "null"],
+          "description": "Base64-encoded binary of the asset file. When present, takes precedence over `url` for inlining in static output."
+        },
         "storage_key": {
           "type": [
             "string",
```

### 2.2 Add `source_pdf` to `definitions.machineryProfile`

Appended as the last property in `definitions.machineryProfile`
(lines 672-747), after `price_observations` (lines 740-745).
`additionalProperties: true` keeps it forward-compatible with future
PDF metadata (page count, author, creation date). `sha256` reuses the
existing 64-hex pattern from `dictionaryVersion.hash_sha256` at line
200.

```diff
--- a/docs/catalogo_productos_schema_validacion_corregido.json
+++ b/docs/catalogo_productos_schema_validacion_corregido.json
@@ -742,6 +746,18 @@
           "items": {
             "type": "object"
           }
         }
+        "source_pdf": {
+          "type": ["object", "null"],
+          "additionalProperties": true,
+          "properties": {
+            "storage_key": { "type": "string" },
+            "file_name": { "type": "string" },
+            "data_base64": { "type": ["string", "null"] },
+            "sha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
+            "byte_size": { "type": "integer", "minimum": 0 }
+          }
+        }
}
    },
```

## 3. Helper: `resolveImageSrc`

### 3.1 File location decision

The helper lives in `src/lib/catalog.ts` as a **new named export**,
**not** on the frozen `adapter` object.

| Option | Pros | Cons |
|--------|------|------|
| Add to frozen `adapter` object | One namespace; matches slice 1 pattern | Requires modifying the Object.freeze source; pollutes the read API |
| New named export in same file (chosen) | 4-line isolated change; trivial to revert; does not touch the frozen surface; co-located with `CatalogItem` types | One more top-level symbol |

Decision: new named export. Slice 1 froze the `adapter` **behavior**
(validation, dedup, legacyView); this slice extends the module's
public surface with a small read-only helper. The proposal already
names `src/lib/catalog.ts` as the target, so no new file.

### 3.2 Code (TypeScript, syntactically valid)

Append to `src/lib/catalog.ts` after line 293:

```typescript
/**
 * Resolve the image src for a catalog item, preferring base64 over URL.
 * Returns a `data:image/png;base64,...` URI when data_base64 is set,
 * otherwise the asset's URL, otherwise an empty string. Never null.
 * Pure read helper; safe to call at build time. No IO. No mutations.
 */
export function resolveImageSrc(item: CatalogItem): string {
  type AssetEmbed = { url?: string | null; data_base64?: string | null };
  const asset = item.assets?.main_image as AssetEmbed | null | undefined;
  const b64 = asset?.data_base64;
  if (b64 && b64.length > 0) return `data:image/png;base64,${b64}`;
  return asset?.url ?? "";
}
```

Notes:

- The local `AssetEmbed` type is intentional: `CatalogItem`'s
  `main_image` (imported from `catalog-client.ts`) does not yet
  declare `data_base64`. The cast is safe because the schema
  permits any property under `additionalProperties: true`.
- MIME is hardcoded to `image/png`. All 14 extended items have PNG
  files on disk (verified in 4.5); future non-PNG extended items
  would need MIME detection by extension (out of this slice).
- `??` over `||`: empty string `""` is a valid fallback, not to be
  re-coerced.

### 3.3 TDD test cases

File: `tests/lib/asset-resolver.test.mjs` (new). Runner: `node
--test` from `package.json` script `test`. Imports the helper
through the same `tsx` loader as the rest of the suite.

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveImageSrc } from '../../src/lib/catalog.ts';

const withB64 = { assets: { main_image: { url: '/products/2200I.png', data_base64: 'AAAA' } } };
const urlOnly = { assets: { main_image: { url: '/products/2201I.png', data_base64: null } } };
const emptyB64 = { assets: { main_image: { url: '/products/2202I.png', data_base64: '' } } };
const noAssets = { assets: null };
const noImage = { assets: { main_image: null } };

test('returns data URI when data_base64 is set (URL also set)', () => {
  assert.equal(resolveImageSrc(withB64), 'data:image/png;base64,AAAA');
});

test('returns URL when data_base64 is null but URL is set', () => {
  assert.equal(resolveImageSrc(urlOnly), '/products/2201I.png');
});

test('returns "" when both data_base64 and url are absent', () => {
  assert.equal(resolveImageSrc(noAssets), '');
  assert.equal(resolveImageSrc(noImage), '');
});

test('empty-string data_base64 falls back to url', () => {
  assert.equal(resolveImageSrc(emptyB64), '/products/2202I.png');
});

test('never returns null or undefined', () => {
  for (const it of [withB64, urlOnly, emptyB64, noAssets, noImage]) {
    const out = resolveImageSrc(it);
    assert.equal(typeof out, 'string');
    assert.notEqual(out, null);
    assert.notEqual(out, undefined);
  }
});
```

Tests 1-3 are the brief's required 3; tests 4-5 are the proposal's
expanded 5 (empty-string base64 + no-assets defensive cases).

## 4. Embed Script: `scripts/embed-extended-assets.mjs`

### 4.1 CLI shape

```
node scripts/embed-extended-assets.mjs [--input <path>] [--output <path>] [--dry-run] [--verbose]
```

| Flag | Default | Purpose |
|------|---------|---------|
| `--input` | `docs/catalogo_productos_robusto_completo_corregido.json` | Source JSON to mutate |
| `--output` | same as `--input` | Destination (in-place overwrite when equal) |
| `--dry-run` | off | Print summary table; do NOT write |
| `--verbose` | off | Log per-item debug info (file paths, sizes) |

Argv parsing uses the same `parseArgs` pattern as
`scripts/sync-from-sources.mjs` (lines 31-41). No new dependencies.

### 4.2 Algorithm

For each item in `items[]`:

1. Skip if `item_type !== "machinery"` or
   `technical_profile_level !== "extended"`. Only `machinery` items
   reach `extended` (verified across the 14 candidates).
2. Skip if `machinery_profile.specification_groups.length === 0` and
   log to stderr: `[skip] sku=<sku> reason=empty specification_groups`.
   This is the SKU 852 rule.

Otherwise, two embeds:

**Image:** if `main_image.url` starts with `/products/`, prepend
`public` to resolve the FS path; if the file exists, read bytes,
assign `data_base64 = base64(bytes)` plus `byte_size = bytes.length`
and `sha256 = sha256(bytes).hex`. On miss: `[warn] sku=<sku> img
missing at <path>` to stderr.

**PDF:** list `docs/Catalogo actual/*.pdf`, filter to files
containing the SKU substring, sort by `Array.prototype.sort()` (UTF-16
code-unit order, deterministic across OS). Take the first. On zero
matches: `[warn] sku=<sku> no PDF found`. On 2+: `[info] sku=<sku> N
PDFs found, using <first>`. Build the `source_pdf` object with
`storage_key`, `file_name`, `data_base64`, `sha256`, `byte_size`.

The `byte_size` and `sha256` fields on `main_image` are not in the
spec but are written for symmetry with `source_pdf` and the schema's
`additionalProperties: true` on `asset` permits them. The trailing
newline on the write matches `map-product-images.mjs:116`.

### 4.3 Real ESM code (Node 22, no deps)

```javascript
#!/usr/bin/env node
// scripts/embed-extended-assets.mjs
// Inlines PNG + PDF binaries into the v2 catalog JSON for items with
// machinery_profile.technical_profile_level === "extended" and non-empty
// specification_groups. Idempotent. No new deps.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PDF_DIR = resolve(ROOT, 'docs', 'Catalogo actual');
const DEFAULT_INPUT = resolve(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json');

function parseArgs(argv) {
  const args = { input: null, output: null, dryRun: false, verbose: false };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--input=')) args.input = arg.slice('--input='.length);
    else if (arg.startsWith('--output=')) args.output = arg.slice('--output='.length);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--verbose') args.verbose = true;
  }
  return args;
}

const args = parseArgs(process.argv);
const inputPath = args.input ? resolve(args.input) : DEFAULT_INPUT;
const outputPath = args.output ? resolve(args.output) : inputPath;

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function findPdfsForSku(sku) {
  let entries;
  try {
    entries = await readdir(PDF_DIR);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .filter((f) => f.includes(sku))
    .sort(); // code-unit order; deterministic across OS
}

async function embedOne(item, verbose) {
  const sku = item.sku;
  const summary = { sku, imgFound: false, imgBytes: 0, pdfFound: false, pdfBytes: 0, status: 'embedded' };

  // Image
  const img = item.assets?.main_image;
  if (img && typeof img.url === 'string' && img.url.startsWith('/products/')) {
    const fsPath = join(ROOT, 'public', img.url.replace(/^\//, ''));
    if (existsSync(fsPath)) {
      const bytes = await readFile(fsPath);
      img.data_base64 = bytes.toString('base64');
      img.byte_size = bytes.length;
      img.sha256 = sha256(bytes);
      summary.imgFound = true;
      summary.imgBytes = bytes.length;
      if (verbose) console.error(`[debug] ${sku} img: ${fsPath} (${bytes.length} B)`);
    } else {
      console.error(`[warn] sku=${sku} img missing at ${fsPath}`);
      summary.status = 'partial';
    }
  }

  // PDF
  const candidates = await findPdfsForSku(sku);
  if (candidates.length === 0) {
    console.error(`[warn] sku=${sku} no PDF found`);
    if (summary.status === 'embedded') summary.status = 'image-only';
  } else {
    if (candidates.length > 1) {
      console.error(`[info] sku=${sku} ${candidates.length} PDFs found, using ${candidates[0]}`);
    }
    const bytes = await readFile(join(PDF_DIR, candidates[0]));
    item.machinery_profile = item.machinery_profile ?? {};
    item.machinery_profile.source_pdf = {
      storage_key: `catalog/products/${sku}/datasheet.pdf`,
      file_name: candidates[0],
      data_base64: bytes.toString('base64'),
      sha256: sha256(bytes),
      byte_size: bytes.length,
    };
    summary.pdfFound = true;
    summary.pdfBytes = bytes.length;
    if (verbose) console.error(`[debug] ${sku} pdf: ${candidates[0]} (${bytes.length} B)`);
  }

  return summary;
}

function printSummaryTable(rows) {
  const header = ['sku', 'img_found', 'img_bytes', 'pdf_found', 'pdf_bytes', 'status'];
  const widths = [10, 10, 10, 10, 10, 12];
  const sep = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const fmt = (cells) => '| ' + cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ') + ' |';
  console.log(sep);
  console.log(fmt(header));
  console.log(sep);
  for (const r of rows) console.log(fmt([r.sku, r.imgFound, r.imgBytes, r.pdfFound, r.pdfBytes, r.status]));
  console.log(sep);
}

async function main() {
  console.error(`[info] reading ${inputPath}`);
  const data = JSON.parse(await readFile(inputPath, 'utf8'));
  const summaries = [];
  let embedded = 0;
  let skipped = 0;
  for (const item of data.items) {
    if (item.item_type !== 'machinery') continue;
    if (item.technical_profile_level !== 'extended') continue;
    const groups = item.machinery_profile?.specification_groups;
    if (!Array.isArray(groups) || groups.length === 0) {
      console.error(`[skip] sku=${item.sku} reason=empty specification_groups`);
      summaries.push({ sku: item.sku, imgFound: false, imgBytes: 0, pdfFound: false, pdfBytes: 0, status: 'skip' });
      skipped++;
      continue;
    }
    summaries.push(await embedOne(item, args.verbose));
    embedded++;
  }
  printSummaryTable(summaries);
  console.error(`[info] embedded: ${embedded}, skipped: ${skipped}, total extended: ${embedded + skipped}`);
  if (args.dryRun) {
    console.error('[dry-run] no write performed');
    return;
  }
  await writeFile(outputPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.error(`[info] wrote ${outputPath}`);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
```

### 4.4 Idempotency

Re-running the script MUST produce byte-identical output:

- Only owned fields are written: `main_image.{data_base64, byte_size,
  sha256}` and `machinery_profile.source_pdf`.
- Each value is a pure function of on-disk bytes plus the SKU
  (`sha256(bytes)` is deterministic).
- PDF candidates are sorted via `Array.prototype.sort()` (code-unit
  order) before processing, decoupling from `readdir` order.
- `JSON.stringify(data, null, 2)` is deterministic in V8/Node 22.

Test case 6 verifies byte-identity by hashing the output twice.

### 4.5 Verification against current data (read-only)

The 14 extended items currently in the canonical JSON (verified with
PowerShell `ConvertFrom-Json`):

- 13 with `specification_groups.length > 0` -> will-embed. All 13
  have a PNG at `public/products/<sku>.png`; 12 have exactly one PDF
  match; SKU 2200I has two (`"1,5 TUPI..."` ASCII 49 wins over
  `"TUPI..."` ASCII 84).
- 1 with `specification_groups.length === 0`: SKU 852 -> skip
  (verified line 67917, `specification_groups: []`).

Predicted outcome: 13 rows `status=embedded`, 1 row `status=skip` for
SKU 852. JSON grows ~2.15 MB -> ~19 MB (spec range 17-21 MB).

### 4.6 Test cases for the script

File: `tests/scripts/embed-extended-assets.test.mjs` (new). Each test
spawns the script as a child process against a temp fixture; the
real catalog JSON is never touched. Runner: `node --test` via the
existing `package.json` `test` script.

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'embed-extended-assets.mjs');

// --- Fixture helpers --------------------------------------------------------

const PNG_BYTES = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63FCFFFF3F0300050001012F0AC1C50000000049454E44AE426082', 'hex');

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'embed-assets-test-'));
  const publicDir = join(dir, 'public', 'products');
  const pdfDir = join(dir, 'docs', 'Catalogo actual');
  mkdirSync(publicDir, { recursive: true });
  mkdirSync(pdfDir, { recursive: true });
  return { dir, publicDir, pdfDir, docsDir: join(dir, 'docs') };
}

function writePng(dir, name) {
  writeFileSync(join(dir, name), PNG_BYTES);
  return { bytes: PNG_BYTES };
}

function writePdf(dir, name, body) {
  const buf = Buffer.from(body ?? `%PDF-1.4\n%${name}\n%%EOF\n`, 'utf8');
  writeFileSync(join(dir, name), buf);
  return { bytes: buf };
}

function writeCatalog(docsDir, items) {
  const path = join(docsDir, 'catalogo.json');
  writeFileSync(path, JSON.stringify({
    schema_version: '1.0.0',
    catalog: { catalog_id: 'x', catalog_name: 'x', default_currency: 'CLP', generated_at: 'x', totals: {} },
    catalog_assets: {}, catalog_generation: {},
    dictionary_version: { version: '1.0.0', hash_sha256: 'a'.repeat(64) },
    dictionaries: {}, families: [], items,
  }, null, 2));
  return path;
}

function item({ sku, spec = 1, img = true }) {
  const groups = Array.from({ length: spec }, () => ({ group_code: 'g', label: 'G', values: [] }));
  const sl = sku.toLowerCase();
  return {
    id: `id-${sku}`, sku, name: sku, display_name: sku, slug: sl, entity_class: 'x', category_code: 'X',
    item_type: 'machinery', technical_profile_level: 'extended',
    pricing: { sale_amount: 0, currency: 'CLP', formatted: 'x', is_price_available: true },
    status: { is_active: true, is_price_zero: true, is_catalog_visible: true },
    source: {}, search: { normalized_name: sl, tokens: [sl], ai_semantic_context: '' },
    specifications: {},
    machinery_profile: { model: null, features: [], specification_groups: groups, price_observations: [] },
    assets: { main_image: img ? { url: `/products/${sku}.png`, asset_id: 'a', asset_type: 'image', asset_role: 'main_image', sort_order: 1, is_primary: true, source_status: 'uploaded' } : null, gallery: [], pdf_image_fallback_order: [] },
  };
}

const runScript = (cwd, args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
const withFx = (fn) => { const fx = makeFixture(); try { return fn(fx); } finally { rmSync(fx.dir, { recursive: true, force: true }); } };

// --- Tests ------------------------------------------------------------------

test('empty specification_groups -> not modified, warning logged', () => {
  withFx((fx) => {
    writePng(fx.publicDir, '852.png');
    writePdf(fx.pdfDir, 'MOTOR LIFAN (852).pdf');
    const catalog = writeCatalog(fx.docsDir, [item({ sku: '852', spec: 0 })]);
    const r = runScript(fx.dir, ['--input', catalog]);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /\[skip\] sku=852 reason=empty specification_groups/);
    const after = JSON.parse(readFileSync(catalog, 'utf8'));
    assert.equal(after.items[0].assets.main_image.data_base64, undefined);
    assert.equal(after.items[0].machinery_profile.source_pdf, undefined);
  });
});

test('no PNG on disk -> only PDF embedded, image.data_base64 unchanged', () => {
  withFx((fx) => {
    const pdf = writePdf(fx.pdfDir, 'TUPI 2200I.pdf');
    const catalog = writeCatalog(fx.docsDir, [item({ sku: '2200I', spec: 1 })]);
    runScript(fx.dir, ['--input', catalog]);
    const after = JSON.parse(readFileSync(catalog, 'utf8'));
    assert.equal(after.items[0].assets.main_image.data_base64, undefined);
    assert.equal(after.items[0].machinery_profile.source_pdf.sha256, createHash('sha256').update(pdf.bytes).digest('hex'));
  });
});

test('no PDF on disk -> only image embedded, source_pdf undefined', () => {
  withFx((fx) => {
    writePng(fx.publicDir, '2198I.png');
    const catalog = writeCatalog(fx.docsDir, [item({ sku: '2198I', spec: 1 })]);
    const r = runScript(fx.dir, ['--input', catalog]);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /\[warn\] sku=2198I no PDF found/);
    const after = JSON.parse(readFileSync(catalog, 'utf8'));
    assert.ok(after.items[0].assets.main_image.data_base64);
    assert.equal(after.items[0].machinery_profile.source_pdf, undefined);
  });
});

test('both PNG and PDF -> both embedded, sha256 populated', () => {
  withFx((fx) => {
    const png = writePng(fx.publicDir, '2201I.png');
    const pdf = writePdf(fx.pdfDir, 'MACHINE 2201I.pdf');
    const catalog = writeCatalog(fx.docsDir, [item({ sku: '2201I', spec: 3 })]);
    runScript(fx.dir, ['--input', catalog]);
    const after = JSON.parse(readFileSync(catalog, 'utf8'));
    assert.equal(after.items[0].assets.main_image.sha256, createHash('sha256').update(png.bytes).digest('hex'));
    assert.equal(after.items[0].machinery_profile.source_pdf.sha256, createHash('sha256').update(pdf.bytes).digest('hex'));
    assert.equal(after.items[0].assets.main_image.byte_size, png.bytes.length);
    assert.equal(after.items[0].machinery_profile.source_pdf.byte_size, pdf.bytes.length);
  });
});

test('two PDF candidates -> smaller filename wins, info logged', () => {
  withFx((fx) => {
    writePng(fx.publicDir, '2200I.png');
    writePdf(fx.pdfDir, 'TUPI 2200I.pdf');
    writePdf(fx.pdfDir, '1,5 TUPI 2200I.pdf');
    const catalog = writeCatalog(fx.docsDir, [item({ sku: '2200I', spec: 1 })]);
    const r = runScript(fx.dir, ['--input', catalog]);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /\[info\] sku=2200I 2 PDFs found, using 1,5 TUPI 2200I\.pdf/);
    const after = JSON.parse(readFileSync(catalog, 'utf8'));
    assert.equal(after.items[0].machinery_profile.source_pdf.file_name, '1,5 TUPI 2200I.pdf');
  });
});

test('idempotent: running twice produces identical output sha256', () => {
  withFx((fx) => {
    writePng(fx.publicDir, '2202I.png');
    writePdf(fx.pdfDir, 'MACHINE 2202I.pdf');
    const catalog = writeCatalog(fx.docsDir, [item({ sku: '2202I', spec: 2 })]);
    runScript(fx.dir, ['--input', catalog]);
    const h1 = createHash('sha256').update(readFileSync(catalog, 'utf8')).digest('hex');
    runScript(fx.dir, ['--input', catalog]);
    const h2 = createHash('sha256').update(readFileSync(catalog, 'utf8')).digest('hex');
    assert.equal(h1, h2, 'second run must produce byte-identical output');
  });
});
```

Six cases: 852 skip, missing PNG, missing PDF, full embed, 2200I
duplicate, idempotency. Each test creates a temp dir under
`os.tmpdir()`, lays out a minimal fixture, runs the script as a
child process, asserts output, and cleans up.

## 5. `package.json` Scripts

Add two entries; existing `test`, `dev`, `build`, `preview` unchanged.

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "node --import tsx --test \"tests/**/*.test.mjs\"",
    "embed-assets": "node scripts/embed-extended-assets.mjs",
    "embed-assets:dry": "node scripts/embed-extended-assets.mjs --dry-run --verbose"
  }
}
```

`embed-assets` is the destructive default (in-place write). Dry is
verbose by default because the summary table is the reviewer's
primary artifact. No `--help` flag; the script's top-of-file comment
is the documentation.

## 6. Two-PR Split — Commit and PR Boundaries

Both commits land on the same integration branch
`feat/catalog-robust-v2-base`. No sub-branches; the split is
purely review-surface-level.

### 6.1 PR1 — `feat(embed): schema, helper, script, fixture tests`

| File | Status | Approx lines | What |
|------|--------|--------------|------|
| `docs/catalogo_productos_schema_validacion_corregido.json` | MODIFY | +22 | Sections 2.1 + 2.2 diffs |
| `src/lib/catalog.ts` | MODIFY | +13 | New `resolveImageSrc` named export |
| `tests/lib/asset-resolver.test.mjs` | NEW | ~60 | Five assertions |
| `scripts/embed-extended-assets.mjs` | NEW | ~135 | Real ESM |
| `tests/scripts/embed-extended-assets.test.mjs` | NEW | ~155 | Six child-process tests |
| `package.json` | MODIFY | +2 | `embed-assets`, `embed-assets:dry` |
| `openspec/changes/catalog-machinery-assets-embed/{proposal,spec,design}.md` | NEW | ~600 | (proposal and spec already exist from sdd-propose/sdd-spec) |

**Total PR1 diff: ~600 lines source. Zero binary changes.**

PR1 gates: `npm test` green (11 new tests + prior baseline);
`npx astro check` 0 errors; `npm run embed-assets:dry` prints 13+1
table rows.

### 6.2 PR2 — `chore(data): embed extended machinery assets`

| File | Status | What |
|------|--------|------|
| `docs/catalogo_productos_robusto_completo_corregido.json` | MODIFY | ~17 MB diff: 13 items get `data_base64` + `source_pdf`; SKU 852 untouched |

**Total PR2 diff: one file, ~17 MB. Reviewer spot-checks one item and trusts the rest.**

PR2 gates: `npm test` still green; `npx astro build` succeeds
(AJV re-validation passes); `dist/api/.../catalog.json` is 17-21 MB;
`npm run embed-assets` against the just-committed JSON produces
**zero** diff (idempotency proof).

### 6.3 Why two PRs on the same branch

GitHub's merge UI works on a single branch; sub-branches would
require a rebase dance. The chain-on-same-branch pattern matches
slice 1 / slice 2 in this repo's archive
(`openspec/changes-archive/catalog-v2-ui-migration-slice-2/`).
Reviewers see PR1 as "the change" and PR2 as "the data run". If
PR1 is rejected, PR2 never opens. If PR1 lands but PR2 needs redo,
`git revert` PR2 cleanly; PR1 stays.

## 7. Verification Matrix

| Spec requirement | Covered by test | Proven by script run |
|------------------|-----------------|----------------------|
| `image base64 embedding` | `asset-resolver.test.mjs` #1; `embed-extended-assets.test.mjs` #3, #4 | dry-run shows 13 rows with `img_found=true` |
| `PDF binary embedding` | `embed-extended-assets.test.mjs` #2, #4 | dry-run shows 13 rows with `pdf_found=true` |
| `skip empty specification_groups` | `embed-extended-assets.test.mjs` #1, #3 | dry-run table contains one `status=skip` row for SKU 852 |
| `duplicate PDF resolution` | `embed-extended-assets.test.mjs` #5 | dry-run against real JSON prints `[info] sku=2200I 2 PDFs found, using 1,5 TUPI...` |
| `idempotent re-run` | `embed-extended-assets.test.mjs` #6 | `npm run embed-assets` twice; `git diff` empty |
| `helper resolveImageSrc` | `asset-resolver.test.mjs` #1, #2, #3 | `npm test` exits 0 |
| `schema validity` | indirect via `npx astro build` running AJV | `npx astro build` exits 0 before and after PR2 |
| `build artifact size` | n/a (operational) | `ls -la dist/api/catalogs/catalogo-de-productos/catalog.json` shows 17-21 MB |

## 8. Risks and Mitigations

| # | Risk | Likelihood | Mitigation |
|---|------|-----------|-----------|
| R1 | PR2 ~17 MB diff slows review tooling | HIGH | Split: PR1 has zero binary; PR2 is one file with 13 well-bounded additions. Reviewer eyeballs one item and trusts the rest. |
| R2 | Browser RAM peak on `JSON.parse` of 19 MB at runtime | MED | The JSON is only consumed server-side at build (`src/lib/catalog.ts` runs in Node). The API endpoint `src/pages/api/catalogs/[slug]/catalog.json.ts` is prerendered to a static file. No browser client parses the full 19 MB today. |
| R3 | Repo size growth ~700% (~2.15 MB -> ~19 MB JSON) | MED | Accepted by user (decision 2). Optional `.gitattributes` `linguist-generated` line for the JSON file is deferred to a future housekeeping PR. |
| R4 | 2200I duplicate PDF picked non-deterministically across OS | LOW | `Array.prototype.sort()` (UTF-16 code-unit order). Verified: `'1,5 TUPI...'` (char `1`, code 49) < `'TUPI 1,5...'` (char `T`, code 84). Test case 5 enforces this. |
| R5 | SKU 852 silently dropped | LOW | Stderr log `[skip] sku=852 reason=empty specification_groups` on every run. Dry-run table shows `status=skip`. Test case 1 enforces the stderr line. |
| R6 | Helper called on item missing `assets`/`main_image` | LOW | Optional chaining in section 3.2; test cases 4 and 5 cover both shapes. No current caller (frontend migration is slice 3+). |
| R7 | Schema drift between adapter AJV and build AJV | LOW | The helper does NOT touch AJV. The script does NOT touch AJV. Schema validation runs only at adapter load and at build via the existing pipeline. |
| R8 | Concurrent writes to the canonical JSON | LOW | The script is a CLI invoked by a single user at a time. No file locking. `git status` before each run prevents conflicts with an in-flight PR. |

## 9. Rollback Plan

### 9.1 PR1 not yet merged

```
git revert <pr1-commit-sha>
```

No data touched. Schema reverts, helper removed, script removed,
tests removed, package.json scripts removed. Clean revert.

### 9.2 PR1 merged, PR2 not yet merged

Same as 9.1. The canonical JSON is untouched by PR1, so reverting
PR1 is safe and lossless. No consumer of `resolveImageSrc` exists
in this slice's scope (`src/pages/maquinaria/[slug].astro` is out
of scope per proposal section 3).

### 9.3 Both merged

```
git revert <pr2-commit-sha>   # restores 2.15 MB JSON
# optional: git revert <pr1-commit-sha>   # full pre-slice state
```

Reverting PR2 alone is safe: `resolveImageSrc` ships and falls
through to URL for all items lacking `data_base64` (the entire
pre-PR2 catalog). Reverting both fully restores the pre-slice
state. No DB migration, no user-facing state, no cache
invalidation. To re-embed after a PR2 revert: `npm run embed-assets`.

## 10. Open Questions

None for the user. All three user-facing decisions (PR split, JSON
size, 852-skip rule) are locked in the proposal. Internal
micro-decisions documented inline:

- Helper file placement: `src/lib/catalog.ts` new export (section 3.1).
- Helper MIME: hardcoded `image/png` (section 3.2 note).
- Image extra fields: `byte_size` and `sha256` on `main_image` written alongside `data_base64` for symmetry with `source_pdf` (section 4.2 note).
- `.gitattributes` for linguist stats: deferred to a future housekeeping PR (R3).

## 11. Artifacts Touched (summary)

| File | Status | Purpose |
|------|--------|---------|
| `docs/catalogo_productos_schema_validacion_corregido.json` | MODIFY | +22: `data_base64` on `asset`, `source_pdf` on `machineryProfile` |
| `src/lib/catalog.ts` | MODIFY | +13: new `resolveImageSrc` named export |
| `tests/lib/asset-resolver.test.mjs` | NEW | 5 helper tests |
| `scripts/embed-extended-assets.mjs` | NEW | idempotent embed script |
| `tests/scripts/embed-extended-assets.test.mjs` | NEW | 6 child-process tests |
| `package.json` | MODIFY | +2: `embed-assets`, `embed-assets:dry` |
| `openspec/changes/catalog-machinery-assets-embed/design.md` | NEW | this document |
| `docs/catalogo_productos_robusto_completo_corregido.json` | MODIFY (PR2 only) | ~17 MB diff: 13 items get `data_base64` + `source_pdf` |

No changes to: `src/lib/catalog-source.ts`, `src/data/catalog.ts`
(shim), `src/data/catalog-client.ts`, `src/data/maquinaria.ts`,
`astro.config.mjs`, `tsconfig.json`, `src/layouts/`,
`src/components/`, API endpoints, Astro pages, `.env.example`.