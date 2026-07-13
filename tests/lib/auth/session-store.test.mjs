// tests/lib/auth/session-store.test.mjs
// Cookie + session-store helpers.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_COOKIE_NAME,
  createInMemorySessionStore,
  parseCookieHeader,
} from '../../../src/lib/auth/session-store.ts';

const sampleUser = {
  id: 'admin-001',
  email: 'admin@todohuincha.cl',
  displayName: 'Administrador',
  role: 'admin',
  active: true,
};

test('parseCookieHeader: returns null on null/empty', () => {
  assert.equal(parseCookieHeader(null, SESSION_COOKIE_NAME), null);
  assert.equal(parseCookieHeader('', SESSION_COOKIE_NAME), null);
});

test('parseCookieHeader: parses single cookie', () => {
  assert.equal(parseCookieHeader(`${SESSION_COOKIE_NAME}=abcdef`, SESSION_COOKIE_NAME), 'abcdef');
});

test('parseCookieHeader: parses multiple cookies', () => {
  const header = `other=ignored; ${SESSION_COOKIE_NAME}=xyz; last=after`;
  assert.equal(parseCookieHeader(header, SESSION_COOKIE_NAME), 'xyz');
});

test('parseCookieHeader: ignores malformed entries', () => {
  assert.equal(parseCookieHeader('no-equals', SESSION_COOKIE_NAME), null);
  assert.equal(parseCookieHeader('=value-without-key', SESSION_COOKIE_NAME), null);
});

test('buildSetCookie: includes HttpOnly + SameSite=Strict + Path=/ + Max-Age', () => {
  const store = createInMemorySessionStore();
  const session = store.mintSession(sampleUser);
  const cookie = store.buildSetCookie(session);
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=/);
  assert.doesNotMatch(cookie, /Secure/);
});

test('buildSetCookie: production builds include Secure flag', () => {
  const store = createInMemorySessionStore();
  const session = store.mintSession(sampleUser);
  const cookie = store.buildSetCookie(session, { isProduction: true });
  assert.match(cookie, /Secure/);
});

test('buildClearCookie: sets Max-Age=0', () => {
  const store = createInMemorySessionStore();
  const cookie = store.buildClearCookie();
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=;`));
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
});

test('mintSession: token is unique per session', () => {
  const store = createInMemorySessionStore();
  const a = store.mintSession(sampleUser);
  const b = store.mintSession(sampleUser);
  assert.ok(a.token.length >= 32);
  assert.notEqual(a.token, b.token);
  assert.equal(a.user.id, sampleUser.id);
});
