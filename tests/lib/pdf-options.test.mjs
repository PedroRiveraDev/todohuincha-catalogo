// tests/lib/pdf-options.test.mjs
// Tests for src/lib/pdf-options.ts (slice pdf-catalog-v2).
// Refs:
//   openspec/changes/pdf-catalog-v2/spec.md (Requirement: pdf options popup)
//   openspec/changes/pdf-catalog-v2/design.md (section 7 - Storage Contract)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultPdfOptions,
  serializePdfOptions,
  deserializePdfOptions,
  PDF_OPTIONS_STORAGE_KEY,
} from '../../src/lib/pdf-options.ts';

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

test('PDF_OPTIONS_STORAGE_KEY: exactly "cat:pdf:options" (spec lock)', () => {
  // Spec section 7.1: key MUST be exactly `cat:pdf:options`.
  // Do not rename this constant without updating the spec.
  assert.equal(PDF_OPTIONS_STORAGE_KEY, 'cat:pdf:options');
});

// ---------------------------------------------------------------------------
// defaultPdfOptions
// ---------------------------------------------------------------------------

test('defaultPdfOptions: modo === "completo" by default', () => {
  const d = defaultPdfOptions();
  assert.equal(d.modo, 'completo');
});

test('defaultPdfOptions: incluirPortada === true by default', () => {
  assert.equal(defaultPdfOptions().incluirPortada, true);
});

test('defaultPdfOptions: incluirContraportada === true by default', () => {
  assert.equal(defaultPdfOptions().incluirContraportada, true);
});

test('defaultPdfOptions: incluirQrPorCategoria === false by default', () => {
  // Per design section 6.1, QR defaults to OFF until the user opts in.
  assert.equal(defaultPdfOptions().incluirQrPorCategoria, false);
});

test('defaultPdfOptions: selectedSlugs defaults to ["__all__"]', () => {
  assert.deepEqual(defaultPdfOptions().selectedSlugs, ['__all__']);
});

test('defaultPdfOptions: savedAt is a parseable ISO timestamp', () => {
  const d = defaultPdfOptions();
  const t = Date.parse(d.savedAt);
  assert.ok(!Number.isNaN(t), 'savedAt must be ISO-parseable');
});

// ---------------------------------------------------------------------------
// serializePdfOptions
// ---------------------------------------------------------------------------

test('serializePdfOptions: round-trips through JSON.parse', () => {
  const opts = defaultPdfOptions();
  const raw = serializePdfOptions(opts);
  assert.equal(typeof raw, 'string');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.modo, opts.modo);
  assert.equal(parsed.incluirPortada, opts.incluirPortada);
  assert.equal(parsed.incluirContraportada, opts.incluirContraportada);
  assert.equal(parsed.incluirQrPorCategoria, opts.incluirQrPorCategoria);
});

test('serializePdfOptions: includes only the 6 known fields', () => {
  const raw = serializePdfOptions(defaultPdfOptions());
  const parsed = JSON.parse(raw);
  const keys = Object.keys(parsed).sort();
  assert.deepEqual(keys, [
    'incluirContraportada',
    'incluirPortada',
    'incluirQrPorCategoria',
    'modo',
    'savedAt',
    'selectedSlugs',
  ]);
});

// ---------------------------------------------------------------------------
// deserializePdfOptions
// ---------------------------------------------------------------------------

test('deserializePdfOptions: null/undefined returns defaults', () => {
  // savedAt is a fresh ISO timestamp on each defaultPdfOptions() call,
  // so compare specific fields rather than deep-equal the whole object.
  for (const raw of [null, undefined, '']) {
    const out = deserializePdfOptions(raw);
    assert.equal(out.modo, 'completo');
    assert.equal(out.incluirPortada, true);
    assert.equal(out.incluirContraportada, true);
    assert.equal(out.incluirQrPorCategoria, false);
    assert.deepEqual(out.selectedSlugs, ['__all__']);
  }
});

test('deserializePdfOptions: invalid JSON returns defaults', () => {
  assert.deepEqual(deserializePdfOptions('not-json'), defaultPdfOptions());
  assert.deepEqual(deserializePdfOptions('{broken'), defaultPdfOptions());
});

test('deserializePdfOptions: invalid modo value falls back to defaults', () => {
  // Spec scenario: "rejects invalid persisted mode and falls back to defaults".
  const stored = JSON.stringify({
    modo: 'weird',
    incluirPortada: false,
    incluirContraportada: true,
    incluirQrPorCategoria: true,
  });
  const out = deserializePdfOptions(stored);
  assert.equal(out.modo, 'completo');
  assert.equal(out.incluirPortada, true); // default
});

test('deserializePdfOptions: valid payload round-trips', () => {
  const stored = JSON.stringify({
    modo: 'compacto',
    incluirPortada: false,
    incluirContraportada: true,
    incluirQrPorCategoria: true,
    selectedSlugs: ['sierras', 'cuchillos'],
    savedAt: '2026-06-27T15:32:00.000Z',
  });
  const out = deserializePdfOptions(stored);
  assert.equal(out.modo, 'compacto');
  assert.equal(out.incluirPortada, false);
  assert.equal(out.incluirContraportada, true);
  assert.equal(out.incluirQrPorCategoria, true);
  assert.deepEqual(out.selectedSlugs, ['sierras', 'cuchillos']);
  assert.equal(out.savedAt, '2026-06-27T15:32:00.000Z');
});

test('deserializePdfOptions: coerces bool fields with Boolean(...)', () => {
  // Per design section 7.2: Boolean(...) coercion so truthy strings /
  // numbers become true and falsy values become false. We use values
  // that work consistently with that rule.
  const stored = JSON.stringify({
    modo: 'completo',
    incluirPortada: 0,         // number 0 -> false
    incluirContraportada: 1,   // number 1 -> true
    incluirQrPorCategoria: '', // empty string -> false
  });
  const out = deserializePdfOptions(stored);
  assert.equal(out.incluirPortada, false);
  assert.equal(out.incluirContraportada, true);
  assert.equal(out.incluirQrPorCategoria, false);
});

test('deserializePdfOptions: ignores extra unknown keys (forward-compat)', () => {
  const stored = JSON.stringify({
    modo: 'completo',
    incluirPortada: true,
    incluirContraportada: true,
    incluirQrPorCategoria: false,
    futureOption: 'whatever',
  });
  const out = deserializePdfOptions(stored);
  assert.equal(out.modo, 'completo');
  // No throw, no spread of unknown keys into the typed shape.
  assert.equal(out.futureOption, undefined);
});

test('deserializePdfOptions: object form (not string) accepted', () => {
  // The dialog can pass the payload as either a raw JSON string OR a
  // parsed object (when callers already deserialized once).
  const obj = {
    modo: 'compacto',
    incluirPortada: false,
    incluirContraportada: false,
    incluirQrPorCategoria: false,
  };
  const out = deserializePdfOptions(JSON.stringify(obj));
  assert.equal(out.modo, 'compacto');
  assert.equal(out.incluirPortada, false);
});