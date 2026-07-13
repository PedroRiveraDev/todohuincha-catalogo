// tests/lib/auth/demo-credentials.test.mjs
// Tests for the demo-credentials source of truth: defaults, env overrides,
// and the user-record builder that feeds the UserRepository.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_USERS,
  DEMO_ENV_KEYS,
  buildDemoUserRecords,
  getDemoCredentials,
} from '../../../src/lib/auth/demo-credentials.ts';
import { mockPasswordHasher, scryptPasswordHasher } from '../../../src/lib/auth/password-hash.ts';

test('default demo credentials expose admin + vendor with stable non-secret values', () => {
  assert.equal(DEMO_USERS.length, 2);
  const admin = DEMO_USERS[0];
  const vendor = DEMO_USERS[1];
  assert.equal(admin.role, 'admin');
  assert.equal(admin.email, 'admin@todohuincha.cl');
  assert.equal(admin.password, 'admin123');
  assert.equal(admin.active, true);
  assert.equal(vendor.role, 'vendor');
  assert.equal(vendor.email, 'vendedor@todohuincha.cl');
  assert.equal(vendor.password, 'vendedor123');
  assert.equal(vendor.active, true);
});

test('getDemoCredentials returns the defaults when no env overrides are present', () => {
  const empty = {};
  const creds = getDemoCredentials(empty);
  assert.deepEqual(
    creds.map((c) => ({ id: c.id, email: c.email, password: c.password, role: c.role })),
    [
      { id: 'admin-001', email: 'admin@todohuincha.cl', password: 'admin123', role: 'admin' },
      { id: 'vendor-001', email: 'vendedor@todohuincha.cl', password: 'vendedor123', role: 'vendor' },
    ]
  );
});

test('getDemoCredentials applies env overrides per role and ignores empty strings', () => {
  const creds = getDemoCredentials({
    [DEMO_ENV_KEYS.adminEmail]: 'demo-admin@example.test',
    [DEMO_ENV_KEYS.adminPassword]: 'demo-admin-pass',
    [DEMO_ENV_KEYS.vendorEmail]: '',
    [DEMO_ENV_KEYS.vendorPassword]: 'demo-vendor-pass',
  });
  assert.equal(creds[0].email, 'demo-admin@example.test');
  assert.equal(creds[0].password, 'demo-admin-pass');
  // Empty string is treated as "not set" — the default value stays.
  assert.equal(creds[1].email, 'vendedor@todohuincha.cl');
  assert.equal(creds[1].password, 'demo-vendor-pass');
});

test('buildDemoUserRecords hashes passwords via the existing mockPasswordHasher', () => {
  const records = buildDemoUserRecords();
  assert.equal(records.length, 2);
  for (const record of records) {
    assert.ok(record.password_hash.startsWith('mock$'), 'password_hash must use the mock sentinel');
  }
  const adminRecord = records.find((r) => r.role === 'admin');
  const vendorRecord = records.find((r) => r.role === 'vendor');
  assert.ok(adminRecord && vendorRecord);
  assert.equal(
    mockPasswordHasher.verify('admin123', adminRecord.password_hash),
    true,
    'admin hash must verify with mockPasswordHasher against the default password'
  );
  assert.equal(
    mockPasswordHasher.verify('vendedor123', vendorRecord.password_hash),
    true,
    'vendor hash must verify with mockPasswordHasher against the default password'
  );
  assert.equal(
    mockPasswordHasher.verify('wrong', adminRecord.password_hash),
    false
  );
});

test('buildDemoUserRecords never produces a real scrypt hash', () => {
  // Real scrypt runs are too expensive to bake in; the demo path MUST
  // stay on the deterministic mock sentinel.
  const records = buildDemoUserRecords();
  for (const record of records) {
    assert.ok(record.password_hash.startsWith('mock$'));
    assert.ok(!record.password_hash.startsWith('scrypt$'));
  }
});

test('buildDemoUserRecords reflects env overrides passed via getDemoCredentials', async () => {
  const creds = getDemoCredentials({
    [DEMO_ENV_KEYS.adminPassword]: 'override-admin',
  });
  const records = buildDemoUserRecords(creds);
  const admin = records.find((r) => r.role === 'admin');
  assert.ok(admin);
  assert.equal(
    mockPasswordHasher.verify('override-admin', admin.password_hash),
    true
  );
  // Real scrypt must NOT accept the mock-encoded hash.
  assert.equal(
    await scryptPasswordHasher.verify('override-admin', admin.password_hash),
    false
  );
});
