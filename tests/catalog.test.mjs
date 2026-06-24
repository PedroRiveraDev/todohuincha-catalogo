import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../src/data/catalogo_productos.json' with { type: 'json' };

test('source catalog has 683 rows grouped in 21 categories', () => {
  const total = catalog.categories.reduce((sum, category) => sum + category.products.length, 0);
  assert.equal(catalog.total_products, 683);
  assert.equal(catalog.total_categories, 21);
  assert.equal(total, catalog.total_products);
});

test('source catalog exposes six duplicated category/reference rows to normalize', () => {
 const keys = catalog.categories.flatMap((category) => category.products.map((product) => `${category.slug}/${product.internal_reference}`));
 assert.equal(keys.length - new Set(keys).size, 6);
});
