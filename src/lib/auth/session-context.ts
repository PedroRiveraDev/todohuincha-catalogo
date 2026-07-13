// src/lib/auth/session-context.ts
// Resolve a Session from a Request/Headers using the session-store cookie
// and the user repo. Pure orchestration — no I/O beyond the repo lookup.

import { randomBytes } from 'node:crypto';
import type { AuthUser, Session } from './types';
import { UserRepository } from './repo';
import {
  SESSION_COOKIE_NAME,
  parseCookieHeader,
  createInMemorySessionStore,
  type CookieOptions,
  type SessionStore,
} from './session-store';

export interface SessionContextDeps {
  repo: UserRepository;
  /** Map opaque token -> userId. Mock only, in-memory. */
  liveTokens: Map<string, string>;
  now?: () => number;
  sessionStore?: SessionStore;
}

export interface ResolvedSession {
  token: string;
  userId: string;
}

export function createSessionContext(deps: SessionContextDeps) {
  const now = deps.now ?? (() => Date.now());
  const sessionStore: SessionStore = deps.sessionStore ?? createInMemorySessionStore();
  return {
    resolveFromToken(token: string): ResolvedSession | null {
      if (!token) return null;
      const userId = deps.liveTokens.get(token);
      if (!userId) return null;
      return { token, userId };
    },
    async hydrateSession({ token, userId }: ResolvedSession): Promise<Session | null> {
      if (!token || !userId) return null;
      const record = await deps.repo.findById(userId);
      if (!record || !record.active) return null;
      return {
        token,
        user: UserRepository.toAuthUser(record),
        createdAt: now(),
      };
    },
    issueSessionFor(user: AuthUser): Session {
      const session = sessionStore.mintSession(user);
      deps.liveTokens.set(session.token, user.id);
      return session;
    },
    buildSetCookie(session: Session, options?: Partial<CookieOptions>): string {
      return sessionStore.buildSetCookie(session, options);
    },
    buildClearCookie(options?: Partial<CookieOptions>): string {
      return sessionStore.buildClearCookie(options);
    },
    revokeToken(token: string | null | undefined): void {
      if (!token) return;
      deps.liveTokens.delete(token);
    },
  };
}

// ---------------------------------------------------------------------------
// Async helper: resolve a Session for the given Request in one call.
// ---------------------------------------------------------------------------

export async function resolveSessionFromRequest(
  request: Request,
  deps: SessionContextDeps
): Promise<Session | null> {
  const token = parseCookieHeader(request.headers.get('cookie'), SESSION_COOKIE_NAME);
  if (!token) return null;
  const userId = deps.liveTokens.get(token);
  if (!userId) return null;
  const record = await deps.repo.findById(userId);
  if (!record || !record.active) return null;
  return {
    token,
    user: UserRepository.toAuthUser(record),
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Token lifecycle helpers — used by login + logout endpoints.
// ---------------------------------------------------------------------------

export interface AuthBackingStore {
  repo: UserRepository;
  liveTokens: Map<string, string>;
}

export function createBackingStore(repo: UserRepository): AuthBackingStore {
  return { repo, liveTokens: new Map() };
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}
