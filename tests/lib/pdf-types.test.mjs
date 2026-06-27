// tests/lib/pdf-types.test.mjs
// Tests for src/lib/pdf-types.ts (slice pdf-catalog-v2).
// Refs:
//   openspec/changes/pdf-catalog-v2/spec.md (Requirement: per-type template dispatcher)
//   openspec/changes/pdf-catalog-v2/design.md (section 2.2, 4.4)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMachinerySheet,
  isCompactRow,
  isServiceCard,
  dispatchItemKind,
} from '../../src/lib/pdf-types.ts';

// ---------------------------------------------------------------------------
// isMachinerySheet
// ---------------------------------------------------------------------------

test('isMachinerySheet: true when item_type === "machinery"', () => {
  assert.equal(
    isMachinerySheet({ item_type: 'machinery' }),
    true
  );
});

test('isMachinerySheet: false for non-machinery types', () => {
  for (const t of ['simple_product', 'spare_part', 'service']) {
    assert.equal(isMachinerySheet({ item_type: t }), false);
  }
});

test('isMachinerySheet: false when item_type missing', () => {
  assert.equal(isMachinerySheet({}), false);
});

// ---------------------------------------------------------------------------
// isCompactRow
// ---------------------------------------------------------------------------

test('isCompactRow: true for simple_product', () => {
  assert.equal(isCompactRow({ item_type: 'simple_product' }), true);
});

test('isCompactRow: true for spare_part', () => {
  assert.equal(isCompactRow({ item_type: 'spare_part' }), true);
});

test('isCompactRow: false for machinery and service', () => {
  assert.equal(isCompactRow({ item_type: 'machinery' }), false);
  assert.equal(isCompactRow({ item_type: 'service' }), false);
});

// ---------------------------------------------------------------------------
// isServiceCard
// ---------------------------------------------------------------------------

test('isServiceCard: true only when item_type === "service"', () => {
  assert.equal(isServiceCard({ item_type: 'service' }), true);
  assert.equal(isServiceCard({ item_type: 'machinery' }), false);
  assert.equal(isServiceCard({ item_type: 'simple_product' }), false);
  assert.equal(isServiceCard({ item_type: 'spare_part' }), false);
});

// ---------------------------------------------------------------------------
// dispatchItemKind
// ---------------------------------------------------------------------------

test('dispatchItemKind: routes machinery to "machinery"', () => {
  assert.equal(dispatchItemKind({ item_type: 'machinery' }), 'machinery');
});

test('dispatchItemKind: routes simple_product to "compact_row"', () => {
  assert.equal(dispatchItemKind({ item_type: 'simple_product' }), 'compact_row');
});

test('dispatchItemKind: routes spare_part to "compact_row"', () => {
  assert.equal(dispatchItemKind({ item_type: 'spare_part' }), 'compact_row');
});

test('dispatchItemKind: routes service to "service_card"', () => {
  assert.equal(dispatchItemKind({ item_type: 'service' }), 'service_card');
});

test('dispatchItemKind: null/missing item_type falls back to "compact_row"', () => {
  assert.equal(dispatchItemKind({}), 'compact_row');
  assert.equal(dispatchItemKind({ item_type: 'weird' }), 'compact_row');
});

// ---------------------------------------------------------------------------
// Defensive null safety
// ---------------------------------------------------------------------------

test('dispatchItemKind: machinery with missing machinery_profile still routes correctly', () => {
  // Spec scenario "missing machinery_profile does not throw": the
  // dispatcher must not crash when the machinery profile is absent.
  // The guard is purely on item.item_type, not on profile presence.
  const item = { item_type: 'machinery' };
  assert.equal(item.machinery_profile, undefined);
  assert.equal(dispatchItemKind(item), 'machinery');
  assert.equal(isMachinerySheet(item), true);
});

test('dispatchItemKind: null item throws (caller invariant)', () => {
  assert.throws(() => dispatchItemKind(null), /item/);
  assert.throws(() => dispatchItemKind(undefined), /item/);
});