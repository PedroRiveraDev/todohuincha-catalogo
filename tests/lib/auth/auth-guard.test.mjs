// tests/lib/auth/auth-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasRole,
  isAdminRole,
  isVendorRole,
  requireAdmin,
  requireAnyAuth,
  requireRole,
  requireVendor,
} from '../../../src/lib/auth/auth-guard.ts';

const admin = { id: 'a', email: 'a@example.com', displayName: 'a', role: 'admin', active: true };
const vendor = { id: 'v', email: 'v@example.com', displayName: 'v', role: 'vendor', active: true };
const inactive = { id: 'x', email: 'x@example.com', displayName: 'x', role: 'admin', active: false };

test('hasRole matches allowed roles and ignores inactive users', () => {
  assert.equal(hasRole(admin, 'admin'), true);
  assert.equal(hasRole(admin, 'vendor'), false);
  assert.equal(hasRole(vendor, 'vendor'), true);
  assert.equal(hasRole(vendor, 'admin'), false);
  assert.equal(hasRole(inactive, 'admin'), false);
  assert.equal(hasRole(null, 'admin'), false);
});

test('isAdminRole / isVendorRole narrow correctly', () => {
  assert.equal(isAdminRole(admin), true);
  assert.equal(isAdminRole(vendor), false);
  assert.equal(isVendorRole(vendor), true);
  assert.equal(isVendorRole(admin), false);
});

test('requireRole rejects unknown users with structured reason', () => {
  const result = requireRole(null, 'admin');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unauthenticated');
});

test('requireRole rejects inactive users', () => {
  const result = requireRole(inactive, 'admin');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unauthenticated');
});

test('requireRole rejects role mismatch with insufficient_role reason', () => {
  const result = requireRole(vendor, 'admin');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient_role');
});

test('requireRole accepts a matching role', () => {
  const result = requireRole(admin, 'admin');
  assert.equal(result.ok, true);
  assert.equal(result.user.id, admin.id);
});

test('requireAdmin / requireVendor helpers wrap requireRole', () => {
  assert.equal(requireAdmin(admin).ok, true);
  assert.equal(requireAdmin(vendor).ok, false);
  assert.equal(requireVendor(vendor).ok, true);
  assert.equal(requireVendor(admin).ok, false);
});

test('requireAnyAuth: any active user is ok', () => {
  assert.equal(requireAnyAuth(admin).ok, true);
  assert.equal(requireAnyAuth(vendor).ok, true);
  assert.equal(requireAnyAuth(null).ok, false);
  assert.equal(requireAnyAuth(inactive).ok, false);
});
