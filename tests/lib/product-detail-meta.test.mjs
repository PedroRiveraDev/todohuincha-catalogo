// tests/lib/product-detail-meta.test.mjs
// 5 TDD assertions for src/lib/product-detail-meta.ts (slice 4).
// Refs: openspec/changes/catalog-v2-ui-migration-slice-4/spec.md
//   Requirements: JSON-LD Product schema, Page metadata (SEO/GEO).

import test from 'node:test';
import assert from 'node:assert/strict';
import { adapter } from '../../src/lib/catalog.ts';
import {
  getProductMeta,
  buildProductJsonLd,
  mapAvailabilityToSchema,
} from '../../src/lib/product-detail-meta.ts';

const simple = adapter.items.find((i) => i.item_type === 'simple_product');
const machine = adapter.items.find((i) => i.item_type === 'machinery');
assert.ok(simple && machine, 'test fixture requires both item types');

test('1. Returns full meta derived from display_name and sku', () => {
  const m = getProductMeta(simple, '');
  assert.equal(m.title, `${simple.display_name} (${simple.sku}) | Todo Huincha`);
  assert.ok(m.description.length > 0 && m.description.length <= 200);
  assert.equal(m.canonicalPath, `/productos/${simple.category_code.toLowerCase()}/${simple.sku}`);
  assert.equal(m.ogImage, '/logo-todohuincha.svg');
  assert.equal(m.breadcrumb.length, 4);
});

test('2. Image is empty string when no image available; jsonLd omits the field', () => {
  const m = getProductMeta(simple, '');
  const jsonLd = buildProductJsonLd(simple, '', m);
  const product = jsonLd['@graph'].find((n) => n['@type'] === 'Product');
  assert.equal('image' in product, false, 'image field must be absent when src is empty');
});

test('3. availability maps correctly from item.status', () => {
  assert.equal(mapAvailabilityToSchema('in-stock'), 'https://schema.org/InStock');
  assert.equal(mapAvailabilityToSchema('out-of-stock'), 'https://schema.org/OutOfStock');
  assert.equal(mapAvailabilityToSchema('discontinued'), 'https://schema.org/Discontinued');
  const jsonLd = buildProductJsonLd(simple, '', getProductMeta(simple, ''));
  const product = jsonLd['@graph'].find((n) => n['@type'] === 'Product');
  assert.match(
    product.offers.availability,
    /^https:\/\/schema\.org\/(InStock|OutOfStock|Discontinued)$/,
  );
});

test('4. canonicalPath is /productos/{slug}/{sku}', () => {
  const m = getProductMeta(simple, '');
  assert.match(m.canonicalPath, /^\/productos\/[a-z0-9-]+\/.+$/);
  assert.ok(m.canonicalPath.endsWith(`/${simple.sku}`));
});

test('5. breadcrumb has exactly 4 entries: Inicio > Catalogo > {categoryLabel} > {displayName}', () => {
  const m = getProductMeta(machine, '');
  assert.equal(m.breadcrumb.length, 4);
  assert.equal(m.breadcrumb[0].name, 'Inicio');
  assert.equal(m.breadcrumb[0].url, '/');
  assert.equal(m.breadcrumb[1].name, 'Catalogo');
  assert.equal(m.breadcrumb[1].url, '/catalogo');
  assert.equal(m.breadcrumb[2].name, machine.category_label);
  assert.equal(m.breadcrumb[3].name, machine.display_name);
  assert.equal(m.breadcrumb[3].url, m.canonicalPath);
});
