// src/lib/auth/login-flow.ts
// Glue between UserRepository + PasswordHasher + SessionStore.
// Pure orchestration, no I/O (the repo handles its own lazy load).

import type { AuthUser, LoginAttempt, LoginResult } from './types';
import { UserRepository } from './repo';
import {
  mockPasswordHasher,
  scryptPasswordHasher,
  type PasswordHasher,
} from './password-hash';
import { createInMemorySessionStore, type SessionStore } from './session-store';

export interface LoginFlowDeps {
  repo: UserRepository;
  hasher?: PasswordHasher;
  sessionStore?: SessionStore;
  /**
   * Shared in-memory token map (`token -> userId`). When provided, the
   * minted session is registered here on success. This is the bridge
   * between `createLoginFlow` and the rest of the auth runtime — the
   * middleware and `/api/auth/me.json` both read from the same map.
   *
   * When omitted, minting still works but the resulting session cannot
   * be resolved later by anything but `mintSession`'s own return value.
   */
  liveTokens?: Map<string, string>;
}

export interface LoginFlow {
  authenticate(attempt: LoginAttempt): Promise<LoginResult>;
}

/**
 * Polyglot hasher: accepts both real scrypt hashes and seeded mock hashes.
 * The mock branch exists because the seeded demo users are hashed at
 * startup with the deterministic `mockPasswordHasher` (cheap + reproducible)
 * while new passwords minted at runtime go through the real scrypt path.
 */
export const polyglotPasswordHasher: PasswordHasher = {
  hash(plain) {
    return scryptPasswordHasher.hash(plain);
  },
  async verify(plain, encoded) {
    if (typeof plain !== 'string' || typeof encoded !== 'string') return false;
    if (encoded.startsWith('mock$')) {
      return mockPasswordHasher.verify(plain, encoded);
    }
    return scryptPasswordHasher.verify(plain, encoded);
  },
};

export function createLoginFlow(deps: LoginFlowDeps): LoginFlow {
  const hasher = deps.hasher ?? polyglotPasswordHasher;
  const sessionStore = deps.sessionStore ?? createInMemorySessionStore();
  return {
    async authenticate(attempt) {
      const email = (attempt?.email ?? '').trim().toLowerCase();
      const password = attempt?.password ?? '';
      if (!email || !password) return { ok: false, reason: 'missing_credentials' };

      const record = await deps.repo.findByEmail(email);
      if (!record) return { ok: false, reason: 'unknown_user' };
      if (!record.active) return { ok: false, reason: 'inactive_user' };

      const matches = await hasher.verify(password, record.passwordHash);
      if (!matches) return { ok: false, reason: 'bad_password' };

      const user = UserRepository.toAuthUser(record);
      const session = sessionStore.mintSession(user);
      // Register the freshly minted token in the shared liveTokens map so
      // that middleware and `/api/auth/me.json` (which read from the
      // SAME map) can later resolve the cookie back to a user.
      // Without this, the cookie the login endpoint sets is opaque to
      // every other reader in the process.
      if (deps.liveTokens) {
        deps.liveTokens.set(session.token, user.id);
      }
      return { ok: true, session };
    },
  };
}

// ---------------------------------------------------------------------------
// Project a Session into a safe user payload for client-side consumption.
// ---------------------------------------------------------------------------

export function projectUserForClient(user: AuthUser): {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'vendor';
} {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}
