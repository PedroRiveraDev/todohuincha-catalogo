// tests/lib/admin-ui-data.test.mjs
// Contract tests for admin metrics exposed to generated catalog UI.

import test from 'node:test';
import assert from 'node:assert/strict';
import { adapter } from '../../src/lib/catalog.ts';
import {
  getCatalogMetrics,
  getCategorySummaries,
  getRawCatalogMetrics,
  getRawCategorySummaries,
} from '../../src/lib/admin-ui-data.ts';

test('admin catalog metrics use adapter-backed generation counts', () => {
  assert.deepEqual(getCatalogMetrics(), {
    categories: adapter.categories.length,
    products: adapter.items.length,
    families: adapter.families.length,
  });
});

test('admin raw catalog metrics remain available for explicitly labeled source JSON totals', () => {
  const rawMetrics = getRawCatalogMetrics();

  assert.equal(rawMetrics.categories, 22);
  assert.equal(rawMetrics.products, 687);
  assert.equal(rawMetrics.families, 666);
});

test('admin category summaries use adapter-backed generated categories and counts', () => {
  const summaries = getCategorySummaries();

  assert.equal(summaries.length, adapter.categories.length);
  assert.equal(summaries.reduce((total, category) => total + category.productsCount, 0), adapter.items.length);
  assert.equal(summaries.some((category) => category.code === 'SERVICIOS'), false);
});

test('admin raw category summaries remain available separately from generated categories', () => {
  const rawSummaries = getRawCategorySummaries();

  assert.equal(rawSummaries.length, 22);
  assert.equal(rawSummaries.some((category) => category.code === 'SERVICIOS'), true);
});
