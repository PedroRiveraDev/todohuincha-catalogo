// tests/lib/asset-resolver.test.mjs
// Tests for resolveImageSrc helper (catalog-machinery-assets-embed).
// Refs:
//   openspec/changes/catalog-machinery-assets-embed/spec.md (Requirement: helper resolveImageSrc)
//   openspec/changes/catalog-machinery-assets-embed/design.md (section 3.3)

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveImageSrc } from '../../src/lib/catalog.ts';

const withB64 = {
  assets: { main_image: { url: '/products/2200I.png', data_base64: 'AAAA' } },
};
const urlOnly = {
  assets: { main_image: { url: '/products/2201I.png', data_base64: null } },
};
const emptyB64 = {
  assets: { main_image: { url: '/products/2202I.png', data_base64: '' } },
};
const noAssets = { assets: null };
const noImage = { assets: { main_image: null } };

test('returns data URI when data_base64 is set (URL also set)', () => {
  assert.equal(resolveImageSrc(withB64), 'data:image/png;base64,AAAA');
});

test('returns URL when data_base64 is null but URL is set', () => {
  assert.equal(resolveImageSrc(urlOnly), '/products/2201I.png');
});

test('returns empty string when both data_base64 and url are absent', () => {
  assert.equal(resolveImageSrc(noAssets), '');
  assert.equal(resolveImageSrc(noImage), '');
});

test('empty-string data_base64 falls back to url', () => {
  assert.equal(resolveImageSrc(emptyB64), '/products/2202I.png');
});

test('never returns null or undefined (defensive over all shapes)', () => {
  for (const it of [withB64, urlOnly, emptyB64, noAssets, noImage]) {
    const out = resolveImageSrc(it);
    assert.equal(typeof out, 'string');
    assert.notEqual(out, null);
    assert.notEqual(out, undefined);
  }
});