// tests/lib/auth/session-context.test.mjs
// Resolution pipeline tests using an in-memory store.

import test from 'node:test';
import assert from 'node:assert/strict';
import { UserRepository } from '../../../src/lib/auth/repo.ts';
import {
  createBackingStore,
  createSessionContext,
  resolveSessionFromRequest,
} from '../../../src/lib/auth/session-context.ts';
import { SESSION_COOKIE_NAME } from '../../../src/lib/auth/session-store.ts';

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
];

function buildContext() {
  const repo = new UserRepository(async () => records.slice());
  const backing = createBackingStore(repo);
  const ctx = createSessionContext({ repo: backing.repo, liveTokens: backing.liveTokens });
  return { ctx, backing };
}

test('resolveFromToken returns the live session data', async () => {
  const { ctx, backing } = buildContext();
  const session = ctx.issueSessionFor({
    id: 'admin-001', email: 'admin@todohuincha.cl', displayName: 'Administrador', role: 'admin', active: true,
  });
  const resolved = ctx.resolveFromToken(session.token);
  assert.ok(resolved);
  assert.equal(resolved.userId, 'admin-001');
  const hydrated = await ctx.hydrateSession(resolved);
  assert.ok(hydrated);
  assert.equal(hydrated.user.role, 'admin');
});

test('resolveFromToken returns null when the token is unknown or empty', () => {
  const { ctx } = buildContext();
  assert.equal(ctx.resolveFromToken(''), null);
  assert.equal(ctx.resolveFromToken('not-in-map'), null);
});

test('revokeToken removes the entry from the backing store', () => {
  const { ctx, backing } = buildContext();
  const session = ctx.issueSessionFor({
    id: 'admin-001', email: 'admin@todohuincha.cl', displayName: 'Administrador', role: 'admin', active: true,
  });
  assert.ok(backing.liveTokens.has(session.token));
  ctx.revokeToken(session.token);
  assert.equal(backing.liveTokens.has(session.token), false);
  ctx.revokeToken(null);
  ctx.revokeToken(undefined);
});

test('hydrateSession ignores inactive users', async () => {
  const { ctx } = buildContext();
  const inactive = ctx.issueSessionFor({
    id: 'inactive-001', email: 'inactivo@todohuincha.cl', displayName: 'Inactivo', role: 'vendor', active: false,
  });
  const resolved = ctx.resolveFromToken(inactive.token);
  // The token resolution is happy (it doesn't know activity yet).
  assert.ok(resolved);
  // Hydration should null it because the repo record is inactive.
  const hydrated = await ctx.hydrateSession(resolved);
  assert.equal(hydrated, null);
});

test('resolveSessionFromRequest returns null without cookie', async () => {
  const { backing } = buildContext();
  const request = new Request('http://localhost/admin', { headers: {} });
  const session = await resolveSessionFromRequest(request, backing);
  assert.equal(session, null);
});

test('resolveSessionFromRequest returns null when token has no user mapping', async () => {
  const { backing } = buildContext();
  const request = new Request('http://localhost/admin', {
    headers: { cookie: `${SESSION_COOKIE_NAME}=ghost-token` },
  });
  const session = await resolveSessionFromRequest(request, backing);
  assert.equal(session, null);
});

test('resolveSessionFromRequest returns the user when cookie + mapping are valid', async () => {
  const { backing, ctx } = buildContext();
  const issued = ctx.issueSessionFor({
    id: 'vendor-001', email: 'vendedor@todohuincha.cl', displayName: 'Vendedor', role: 'vendor', active: true,
  });
  const request = new Request('http://localhost/vendor', {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${issued.token}` },
  });
  const session = await resolveSessionFromRequest(request, backing);
  assert.ok(session);
  assert.equal(session.user.role, 'vendor');
  assert.equal(session.user.email, 'vendedor@todohuincha.cl');
});
