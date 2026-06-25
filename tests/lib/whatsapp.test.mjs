// tests/lib/whatsapp.test.mjs
// Tests for src/lib/whatsapp.ts (slice 2 of catalog-v2-ui-migration).
// Refs:
//   openspec/changes/catalog-v2-ui-migration-slice-2/spec.md
//   openspec/changes/catalog-v2-ui-migration-slice-2/design.md (section 2)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWhatsAppNumbers,
  buildWhatsAppUrl,
} from '../../src/lib/whatsapp.ts';

// ---------------------------------------------------------------------------
// parseWhatsAppNumbers
// ---------------------------------------------------------------------------

test('parseWhatsAppNumbers: undefined env returns empty object', () => {
  assert.deepEqual(parseWhatsAppNumbers(undefined), {});
});

test('parseWhatsAppNumbers: empty string returns empty object', () => {
  assert.deepEqual(parseWhatsAppNumbers(''), {});
});

test('parseWhatsAppNumbers: single key:value pair', () => {
  assert.deepEqual(
    parseWhatsAppNumbers('sales:+56912345678'),
    { sales: '+56912345678' }
  );
});

test('parseWhatsAppNumbers: multiple key:value pairs', () => {
  assert.deepEqual(
    parseWhatsAppNumbers('sales:+5691,repuestos:+5692,machinery:+5693'),
    { sales: '+5691', repuestos: '+5692', machinery: '+5693' }
  );
});

test('parseWhatsAppNumbers: malformed entry (no colon) is dropped', () => {
  assert.deepEqual(
    parseWhatsAppNumbers('sales:+5691,invalid,repuestos:+5692'),
    { sales: '+5691', repuestos: '+5692' }
  );
});

test('parseWhatsAppNumbers: empty key is dropped', () => {
  assert.deepEqual(
    parseWhatsAppNumbers(':56912345678,sales:+5692'),
    { sales: '+5692' }
  );
});

test('parseWhatsAppNumbers: tolerance for single bare number (treats as general)', () => {
  // Common case: dev / quick-start where the operator pastes only one number
  // without the key:value wrapping. We treat it as { general: <number> }.
  assert.deepEqual(
    parseWhatsAppNumbers('56974997212'),
    { general: '56974997212' }
  );
});

test('parseWhatsAppNumbers: tolerance for bare number with + prefix', () => {
  assert.deepEqual(
    parseWhatsAppNumbers('+56974997212'),
    { general: '+56974997212' }
  );
});

// ---------------------------------------------------------------------------
// buildWhatsAppUrl
// ---------------------------------------------------------------------------

test('buildWhatsAppUrl: number with + prefix strips the +', () => {
  assert.equal(
    buildWhatsAppUrl('+56912345678', 'hola'),
    'https://wa.me/56912345678?text=hola'
  );
});

test('buildWhatsAppUrl: number without + prefix is preserved', () => {
  assert.equal(
    buildWhatsAppUrl('56912345678', 'hola'),
    'https://wa.me/56912345678?text=hola'
  );
});

test('buildWhatsAppUrl: message with spaces and special chars is URL-encoded', () => {
  assert.equal(
    buildWhatsAppUrl('+56912345678', 'hola mundo & más'),
    'https://wa.me/56912345678?text=hola%20mundo%20%26%20m%C3%A1s'
  );
});
