// tests/lib/auth/password-hash.test.mjs
// Unit tests for the password-hash helpers.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mockPasswordHasher,
  scryptPasswordHasher,
  isMockEncodedHash,
  isScryptEncodedHash,
} from '../../../src/lib/auth/password-hash.ts';
import { polyglotPasswordHasher } from '../../../src/lib/auth/login-flow.ts';

test('mock hasher: hashes deterministically and verifies roundtrip', async () => {
  const encoded = mockPasswordHasher.hash('admin123');
  assert.equal(mockPasswordHasher.verify('admin123', encoded), true);
  assert.equal(mockPasswordHasher.verify('admin124', encoded), false);
  assert.equal(mockPasswordHasher.verify('', encoded), false);
});

test('mock hasher: empty/missing inputs return false', async () => {
  assert.equal(mockPasswordHasher.verify('admin', 'not-encoded'), false);
  assert.equal(mockPasswordHasher.verify('admin', ''), false);
});

test('scrypt hasher: hashes are non-deterministic and verify same password', async () => {
  const a = await scryptPasswordHasher.hash('admin123');
  const b = await scryptPasswordHasher.hash('admin123');
  assert.notEqual(a, b);
  assert.equal(await scryptPasswordHasher.verify('admin123', a), true);
  assert.equal(await scryptPasswordHasher.verify('admin123', b), true);
  assert.equal(await scryptPasswordHasher.verify('wrong', a), false);
});

test('polyglot hasher: dispatches to mock branch on mock$ prefix', async () => {
  const mockEncoded = mockPasswordHasher.hash('admin123');
  assert.equal(await polyglotPasswordHasher.verify('admin123', mockEncoded), true);
  assert.equal(await polyglotPasswordHasher.verify('wrong', mockEncoded), false);
});

test('polyglot hasher: dispatches to scrypt branch on scrypt$ prefix', async () => {
  const real = await scryptPasswordHasher.hash('admin123');
  assert.equal(isScryptEncodedHash(real), true);
  assert.equal(await polyglotPasswordHasher.verify('admin123', real), true);
  assert.equal(await polyglotPasswordHasher.verify('wrong', real), false);
});

test('hash format checks', () => {
  assert.equal(isMockEncodedHash('mock$abc'), true);
  assert.equal(isScryptEncodedHash('mock$abc'), false);
  assert.equal(isScryptEncodedHash('scrypt$16384$8$1$salt$hash'), true);
  assert.equal(isMockEncodedHash('scrypt$16384$8$1$salt$hash'), false);
});
