// tests/lib/auth/repo.test.mjs
// UserRepository tests using a deterministic in-memory source.

import test from 'node:test';
import assert from 'node:assert/strict';
import { UserRepository } from '../../../src/lib/auth/repo.ts';

const records = [
  {
    id: 'admin-001',
    email: 'admin@todohuincha.cl',
    display_name: 'Administrador',
    role: 'admin',
    password_hash: 'mock$abc',
    active: true,
  },
  {
    id: 'vendor-001',
    email: 'vendedor@todohuincha.cl',
    display_name: 'Vendedor',
    role: 'vendor',
    password_hash: 'mock$xyz',
    active: true,
  },
  {
    id: 'inactive-001',
    email: 'inactivo@todohuincha.cl',
    display_name: 'Inactivo',
    role: 'vendor',
    password_hash: 'mock$inactive',
    active: false,
  },
];

function buildRepo() {
  return new UserRepository(async () => records.slice());
}

test('list returns the seeded users with normalised fields', async () => {
  const repo = buildRepo();
  const list = await repo.list();
  assert.equal(list.length, 3);
  assert.equal(list[0].id, 'admin-001');
  assert.equal(list[0].email, 'admin@todohuincha.cl');
  assert.equal(list[0].role, 'admin');
  assert.equal(list[0].displayName, 'Administrador');
});

test('findByEmail matches case-insensitively and ignores whitespace', async () => {
  const repo = buildRepo();
  const admin = await repo.findByEmail('  ADMIN@todohuincha.cl  ');
  assert.ok(admin);
  assert.equal(admin.id, 'admin-001');
  assert.equal(await repo.findByEmail(''), null);
  assert.equal(await repo.findByEmail(undefined), null);
});

test('findById resolves an existing record', async () => {
  const repo = buildRepo();
  const vendor = await repo.findById('vendor-001');
  assert.ok(vendor);
  assert.equal(vendor.role, 'vendor');
  assert.equal(await repo.findById('missing'), null);
});

test('toAuthUser strips passwordHash', () => {
  const safe = UserRepository.toAuthUser({
    id: 'admin-001',
    email: 'admin@todohuincha.cl',
    displayName: 'Administrador',
    role: 'admin',
    passwordHash: 'mock$abc',
    active: true,
  });
  assert.equal(safe.id, 'admin-001');
  assert.equal((safe).passwordHash, undefined);
});

test('repo rejects empty email and unsupported role', async () => {
  const repo = new UserRepository(async () => ([
    { id: '', email: 'no-id@example.com', display_name: 'x', role: 'admin', password_hash: 'mock$x', active: true },
  ]));
  await assert.rejects(() => repo.list(), /missing id/);

  const repoRole = new UserRepository(async () => ([
    { id: 'u', email: 'role@example.com', display_name: 'x', role: 'owner', password_hash: 'mock$x', active: true },
  ]));
  await assert.rejects(() => repoRole.list(), /unsupported role/);

  const repoHash = new UserRepository(async () => ([
    { id: 'u', email: 'nohash@example.com', display_name: 'x', role: 'admin', password_hash: '', active: true },
  ]));
  await assert.rejects(() => repoHash.list(), /missing password_hash/);
});

test('repo caches the initial list', async () => {
  let calls = 0;
  const repo = new UserRepository(async () => { calls += 1; return records.slice(); });
  await repo.list();
  await repo.list();
  await repo.findByEmail('admin@todohuincha.cl');
  assert.equal(calls, 1, 'loader should only be invoked once');
  repo.reset();
  await repo.list();
  assert.equal(calls, 2, 'reset should re-invoke the loader');
});
