// tests/lib/category-meta.test.mjs
// 6 TDD assertions for src/lib/category-meta.ts (slice 3).
// Refs: openspec/changes/catalog-v2-ui-migration-slice-3/spec.md
//   Requirement: category metadata helper

import test from 'node:test';
import assert from 'node:assert/strict';
import { getCategoryMeta } from '../../src/lib/category-meta.ts';
import { adapter } from '../../src/lib/catalog.ts';

const KNOWN_SLUG = adapter.categories[0].slug;
const KNOWN_LABEL = adapter.categories[0].label;

test('1. Known slug returns full meta derived from category.label', () => {
  const meta = getCategoryMeta(KNOWN_SLUG);
  assert.equal(meta.title, `${KNOWN_LABEL} | Todo Huincha`);
  assert.ok(meta.description.length > 0);
  assert.equal(meta.canonicalPath, `/catalogo/${KNOWN_SLUG}`);
  assert.equal(meta.breadcrumb.length, 3);
});

test('2. Unknown slug returns fallback without throwing', () => {
  assert.doesNotThrow(() => getCategoryMeta('__nonexistent__'));
  const meta = getCategoryMeta('__nonexistent__');
  assert.equal(meta.canonicalPath, '/catalogo/__nonexistent__');
  assert.ok(meta.title.length > 0 && meta.description.length > 0);
  assert.equal(meta.breadcrumb.length, 3);
});

test('3. canonicalPath always starts with /catalogo/', () => {
  for (const slug of [KNOWN_SLUG, '__unknown__', '']) {
    assert.ok(
      getCategoryMeta(slug).canonicalPath.startsWith('/catalogo/'),
      `slug=${slug} canonicalPath=${getCategoryMeta(slug).canonicalPath}`
    );
  }
});

test('4. breadcrumb always has exactly 3 entries', () => {
  for (const slug of [KNOWN_SLUG, '__unknown__', '']) {
    assert.equal(getCategoryMeta(slug).breadcrumb.length, 3);
  }
});

test('5. title is human-readable Spanish (no kebab-case)', () => {
  const meta = getCategoryMeta(KNOWN_SLUG);
  const titleBody = meta.title.replace(' | Todo Huincha', '');
  assert.ok(!titleBody.includes('-'),
    `title body must not contain kebab-case: "${titleBody}"`);
  assert.ok(meta.title.endsWith('| Todo Huincha'));
});

test('6. ogImage falls back to /logo-todohuincha.svg (no per-category image yet)', () => {
  // v2 adapter does not expose per-category hero images (slice 5 deferred).
  // Brand logo is the safe OpenGraph fallback so cards never break.
  assert.equal(getCategoryMeta(KNOWN_SLUG).ogImage, '/logo-todohuincha.svg');
  assert.equal(getCategoryMeta('__unknown__').ogImage, '/logo-todohuincha.svg');
});