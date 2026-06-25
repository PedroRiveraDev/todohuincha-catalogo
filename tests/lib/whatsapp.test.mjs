// tests/lib/whatsapp.test.mjs
// Pure helpers for parsing PUBLIC_WHATSAPP_NUMBERS and building wa.me URLs.
// Slice 2 of catalog-v2-ui-migration. 8 assertions.
//
// Refs:
//   openspec/changes/catalog-v2-ui-migration-slice-2/spec.md
//   openspec/changes/catalog-v2-ui-migration-slice-2/design.md (section 2)

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsAppNumbers, buildWhatsAppUrl } from '../../src/lib/whatsapp.ts';

// ---------------------------------------------------------------------------
// parseWhatsAppNumbers (5 assertions)
// ---------------------------------------------------------------------------

test('parseWhatsAppNumbers: undefined env returns empty record', () => {
  assert.deepEqual(parseWhatsAppNumbers(undefined), {});
});

test('parseWhatsAppNumbers: empty string env returns empty record', () => {
  assert.deepEqual(parseWhatsAppNumbers(''), {});
});

test('parseWhatsAppNumbers: single key:value pair returns one entry', () => {
  assert.deepEqual(parseWhatsAppNumbers('sales:+56912345678'), {
    sales: '+56912345678',
  });
});

test('parseWhatsAppNumbers: multiple comma-separated pairs return N entries', () => {
  const result = parseWhatsAppNumbers(
    'sales:+56912345678,repuestos:+56912345679,machinery:+56912345680'
  );
  assert.equal(Object.keys(result).length, 3);
  assert.equal(result.sales, '+56912345678');
  assert.equal(result.repuestos, '+56912345679');
  assert.equal(result.machinery, '+56912345680');
});

test('parseWhatsAppNumbers: malformed entries (no colon) are dropped, valid kept', () => {
  const result = parseWhatsAppNumbers('sales:+56912345678,malformed,repuestos:+56912345679');
  assert.equal(Object.keys(result).length, 2);
  assert.equal(result.sales, '+56912345678');
  assert.equal(result.repuestos, '+56912345679');
});

// ---------------------------------------------------------------------------
// buildWhatsAppUrl (3 assertions)
// ---------------------------------------------------------------------------

test('buildWhatsAppUrl: number with leading + strips the + from the URL', () => {
  assert.equal(
    buildWhatsAppUrl('+56912345678', 'hola'),
    'https://wa.me/56912345678?text=hola'
  );
});

test('buildWhatsAppUrl: number without leading + passes through', () => {
  assert.equal(
    buildWhatsAppUrl('56912345678', 'hola'),
    'https://wa.me/56912345678?text=hola'
  );
});

test('buildWhatsAppUrl: special characters in message are URL-encoded', () => {
  assert.equal(
    buildWhatsAppUrl('+56912345678', 'hola mundo & mas'),
    'https://wa.me/56912345678?text=hola%20mundo%20%26%20mas'
  );
});