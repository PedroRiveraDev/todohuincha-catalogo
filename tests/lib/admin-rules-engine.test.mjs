// tests/lib/admin-rules-engine.test.mjs
// Tests for src/lib/admin-rules-engine.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateExpression,
  compileRule,
  resolveTemplateForItem,
} from '../../src/lib/admin-rules-engine.ts';

// ---------------------------------------------------------------------------
// validateExpression
// ---------------------------------------------------------------------------

test('validateExpression: true is valid', () => {
  assert.equal(validateExpression('true'), null);
});

test('validateExpression: simple property access', () => {
  assert.equal(validateExpression('item.sku'), null);
});

test('validateExpression: comparison', () => {
  assert.equal(validateExpression('item.x === 1'), null);
  assert.equal(validateExpression('item.x !== "abc"'), null);
});

test('validateExpression: logical operators', () => {
  assert.equal(validateExpression('item.a && item.b'), null);
  assert.equal(validateExpression('item.a || item.b'), null);
  assert.equal(validateExpression('!item.a'), null);
});

test('validateExpression: parens and precedence', () => {
  assert.equal(
    validateExpression('(item.a || item.b) && item.c.length >= 3'),
    null
  );
});

test('validateExpression: ternary expression', () => {
  assert.equal(validateExpression('item.featured ? "hero" : "standard"'), null);
});

test('validateExpression: rejects function calls', () => {
  assert.notEqual(validateExpression('item.foo()'), null);
});

test('validateExpression: rejects assignment', () => {
  assert.notEqual(validateExpression('item.foo = 1'), null);
});

test('validateExpression: rejects eval', () => {
  assert.notEqual(validateExpression('eval("malicious")'), null);
});

test('validateExpression: rejects timer-like globals', () => {
  assert.notEqual(validateExpression('setTimeout("malicious")'), null);
});

test('validateExpression: rejects invalid number literals', () => {
  assert.match(validateExpression('item.x === 1.2.3'), /invalid number/);
  assert.match(validateExpression('item.x === 1.'), /invalid number/);
});

// ---------------------------------------------------------------------------
// compileRule
// ---------------------------------------------------------------------------

const ctx = {
  item: {
    sku: '2200I',
    category_label: 'Maquinas',
    machinery_profile: {
      specification_groups: [{}, {}, {}, {}, {}],
      features: ['a', 'b', 'c', 'd'],
    },
  },
};

test('compileRule: true always passes', () => {
  const r = compileRule({ id: 't', when: 'true', then: { block: 'denso' } });
  assert.equal(r({ item: {} }), true);
});

test('compileRule: false always fails', () => {
  const r = compileRule({ id: 'f', when: 'false', then: { block: 'denso' } });
  assert.equal(r({ item: {} }), false);
});

test('compileRule: machinery with 5 groups -> denso', () => {
  const r = compileRule({
    id: 'denso',
    when:
      'item.machinery_profile && item.machinery_profile.specification_groups && item.machinery_profile.specification_groups.length >= 5',
    then: { block: 'denso' },
  });
  assert.equal(r(ctx), true);
});

test('compileRule: machinery with 0 groups -> not denso', () => {
  const r = compileRule({
    id: 'denso',
    when:
      'item.machinery_profile && item.machinery_profile.specification_groups && item.machinery_profile.specification_groups.length >= 5',
    then: { block: 'denso' },
  });
  const ctxEmpty = { item: { machinery_profile: { specification_groups: [] } } };
  assert.equal(r(ctxEmpty), false);
});

test('compileRule: comparison with strings', () => {
  const r = compileRule({
    id: 'is_maquinas',
    when: 'item.category_label === "Maquinas"',
    then: { show_badge: 'MAQUINARIA' },
  });
  assert.equal(r(ctx), true);
});

test('compileRule: features length check', () => {
  const r = compileRule({
    id: 'has_features',
    when:
      'item.machinery_profile && item.machinery_profile.features && item.machinery_profile.features.length > 0',
    then: { block: 'medio' },
  });
  assert.equal(r(ctx), true);
});

test('compileRule: ternary result is evaluated safely', () => {
  const r = compileRule({
    id: 'ternary',
    when: 'item.category_label === "Maquinas" ? item.machinery_profile.features.length > 0 : false',
    then: { block: 'medio' },
  });
  assert.equal(r(ctx), true);
});

test('compileRule: crashes gracefully on bad input', () => {
  const r = compileRule({
    id: 'maybe',
    when: 'item.deeply.nested.property.exists',
    then: { block: 'denso' },
  });
  // Should not throw, should return undefined -> falsy
  assert.equal(r({ item: {} }), false);
});

test('compileRule: member lookup ignores prototype properties', () => {
  const pollutedItem = Object.create({ isAdmin: true });
  const r = compileRule({
    id: 'own-properties-only',
    when: 'item.isAdmin === true',
    then: { block: 'denso' },
  });

  assert.equal(r({ item: pollutedItem }), false);
});

test('compileRule: root identifier lookup ignores prototype properties', () => {
  const pollutedCtx = Object.create({ count: 7 });
  const r = compileRule({
    id: 'own-root-properties-only',
    when: 'count === 7',
    then: { block: 'denso' },
  });

  assert.equal(r(pollutedCtx), false);
});

test('compileRule: root item lookup ignores inherited ctx.item', () => {
  const pollutedCtx = Object.create({ item: { isAdmin: true } });
  const r = compileRule({
    id: 'own-root-item-only',
    when: 'item.isAdmin === true',
    then: { block: 'denso' },
  });

  assert.equal(r(pollutedCtx), false);
});

test('compileRule: raw item objects still work for direct evaluation', () => {
  const r = compileRule({
    id: 'raw-item-direct-evaluation',
    when: 'item.isAdmin === true',
    then: { block: 'denso' },
  });

  assert.equal(r({ isAdmin: true }), true);
});

test('compileRule: own properties still satisfy rules', () => {
  const item = Object.create({ isAdmin: false });
  item.isAdmin = true;
  const r = compileRule({
    id: 'own-property',
    when: 'item.isAdmin === true',
    then: { block: 'denso' },
  });

  assert.equal(r({ item }), true);
});

// ---------------------------------------------------------------------------
// resolveTemplateForItem
// ---------------------------------------------------------------------------

test('resolveTemplateForItem: returns first matching rule', () => {
  const rules = [
    { id: 'a', when: 'item.x === 1', then: { block: 'denso' } },
    { id: 'b', when: 'item.x === 2', then: { block: 'medio' } },
  ];
  assert.deepEqual(resolveTemplateForItem(rules, { item: { x: 1 } }), { block: 'denso' });
  assert.deepEqual(resolveTemplateForItem(rules, { item: { x: 2 } }), { block: 'medio' });
  assert.equal(resolveTemplateForItem(rules, { item: { x: 99 } }), null);
});

test('resolveTemplateForItem: accepts a raw item object', () => {
  const rules = [
    { id: 'a', when: 'item.x === 1', then: { block: 'denso' } },
  ];
  assert.deepEqual(resolveTemplateForItem(rules, { x: 1 }), { block: 'denso' });
});

test('resolveTemplateForItem: skips rules that fail to compile', () => {
  const rules = [
    { id: 'broken', when: 'this is invalid ((', then: { block: 'denso' } },
    { id: 'works', when: 'item.x === 1', then: { block: 'medio' } },
  ];
  assert.deepEqual(
    resolveTemplateForItem(rules, { item: { x: 1 } }),
    { block: 'medio' }
  );
});
