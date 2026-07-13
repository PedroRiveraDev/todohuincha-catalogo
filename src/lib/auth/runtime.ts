// src/lib/auth/runtime.ts
// Process-wide wiring for the mock auth flow.
//
// Astro middleware + multiple API endpoints share the SAME in-memory
// token map + UserRepository so that login on one endpoint is visible
// to all subsequent reads.
//
// `getAuthRuntime()` lazily creates the singleton the first time it is
// called (most likely from middleware on the first request).
//
// ---------------------------------------------------------------------------
// Why this lives on `globalThis`
// ---------------------------------------------------------------------------
// Under Astro `output: 'static'` in dev, Vite can hand out multiple copies
// of this module to different consumers (middleware vs. an API route) and
// can re-evaluate the module on HMR / dev reloads. A plain `let cached`
// at module scope is therefore scoped to a single module copy — each copy
// gets its own cache, and its own `liveTokens` map. That is exactly the
// bug we are fixing: login would write into copy A, middleware / `/me`
// would read from copy B, and the cookie became unresolvable.
//
// The standard fix is to stash the singleton on `globalThis` so every
// module copy in the same Node process points at the same object. The
// key is namespaced (`__todohuincha_auth_runtime__`) so it does not
// collide with anything else on the global object.
//
// We additionally keep a separate `liveTokens` reference on the global
// store: if the runtime object is ever reconstructed (for example, by an
// explicit `resetAuthRuntimeForTests` that does not clear the token map,
// or by future code that swaps the runtime out), the new runtime can be
// built on top of the EXISTING `liveTokens` map. That is what keeps
// already-logged-in users logged in across dev reloads within the same
// process.

import { createBackingStore, resolveSessionFromRequest, type AuthBackingStore } from './session-context';
import { createLoginFlow, type LoginFlow } from './login-flow';
import { createSessionContext, type SessionContextDeps } from './session-context';
import { UserRepository } from './repo';

interface AuthRuntime {
  repo: UserRepository;
  sessionContext: ReturnType<typeof createSessionContext>;
  loginFlow: LoginFlow;
  backing: AuthBackingStore;
  resolveSession(request: Request): ReturnType<typeof resolveSessionFromRequest>;
}

interface AuthRuntimeGlobalStore {
  /** The cached singleton. Survives module re-evaluation in the same process. */
  runtime: AuthRuntime | null;
  /**
   * Shared `token -> userId` map. Lives separately from `runtime` so a
   * reconstructed runtime (e.g. after HMR within the same process) can
   * reuse the existing tokens instead of starting from scratch.
   *
   * `resetAuthRuntimeForTests` clears this too, so test isolation is
   * preserved when callers explicitly opt in via the test reset API.
   */
  liveTokens: Map<string, string>;
}

const GLOBAL_RUNTIME_KEY = '__todohuincha_auth_runtime__';
const GLOBAL_LIVE_TOKENS_KEY = '__todohuincha_auth_live_tokens__';

declare global {
  // eslint-disable-next-line no-var
  var __todohuincha_auth_runtime__: AuthRuntimeGlobalStore | undefined;
}

function getGlobalStore(): AuthRuntimeGlobalStore {
  const g = globalThis as typeof globalThis & {
    __todohuincha_auth_runtime__?: AuthRuntimeGlobalStore;
  };
  if (!g.__todohuincha_auth_runtime__) {
    // Reuse an existing liveTokens map if a previous module copy stashed
    // one on globalThis (HMR / dev reload continuity). Otherwise start
    // with an empty map.
    const existingTokens = (globalThis as unknown as Record<string, unknown>)[GLOBAL_LIVE_TOKENS_KEY];
    const liveTokens = existingTokens instanceof Map ? (existingTokens as Map<string, string>) : new Map<string, string>();
    g.__todohuincha_auth_runtime__ = {
      runtime: null,
      liveTokens,
    };
  }
  // Mirror the liveTokens onto its own global key so a reconstruction
  // that bypasses this helper can still recover it.
  (globalThis as unknown as Record<string, unknown>)[GLOBAL_LIVE_TOKENS_KEY] =
    g.__todohuincha_auth_runtime__.liveTokens;
  return g.__todohuincha_auth_runtime__;
}

export function getAuthRuntime(): AuthRuntime {
  const store = getGlobalStore();
  if (store.runtime) return store.runtime;

  const repo = new UserRepository();
  // Reuse the shared liveTokens map (carries over tokens minted before any
  // module reload in the same process). Backing store + login flow +
  // session context all read from / write to this same Map instance.
  const liveTokens = store.liveTokens;
  const backing: AuthBackingStore = { repo, liveTokens };
  const deps: SessionContextDeps = {
    repo,
    liveTokens,
  };
  const sessionContext = createSessionContext(deps);
  // CRITICAL: pass the SAME `liveTokens` map to the login flow. Login
  // mints a token and registers it here so middleware (which reads from
  // `deps.liveTokens` via `resolveSessionFromRequest`) can resolve the
  // cookie the login endpoint sets.
  const loginFlow = createLoginFlow({ repo, liveTokens });
  store.runtime = {
    repo,
    sessionContext,
    loginFlow,
    backing,
    resolveSession: (request: Request) => resolveSessionFromRequest(request, deps),
  };
  return store.runtime;
}

export function resetAuthRuntimeForTests(): void {
  const g = globalThis as unknown as {
    __todohuincha_auth_runtime__?: AuthRuntimeGlobalStore;
  };
  // Full reset: drop the runtime AND the liveTokens map so the next
  // `getAuthRuntime()` call gets a truly fresh, empty world. Tests use
  // this for isolation. Production code never calls this.
  if (g.__todohuincha_auth_runtime__) {
    g.__todohuincha_auth_runtime__.runtime = null;
    g.__todohuincha_auth_runtime__.liveTokens = new Map<string, string>();
  }
  (globalThis as unknown as Record<string, unknown>)[GLOBAL_LIVE_TOKENS_KEY] = new Map<string, string>();
}