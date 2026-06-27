// tests/lib/pdf-types.test.mjs
// Tests for src/lib/pdf-types.ts (slice pdf-catalog-v2).
// Refs:
//   docs/INVENTARIO_CATEGORIAS.md
//   openspec/changes/pdf-catalog-v2/spec.md

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDensity,
  countSpecRows,
  countFeatures,
  hasImage,
} from '../../src/lib/pdf-types.ts';

// ---------------------------------------------------------------------------
// countSpecRows
// ---------------------------------------------------------------------------

test('countSpecRows: 0 when no machinery_profile', () => {
  assert.equal(countSpecRows({}), 0);
  assert.equal(countSpecRows({ machinery_profile: null }), 0);
});

test('countSpecRows: sums values across all groups', () => {
  const item = {
    machinery_profile: {
      specification_groups: [
        { values: [{ label: 'a' }, { label: 'b' }] },
        { values: [{ label: 'c' }] },
        { values: [] },
        { values: [{ label: 'd' }, { label: 'e' }, { label: 'f' }] },
      ],
    },
  };
  assert.equal(countSpecRows(item), 6);
});

// ---------------------------------------------------------------------------
// countFeatures
// ---------------------------------------------------------------------------

test('countFeatures: 0 when no features', () => {
  assert.equal(countFeatures({}), 0);
  assert.equal(countFeatures({ machinery_profile: { features: [] } }), 0);
});

test('countFeatures: counts array length', () => {
  const item = {
    machinery_profile: {
      features: ['a', 'b', 'c', 'd', 'e'],
    },
  };
  assert.equal(countFeatures(item), 5);
});

// ---------------------------------------------------------------------------
// classifyDensity
// ---------------------------------------------------------------------------

test('classifyDensity: denso when >=5 spec rows', () => {
  const item = {
    machinery_profile: {
      specification_groups: [
        { values: [{}, {}, {}, {}, {}] },
      ],
    },
  };
  assert.equal(classifyDensity(item), 'denso');
});

test('classifyDensity: denso when >=4 features', () => {
  const item = {
    machinery_profile: {
      features: ['a', 'b', 'c', 'd'],
    },
  };
  assert.equal(classifyDensity(item), 'denso');
});

test('classifyDensity: medio when 1-4 spec rows', () => {
  const item = {
    machinery_profile: {
      specification_groups: [
        { values: [{}, {}] },
      ],
    },
  };
  assert.equal(classifyDensity(item), 'medio');
});

test('classifyDensity: medio when 1-3 features', () => {
  const item = {
    machinery_profile: {
      features: ['a', 'b', 'c'],
    },
  };
  assert.equal(classifyDensity(item), 'medio');
});

test('classifyDensity: compacto when no structured data', () => {
  assert.equal(classifyDensity({}), 'compacto');
  assert.equal(classifyDensity({ display_name: 'X', sku: 'Y' }), 'compacto');
});

test('classifyDensity: compacto overrides machinery_profile emptiness', () => {
  // machinery item with no profile populated -> compacto
  const item = { item_type: 'machinery', display_name: 'AFILADORA', sku: '2283I' };
  assert.equal(classifyDensity(item), 'compacto');
});

test('classifyDensity: null/undefined item throws', () => {
  assert.throws(() => classifyDensity(null), /item/);
  assert.throws(() => classifyDensity(undefined), /item/);
});

// ---------------------------------------------------------------------------
// hasImage
// ---------------------------------------------------------------------------

test('hasImage: false when no assets', () => {
  assert.equal(hasImage({}), false);
  assert.equal(hasImage(null), false);
});

test('hasImage: true when main_image has url', () => {
  assert.equal(
    hasImage({ assets: { main_image: { url: '/products/2284I.png' } } }),
    true
  );
});

test('hasImage: true when main_image has data_base64', () => {
  assert.equal(
    hasImage({ assets: { main_image: { data_base64: 'data:image/png;base64,xxx' } } }),
    true
  );
});

test('hasImage: true when gallery has any image', () => {
  assert.equal(
    hasImage({ assets: { gallery: [{ url: '/foo.png' }] } }),
    true
  );
});

test('hasImage: false when all sources empty', () => {
  assert.equal(
    hasImage({ assets: { main_image: null, gallery: [] } }),
    false
  );
});