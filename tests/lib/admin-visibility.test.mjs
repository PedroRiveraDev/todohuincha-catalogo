// tests/lib/admin-visibility.test.mjs
// Visibility helpers — read defaults, parse payloads, role rules.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VISIBILITY,
  adminSeesEverything,
  isItemDraft,
  isItemVisibleToRole,
  parseVisibilityPayload,
  resolveCategoryVisibility,
  resolveProductVisibility,
} from '../../src/lib/admin-visibility.ts';

test('parseVisibilityPayload: accepts well-formed buckets', () => {
  const result = parseVisibilityPayload({
    products: {
      default: { visible_to_vendor: true, visible_to_public: false },
      by_sku: { LA1071: { visible_to_vendor: true, visible_to_public: true } },
    },
    categories: {
      default: { visible_to_vendor: true, visible_to_public: false },
      by_code: { RECALQUE: { visible_to_vendor: true, visible_to_public: true } },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.payload.products.by_sku.LA1071.visible_to_public, true);
});

test('parseVisibilityPayload: rejects malformed body', () => {
  const result = parseVisibilityPayload({ products: 'oops' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0 || typeof result.errors === 'object', 'should report errors');
});

test('parseVisibilityPayload: rejects non-objects', () => {
  const result = parseVisibilityPayload(null);
  assert.equal(result.ok, false);
});

test('parseVisibilityPayload: accepts partial defaults and fills the rest', () => {
  const result = parseVisibilityPayload({ products: { default: {} }, categories: { default: {} } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.payload.products.default, { visible_to_vendor: true, visible_to_public: false });
});

test('parseVisibilityPayload: rejects SKU with invalid characters', () => {
  const result = parseVisibilityPayload({
    products: { default: { visible_to_vendor: true, visible_to_public: false }, by_sku: { 'invalid sku': { visible_to_vendor: true } } },
    categories: { default: { visible_to_vendor: true, visible_to_public: false } },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /invalid format/);
});

test('parseVisibilityPayload: rejects category code with lowercase letters', () => {
  const result = parseVisibilityPayload({
    products: { default: { visible_to_vendor: true, visible_to_public: false } },
    categories: { default: { visible_to_vendor: true, visible_to_public: false }, by_code: { lowercase: {} } },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /invalid format/);
});

test('adminSeesEverything is a constant true', () => {
  assert.equal(adminSeesEverything(), true);
});

test('isItemVisibleToRole: admin always true regardless of flags', () => {
  assert.equal(isItemVisibleToRole('admin', undefined), true);
  assert.equal(isItemVisibleToRole('admin', { visible_to_vendor: false, visible_to_public: false }), true);
});

test('isItemVisibleToRole: vendor only sees visible_to_vendor', () => {
  assert.equal(isItemVisibleToRole('vendor', { visible_to_vendor: true, visible_to_public: false }), true);
  assert.equal(isItemVisibleToRole('vendor', { visible_to_vendor: false, visible_to_public: true }), false);
  assert.equal(isItemVisibleToRole('vendor', undefined), false);
});

test('isItemVisibleToRole: anonymous is always denied', () => {
  assert.equal(isItemVisibleToRole(null, { visible_to_vendor: true, visible_to_public: true }), false);
  assert.equal(isItemVisibleToRole(undefined, { visible_to_vendor: true, visible_to_public: true }), false);
});

test('isItemDraft: returns true when both flags are off or missing', () => {
  assert.equal(isItemDraft(undefined), true);
  assert.equal(isItemDraft({ visible_to_vendor: false, visible_to_public: false }), true);
  assert.equal(isItemDraft({ visible_to_vendor: true, visible_to_public: false }), false);
  assert.equal(isItemDraft({ visible_to_vendor: false, visible_to_public: true }), false);
});

test('resolveProductVisibility: prefers override over default', () => {
  const v = {
    ...DEFAULT_VISIBILITY,
    products: {
      default: { visible_to_vendor: false, visible_to_public: false },
      by_sku: { LA1071: { visible_to_vendor: true, visible_to_public: true } },
    },
  };
  assert.deepEqual(resolveProductVisibility(v, 'LA1071'), { visible_to_vendor: true, visible_to_public: true });
  assert.deepEqual(resolveProductVisibility(v, 'OTHER'), { visible_to_vendor: false, visible_to_public: false });
});

test('resolveCategoryVisibility: prefers override over default', () => {
  const v = {
    ...DEFAULT_VISIBILITY,
    categories: {
      default: { visible_to_vendor: false, visible_to_public: false },
      by_code: { RECALQUE: { visible_to_vendor: true, visible_to_public: true } },
    },
  };
  assert.deepEqual(resolveCategoryVisibility(v, 'RECALQUE'), { visible_to_vendor: true, visible_to_public: true });
  assert.deepEqual(resolveCategoryVisibility(v, 'OTROS'), { visible_to_vendor: false, visible_to_public: false });
});

// ---------------------------------------------------------------------------
// Regression coverage for B2 + B3:
//   Saving visibility from /admin/categories must NOT wipe per-SKU overrides
//   (B2) and must NOT derive products.default from the first category's
//   resolved visibility (B3). These tests assert the WIRE SHAPE the client
//   builds in src/pages/admin/categories.astro after the fix.
// ---------------------------------------------------------------------------

test('categories page payload preserves existing per-SKU overrides (B2)', () => {
  // The fixed client script merges initialVisibility.products.by_sku into
  // the save payload so existing per-SKU overrides survive the round-trip.
  // This test asserts that the merged payload is accepted by
  // parseVisibilityPayload AND that the parsed products.by_sku carries
  // through to the persisted shape unchanged.
  const existingProductsBySku = { LA1071: { visible_to_vendor: true, visible_to_public: true } };
  const payload = {
    products: {
      default: { visible_to_vendor: true, visible_to_public: false },
      by_sku: { ...existingProductsBySku },
    },
    categories: {
      default: { visible_to_vendor: true, visible_to_public: false },
      by_code: { RECALQUE: { visible_to_vendor: true, visible_to_public: true } },
    },
  };
  const parsed = parseVisibilityPayload(payload);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.payload.products.by_sku.LA1071, { visible_to_vendor: true, visible_to_public: true });
  assert.equal(parsed.payload.products.by_sku.LA1071.visible_to_public, true);
});

test('categories page payload uses initialVisibility.products.default (B3)', () => {
  // The fixed client reads products.default from initialVisibility.products.default
  // (NOT from the first category's resolved visibility). Simulate that here
  // by building the payload with the persisted products.default and asserting
  // it round-trips intact.
  const persistedProductsDefault = { visible_to_vendor: false, visible_to_public: true };
  const payload = {
    products: {
      default: { ...persistedProductsDefault },
      by_sku: {},
    },
    categories: {
      default: { visible_to_vendor: true, visible_to_public: false },
      by_code: {},
    },
  };
  const parsed = parseVisibilityPayload(payload);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.payload.products.default, persistedProductsDefault);
});

test('categories page source no longer sends an empty products.by_sku (B2 regression)', async () => {
  // Read the categories.astro file as text and assert it contains the
  // merge pattern and does NOT contain the broken `by_sku: {}` save shape.
  // This is a guardrail: if someone reverts the B2 fix, this test fails.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'admin', 'categories.astro'),
    'utf8'
  );
  assert.match(src, /initialVisibility\.products\.by_sku/, 'must merge with persisted products.by_sku');
  assert.match(src, /by_sku:\s*\{\s*\.\.\.existingProductsBySku/, 'must spread the existing per-SKU overrides');
  assert.doesNotMatch(src, /by_sku:\s*\{\s*\}\s*,?\s*\}\s*,?\s*categories:\s*\{/, 'must NOT send products.by_sku: {} in the save payload');
});

test('categories page source reads products.default from initialVisibility.products.default (B3 regression)', async () => {
  // Guardrail for B3: ensure the categories page does NOT build the
  // products.default from a category entry.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'admin', 'categories.astro'),
    'utf8'
  );
  assert.match(src, /initialVisibility\.products\?\.default/, 'products.default must come from initialVisibility.products.default');
  assert.doesNotMatch(
    src,
    /initialVisibilityMap\[Object\.keys\(initialVisibilityMap\)\[0\]\][^;]*default/,
    'products.default must NOT be derived from a category entry'
  );
  // And the categories.default derivation must come from categories.default.
  assert.match(src, /initialVisibility\.categories\?\.default/, 'categories.default must come from initialVisibility.categories.default');
});
