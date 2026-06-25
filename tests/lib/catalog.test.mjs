// tests/lib/catalog.test.mjs
// Adapter contract for src/lib/catalog.ts. 16 positive + 1 negative.
//
// Refs:
//   openspec/changes/catalog-v2-ui-migration-slice-1/spec.md
//   openspec/changes/catalog-v2-ui-migration-slice-1/design.md
//   openspec/changes/catalog-v2-ui-migration-slice-1/tasks.md

import test from 'node:test';
import assert from 'node:assert/strict';
import { adapter } from '../../src/lib/catalog.ts';
import { loadAndValidateBadCatalog } from './__catalog-bad-loader.mjs';

// ---------------------------------------------------------------------------
// Counts and dedup
// ---------------------------------------------------------------------------

test('adapter.items: length is 681 after SKU dedup', () => {
  assert.equal(adapter.items.length, 681);
});

test('adapter.duplicates: known six SKU collisions in order of first appearance', () => {
  assert.deepEqual(adapter.duplicates, ['1790I', '216I', '212I', '217I', '474I', '1993I']);
});

test('adapter.families: 666 entries pass-through', () => {
  assert.equal(adapter.families.length, 666);
});

test('adapter.categories: 21 derived summaries', () => {
  assert.equal(adapter.categories.length, 21);
});

test('adapter.serviceCategories: 10 derived services', () => {
  assert.equal(adapter.serviceCategories.length, 10);
});

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

test('adapter.getItem: returns the item for a known SKU', () => {
  const item = adapter.getItem('LA1071');
  assert.ok(item, 'getItem(LA1071) must return a defined item');
  assert.equal(item.sku, 'LA1071');
});

test('adapter.getItem: returns undefined for an unknown SKU', () => {
  assert.equal(adapter.getItem('NOTFOUND'), undefined);
});

test('adapter.itemsByCategory(MAQUINAS): 31 items', () => {
  assert.equal(adapter.itemsByCategory('MAQUINAS').length, 31);
});

test('adapter.itemsByType(machinery): 31 items', () => {
  assert.equal(adapter.itemsByType('machinery').length, 31);
});

test('adapter.itemsByType(spare_part): 98 items', () => {
  assert.equal(adapter.itemsByType('spare_part').length, 98);
});

test('adapter.itemsByType(simple_product): 552 items', () => {
  assert.equal(adapter.itemsByType('simple_product').length, 552);
});

test('adapter.countByType(): machinery bucket equals 31', () => {
  assert.equal(adapter.countByType().machinery, 31);
});

test('adapter.getCategory: returns the summary for a known code', () => {
  const cat = adapter.getCategory('MAQUINAS');
  assert.ok(cat, 'getCategory(MAQUINAS) must return a defined summary');
  assert.equal(cat.code, 'MAQUINAS');
});

test('adapter.getCategory: returns undefined for an orphan code (SERVICIOS)', () => {
  assert.equal(adapter.getCategory('SERVICIOS'), undefined);
});

test('adapter.getCategoryBySlug: resolves slug back to code', () => {
  const cat = adapter.getCategoryBySlug('maquinas');
  assert.ok(cat, 'getCategoryBySlug(maquinas) must return a defined summary');
  assert.equal(cat.code, 'MAQUINAS');
});

// ---------------------------------------------------------------------------
// Legacy view aliases
// ---------------------------------------------------------------------------

test('adapter.legacyView: category.title aliases category.label (backward compat)', () => {
  const first = adapter.legacyView.categories[0];
  assert.ok(first, 'legacyView.categories must contain at least one entry');
  assert.equal(first.title, first.label);
});

test('adapter.categories: items inside each entry are alphabetically sorted by display_name', () => {
  for (const cat of adapter.categories) {
    const names = cat.items.map((it) => it.display_name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'es'));
    assert.deepEqual(
      names,
      sorted,
      `category ${cat.code} items must be sorted by display_name`
    );
  }
});

// ---------------------------------------------------------------------------
// Negative path: AJV schema mismatch throws
// ---------------------------------------------------------------------------

test('AJV: malformed fixture triggers Catalog schema mismatch error', async () => {
  await assert.rejects(
    async () => {
      await loadAndValidateBadCatalog();
    },
    (err) => {
      assert.ok(err instanceof Error, 'rejection must be an Error instance');
      assert.match(err.message, /Catalog schema mismatch:/);
      return true;
    }
  );
});
