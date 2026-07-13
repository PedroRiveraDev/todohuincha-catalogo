// tests/lib/auth/runtime.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthRuntime, resetAuthRuntimeForTests } from '../../../src/lib/auth/runtime.ts';
import { SESSION_COOKIE_NAME } from '../../../src/lib/auth/session-store.ts';

test('runtime is a singleton', () => {
  resetAuthRuntimeForTests();
  const a = getAuthRuntime();
  const b = getAuthRuntime();
  assert.equal(a, b);
  resetAuthRuntimeForTests();
  const c = getAuthRuntime();
  assert.notEqual(a, c, 'after reset a new instance is created');
  resetAuthRuntimeForTests();
});

test('runtime loginFlow registers the minted token in the shared liveTokens map', async () => {
  resetAuthRuntimeForTests();
  const runtime = getAuthRuntime();

  const result = await runtime.loginFlow.authenticate({ email: 'admin@todohuincha.cl', password: 'admin123' });
  assert.equal(result.ok, true);
  assert.ok(result.session);
  assert.ok(result.session.token.length >= 32);

  // The freshly minted token MUST be visible to resolveSession right
  // away — no manual registration, no back-door. This is the regression
  // test for the B1 critical bug where login minted a token that
  // nobody else could resolve.
  const registeredUserId = runtime.backing.liveTokens.get(result.session.token);
  assert.equal(registeredUserId, result.session.user.id);

  const request = new Request('http://localhost/admin', {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${result.session.token}` },
  });
  const resolved = await runtime.resolveSession(request);
  assert.ok(resolved, 'middleware-style resolve must succeed after login');
  assert.equal(resolved.user.role, 'admin');
  assert.equal(resolved.user.email, 'admin@todohuincha.cl');

  resetAuthRuntimeForTests();
});

test('runtime login + me pipeline end-to-end (no manual workaround)', async () => {
  resetAuthRuntimeForTests();
  const runtime = getAuthRuntime();

  const result = await runtime.loginFlow.authenticate({ email: 'admin@todohuincha.cl', password: 'admin123' });
  assert.equal(result.ok, true);
  const session = result.session;

  // No `runtime.backing.liveTokens.set(...)` workaround: the login flow
  // is responsible for registering the token itself.
  const request = new Request('http://localhost/admin', {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${session.token}` },
  });
  const resolved = await runtime.resolveSession(request);
  assert.ok(resolved);
  assert.equal(resolved.user.role, 'admin');

  const missingRequest = new Request('http://localhost/admin');
  assert.equal(await runtime.resolveSession(missingRequest), null);
  resetAuthRuntimeForTests();
});

test('runtime revokeToken removes the entry so resolveSession returns null', async () => {
  resetAuthRuntimeForTests();
  const runtime = getAuthRuntime();
  const result = await runtime.loginFlow.authenticate({ email: 'vendedor@todohuincha.cl', password: 'vendedor123' });
  assert.equal(result.ok, true);
  const token = result.session.token;

  let resolved = await runtime.resolveSession(
    new Request('http://localhost/vendor', { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } })
  );
  assert.ok(resolved);
  assert.equal(resolved.user.role, 'vendor');

  runtime.sessionContext.revokeToken(token);
  resolved = await runtime.resolveSession(
    new Request('http://localhost/vendor', { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } })
  );
  assert.equal(resolved, null);
  resetAuthRuntimeForTests();
});

// ---------------------------------------------------------------------------
// Cross-module / cross-HMR integration tests.
//
// These cover the bug where Astro `output: 'static'` dev hands out multiple
// module copies (middleware vs. /api/auth/*.json), each with its own
// module-local `cached` variable. The fix stashes the singleton on
// `globalThis`. The tests below pin that behaviour down so the regression
// cannot return silently.
// ---------------------------------------------------------------------------

const GLOBAL_RUNTIME_KEY = '__todohuincha_auth_runtime__';
const GLOBAL_LIVE_TOKENS_KEY = '__todohuincha_auth_live_tokens__';

test('runtime is stashed on globalThis so module copies in the same process share it', () => {
  resetAuthRuntimeForTests();
  const a = getAuthRuntime();
  const g = globalThis;
  assert.ok(g[GLOBAL_RUNTIME_KEY], 'globalThis must hold the runtime store');
  assert.equal(g[GLOBAL_RUNTIME_KEY].runtime, a, 'globalThis entry must point at the singleton');
  assert.ok(
    g[GLOBAL_LIVE_TOKENS_KEY] instanceof Map,
    'liveTokens must be stashed on globalThis as a Map instance'
  );
  assert.equal(
    a.backing.liveTokens,
    g[GLOBAL_LIVE_TOKENS_KEY],
    'runtime.backing.liveTokens is the SAME Map instance as on globalThis'
  );

  // A repeat call from the same (or a fresh) module copy must return the
  // very same object identity: that is the contract that lets middleware
  // and /api/auth/*.json see each other's tokens under Vite SSR.
  const b = getAuthRuntime();
  assert.equal(b, a, 'runtime identity must be stable across calls in the same process');

  resetAuthRuntimeForTests();
});

test('reconstructed runtime reuses the preserved liveTokens map (HMR continuity)', async () => {
  resetAuthRuntimeForTests();
  const first = getAuthRuntime();

  // Mint a token via the first runtime, exactly the way /api/auth/login.json does.
  const loginResult = await first.loginFlow.authenticate({
    email: 'admin@todohuincha.cl',
    password: 'admin123',
  });
  assert.equal(loginResult.ok, true);
  const token = loginResult.session.token;
  assert.equal(
    first.backing.liveTokens.get(token),
    loginResult.session.user.id,
    'login must register the minted token in the shared map'
  );

  // Simulate a HMR / dev-server reload: blow away the runtime object on
  // the global store but keep the liveTokens map intact. The next
  // `getAuthRuntime()` MUST reconstruct the runtime on top of the
  // existing tokens, so the already-logged-in user STAYS logged in.
  const g = globalThis;
  g[GLOBAL_RUNTIME_KEY].runtime = null;

  const second = getAuthRuntime();
  assert.notEqual(second, first, 'a fresh runtime object is reconstructed');
  assert.equal(
    second.backing.liveTokens.get(token),
    loginResult.session.user.id,
    'existing tokens must survive runtime reconstruction'
  );

  const resolved = await second.resolveSession(
    new Request('http://localhost/admin', { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } })
  );
  assert.ok(resolved, 'post-reload me.json must resolve the existing session');
  assert.equal(resolved.user.role, 'admin');

  resetAuthRuntimeForTests();
});

test('resetAuthRuntimeForTests produces a truly fresh runtime (login + me still work, old token is dead)', async () => {
  // Pre-existing session that we expect to die after the explicit test reset.
  resetAuthRuntimeForTests();
  const before = getAuthRuntime();
  const beforeLogin = await before.loginFlow.authenticate({
    email: 'admin@todohuincha.cl',
    password: 'admin123',
  });
  assert.equal(beforeLogin.ok, true);
  const oldToken = beforeLogin.session.token;

  // The explicit reset MUST wipe both the runtime AND the liveTokens map.
  resetAuthRuntimeForTests();
  const after = getAuthRuntime();
  assert.notEqual(after, before, 'reset must hand back a new runtime object');
  assert.equal(after.backing.liveTokens.size, 0, 'reset must clear every prior token');
  assert.equal(
    await after.resolveSession(
      new Request('http://localhost/admin', { headers: { cookie: `${SESSION_COOKIE_NAME}=${oldToken}` } })
    ),
    null,
    'tokens minted before the reset must no longer resolve'
  );

  // End-to-end pipeline still works against the fresh runtime — login →
  // me without any manual `runtime.backing.liveTokens.set(...)` workaround.
  const afterLogin = await after.loginFlow.authenticate({
    email: 'vendedor@todohuincha.cl',
    password: 'vendedor123',
  });
  assert.equal(afterLogin.ok, true);
  const newToken = afterLogin.session.token;

  const resolved = await after.resolveSession(
    new Request('http://localhost/vendor', { headers: { cookie: `${SESSION_COOKIE_NAME}=${newToken}` } })
  );
  assert.ok(resolved, 'fresh runtime must resolve a freshly minted token');
  assert.equal(resolved.user.role, 'vendor');
  assert.equal(resolved.user.email, 'vendedor@todohuincha.cl');

  resetAuthRuntimeForTests();
});
