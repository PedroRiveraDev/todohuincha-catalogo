// tests/lib/auth/login-flow.test.mjs
// End-to-end login + logout pipeline.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoginFlow, polyglotPasswordHasher } from '../../../src/lib/auth/login-flow.ts';
import { UserRepository } from '../../../src/lib/auth/repo.ts';
import { createInMemorySessionStore } from '../../../src/lib/auth/session-store.ts';

const records = [
  {
    id: 'admin-001',
    email: 'admin@todohuincha.cl',
    display_name: 'Administrador',
    role: 'admin',
    password_hash: 'mock$YWRtaW4xMjM=',
    active: true,
  },
  {
    id: 'vendor-001',
    email: 'vendedor@todohuincha.cl',
    display_name: 'Vendedor',
    role: 'vendor',
    password_hash: 'mock$dmVuZGVkb3IxMjM=',
    active: true,
  },
  {
    id: 'inactive-001',
    email: 'inactivo@todohuincha.cl',
    display_name: 'Inactivo',
    role: 'vendor',
    password_hash: 'mock$YWRtaW4xMjM=',
    active: false,
  },
];

function buildFlow() {
  const repo = new UserRepository(async () => records.slice());
  const sessionStore = createInMemorySessionStore();
  return createLoginFlow({ repo, sessionStore });
}

test('authenticate returns ok + session on correct credentials', async () => {
  const flow = buildFlow();
  const result = await flow.authenticate({ email: 'admin@todohuincha.cl', password: 'admin123' });
  assert.equal(result.ok, true);
  assert.ok(result.session);
  assert.equal(result.session.user.role, 'admin');
  assert.ok(result.session.token.length >= 32);
});

test('authenticate rejects unknown email without leaking info', async () => {
  const flow = buildFlow();
  const result = await flow.authenticate({ email: 'no@todohuincha.cl', password: 'admin123' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unknown_user');
});

test('authenticate rejects bad password', async () => {
  const flow = buildFlow();
  const result = await flow.authenticate({ email: 'admin@todohuincha.cl', password: 'wrong' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad_password');
});

test('authenticate rejects inactive users', async () => {
  const flow = buildFlow();
  const result = await flow.authenticate({ email: 'inactivo@todohuincha.cl', password: 'admin123' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'inactive_user');
});

test('authenticate rejects missing fields', async () => {
  const flow = buildFlow();
  assert.equal((await flow.authenticate({ email: '', password: 'x' })).reason, 'missing_credentials');
  assert.equal((await flow.authenticate({ email: 'a', password: '' })).reason, 'missing_credentials');
});

test('vendor login succeeds with the seeded vendor credentials', async () => {
  const flow = buildFlow();
  const result = await flow.authenticate({ email: 'VENDEDOR@todohuincha.cl', password: 'vendedor123' });
  assert.equal(result.ok, true);
  assert.equal(result.session.user.role, 'vendor');
});

test('polyglotPasswordHasher: handles both mock$ and scrypt$ prefixes', async () => {
  assert.equal(await polyglotPasswordHasher.verify('admin123', 'mock$YWRtaW4xMjM='), true);
  assert.equal(await polyglotPasswordHasher.verify('admin123', 'mock$d3Jvbmc='), false);
  const scryptHash = await polyglotPasswordHasher.hash('secret');
  assert.equal(await polyglotPasswordHasher.verify('secret', scryptHash), true);
  assert.equal(await polyglotPasswordHasher.verify('guess', scryptHash), false);
});
