// tests/lib/category-grouping.test.mjs
// Pure helpers for grouping categories and sorting items by display_name.
// Slice 2 of catalog-v2-ui-migration. 6 assertions.
//
// Refs:
//   openspec/changes/catalog-v2-ui-migration-slice-2/spec.md
//   openspec/changes/catalog-v2-ui-migration-slice-2/design.md (section 3)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_GROUP_ORDER,
  groupCategoriesByGroup,
  sortItemsByDisplayName,
} from '../../src/lib/categories.ts';
import { adapter } from '../../src/lib/catalog.ts';

// ---------------------------------------------------------------------------
// CATEGORY_GROUP_ORDER (1 assertion)
// ---------------------------------------------------------------------------

test('CATEGORY_GROUP_ORDER: 8 entries in fixed sierras -> instrumentos order', () => {
  assert.deepEqual(
    [...CATEGORY_GROUP_ORDER],
    [
      'sierras',
      'consumibles',
      'cuchillos',
      'herramientas',
      'materiales',
      'servicios',
      'maquinaria',
      'instrumentos',
    ]
  );
});

// ---------------------------------------------------------------------------
// groupCategoriesByGroup (2 assertions)
// ---------------------------------------------------------------------------

test('groupCategoriesByGroup: empty input returns empty Map', () => {
  const result = groupCategoriesByGroup([]);
  assert.ok(result instanceof Map);
  assert.equal(result.size, 0);
});

test('groupCategoriesByGroup: 21 categories from adapter collapse into 8 groups', () => {
  const result = groupCategoriesByGroup(adapter.categories);
  assert.equal(result.size, 8);
  // Map insertion order MUST match CATEGORY_GROUP_ORDER
  const keys = [...result.keys()];
  assert.deepEqual(keys, [...CATEGORY_GROUP_ORDER]);
});

// ---------------------------------------------------------------------------
// sortItemsByDisplayName (3 assertions)
// ---------------------------------------------------------------------------

test('sortItemsByDisplayName: empty array returns empty array', () => {
  assert.deepEqual(sortItemsByDisplayName([]), []);
});

test('sortItemsByDisplayName: unordered names sort alphabetically', () => {
  const items = [
    { display_name: 'z' },
    { display_name: 'a' },
    { display_name: 'm' },
  ];
  const sorted = sortItemsByDisplayName(items);
  assert.deepEqual(
    sorted.map((it) => it.display_name),
    ['a', 'm', 'z']
  );
});

test('sortItemsByDisplayName: Spanish accented names follow es-locale collation', () => {
  // Spanish locale: accents and case are secondary (sensitivity: 'base').
  // 'Á' has primary letter 'a', so it groups with 'a' < 'b' < 'z'.
  const items = [
    { display_name: 'zapato' },
    { display_name: 'Águila' },
    { display_name: 'banana' },
  ];
  const sorted = sortItemsByDisplayName(items);
  const names = sorted.map((it) => it.display_name);
  assert.deepEqual(names, ['Águila', 'banana', 'zapato']);
});