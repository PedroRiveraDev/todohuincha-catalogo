// tests/scripts/embed-extended-assets.test.mjs
// Tests for scripts/embed-extended-assets.mjs (catalog-machinery-assets-embed).
// Refs:
//   openspec/changes/catalog-machinery-assets-embed/spec.md
//   openspec/changes/catalog-machinery-assets-embed/design.md (section 4.6)

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

const PNG_BYTES = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63FCFFFF3F0300050001012F0AC1C50000000049454E44AE426082',
  'hex'
);

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
  writeFileSync(
    path,
    JSON.stringify(
      {
        schema_version: '1.0.0',
        catalog: {
          catalog_id: 'x',
          catalog_name: 'x',
          default_currency: 'CLP',
          generated_at: 'x',
          totals: {},
        },
        catalog_assets: {},
        catalog_generation: {},
        dictionary_version: { version: '1.0.0', hash_sha256: 'a'.repeat(64) },
        dictionaries: {},
        families: [],
        items,
      },
      null,
      2
    )
  );
  return path;
}

function item({ sku, spec = 1, img = true }) {
  const groups = Array.from({ length: spec }, () => ({
    group_code: 'g',
    label: 'G',
    values: [],
  }));
  const sl = sku.toLowerCase();
  return {
    id: `id-${sku}`,
    sku,
    name: sku,
    display_name: sku,
    slug: sl,
    entity_class: 'x',
    category_code: 'X',
    item_type: 'machinery',
    technical_profile_level: 'extended',
    pricing: { sale_amount: 0, currency: 'CLP', formatted: 'x', is_price_available: true },
    status: { is_active: true, is_price_zero: true, is_catalog_visible: true },
    source: {},
    search: { normalized_name: sl, tokens: [sl], ai_semantic_context: '' },
    specifications: {},
    machinery_profile: {
      model: null,
      features: [],
      specification_groups: groups,
      price_observations: [],
    },
    assets: {
      main_image: img
        ? {
            url: `/products/${sku}.png`,
            asset_id: 'a',
            asset_type: 'image',
            asset_role: 'main_image',
            sort_order: 1,
            is_primary: true,
            source_status: 'uploaded',
          }
        : null,
      gallery: [],
      pdf_image_fallback_order: [],
    },
  };
}

const runScript = (cwd, args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
const withFx = (fn) => {
  const fx = makeFixture();
  try {
    return fn(fx);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
};

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
    assert.equal(
      after.items[0].machinery_profile.source_pdf.sha256,
      createHash('sha256').update(pdf.bytes).digest('hex')
    );
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
    assert.equal(
      after.items[0].assets.main_image.sha256,
      createHash('sha256').update(png.bytes).digest('hex')
    );
    assert.equal(
      after.items[0].machinery_profile.source_pdf.sha256,
      createHash('sha256').update(pdf.bytes).digest('hex')
    );
    assert.equal(after.items[0].assets.main_image.byte_size, png.bytes.length);
    assert.equal(
      after.items[0].machinery_profile.source_pdf.byte_size,
      pdf.bytes.length
    );
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
    assert.equal(
      after.items[0].machinery_profile.source_pdf.file_name,
      '1,5 TUPI 2200I.pdf'
    );
  });
});

test('idempotent: running twice produces identical output sha256', () => {
  withFx((fx) => {
    writePng(fx.publicDir, '2202I.png');
    writePdf(fx.pdfDir, 'MACHINE 2202I.pdf');
    const catalog = writeCatalog(fx.docsDir, [item({ sku: '2202I', spec: 2 })]);
    const r1 = runScript(fx.dir, ['--input', catalog]);
    assert.equal(r1.status, 0, 'first run must exit 0 before checking idempotency');
    const h1 = createHash('sha256').update(readFileSync(catalog, 'utf8')).digest('hex');
    const r2 = runScript(fx.dir, ['--input', catalog]);
    assert.equal(r2.status, 0, 'second run must exit 0');
    const h2 = createHash('sha256').update(readFileSync(catalog, 'utf8')).digest('hex');
    assert.equal(h1, h2, 'second run must produce byte-identical output');
  });
});