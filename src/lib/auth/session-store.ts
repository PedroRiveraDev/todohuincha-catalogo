// src/lib/auth/session-store.ts
// Session token minting + cookie serialisation.
//
// Cookies are httpOnly, SameSite=Strict, Path=/. Secure flag is set in
// production builds. The cookie carries an opaque token; the Session
// itself is reconstructed by middleware via the repo lookup.
//
// The mock is in-memory only — sessions are not persisted across server
// restarts. This matches the project's "Mock only, no real backend" rule.

import { randomBytes } from 'node:crypto';
import type { Session } from './types';

export const SESSION_COOKIE_NAME = 'th_mock_session';
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h

export interface CookieOptions {
  maxAgeSeconds?: number;
  isProduction: boolean;
}

export interface SessionStore {
  mintSession(user: { id: string; email: string; displayName: string; role: 'admin' | 'vendor'; active: boolean }): Session;
  buildSetCookie(session: Session, options?: Partial<CookieOptions>): string;
  buildClearCookie(options?: Partial<CookieOptions>): string;
}

interface MintedSession extends Session {
  token: string;
  createdAt: number;
}

export function createInMemorySessionStore(): SessionStore {
  return {
    mintSession(user) {
      return mint(user);
    },
    buildSetCookie(session, options) {
      return serialiseSetCookie(session, options);
    },
    buildClearCookie(options) {
      return serialiseClearCookie(options);
    },
  };
}

function mint(user: { id: string; email: string; displayName: string; role: 'admin' | 'vendor'; active: boolean }): MintedSession {
  return {
    token: randomBytes(32).toString('hex'),
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      active: user.active,
    },
    createdAt: Date.now(),
  };
}

function serialiseSetCookie(session: Session, options?: Partial<CookieOptions>): string {
  const opts = resolveOptions(options);
  const parts = [
    `${SESSION_COOKIE_NAME}=${session.token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${opts.maxAgeSeconds}`,
  ];
  if (opts.isProduction) parts.push('Secure');
  return parts.join('; ');
}

function serialiseClearCookie(options?: Partial<CookieOptions>): string {
  const opts = resolveOptions(options);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (opts.isProduction) parts.push('Secure');
  void opts;
  return parts.join('; ');
}

function resolveOptions(options?: Partial<CookieOptions>): Required<CookieOptions> {
  return {
    maxAgeSeconds: options?.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS,
    isProduction: options?.isProduction ?? false,
  };
}

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------

export function parseCookieHeader(header: string | null | undefined, name: string): string | null {
  if (!header || typeof header !== 'string') return null;
  const cookies = header.split(';');
  for (const raw of cookies) {
    const trimmed = raw.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key === name) return value;
  }
  return null;
}
