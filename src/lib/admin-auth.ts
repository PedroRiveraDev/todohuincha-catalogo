// src/lib/admin-auth.ts
// Admin authentication gate. Was a MOCK stub (`getCurrentAdminUser` always
// returned a synthetic admin) so the admin UI compiled before the real auth
// flow existed.
//
// As of the mock-auth slice, this module is the LIGHTCOMPATIBLE BRIDGE
// between the existing admin UI consumers and the new
// `src/lib/auth/*` stack. We keep the public surface (`AdminUser`,
// `getCurrentAdminUser`, `isAdmin`, `canPublish`) intact and route them
// through:
//   - client side: window.__AUTH__ + localStorage `th:auth:user` (set by
//     the /api/auth/me.json ping)
//   - server side: Astro.locals.user injected by src/middleware.ts.

import type { AuthUser, Role } from './auth/types';
import { getAuthRuntime } from './auth/runtime';
import { hasRole } from './auth/auth-guard';

export interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'vendor' | 'editor' | 'publisher';
}

/**
 * Legacy type alias. The "vendor" / "editor" / "publisher" variants stay
 * in the type so the existing admin UIs compile; only `admin` and
 * `vendor` are seeded users at this stage.
 */
export type { AuthUser };

/**
 * Resolve the user backing the current admin request, or null if
 * there is no authenticated user. Reads from the shared runtime so
 * that prerendered pages (where middleware runs at build time) still
 * see the cookie set by the dev server's last login.
 */
export function getCurrentAdminUser(): AdminUser | null {
  // Browser-side convenience: read from window.__AUTH__ injected by the
  // /api/auth/me.json call. Falls back to null in SSR.
  if (typeof window !== 'undefined') {
    const cached = readBrowserAuth();
    if (cached) return toAdminUser(cached);
  }
  return null;
}

export function isAdmin(): boolean {
  return getCurrentAdminUser() !== null;
}

export function canPublish(): boolean {
  if (typeof window === 'undefined') return false;
  const cached = readBrowserAuth();
  return cached?.role === 'admin';
}

// ---------------------------------------------------------------------------
// Server-side helpers — used from .astro frontmatter and API routes.
// ---------------------------------------------------------------------------

/**
 * Resolve the user from a Request synchronously by going through the
 * runtime (which already loaded via middleware). Returns null when no
 * session is present or the runtime has not been booted.
 */
export async function resolveServerUser(request: Request): Promise<AuthUser | null> {
  if (typeof request !== 'object' || request === null) return null;
  try {
    const runtime = getAuthRuntime();
    const session = await runtime.resolveSession(request);
    return session?.user ?? null;
  } catch {
    return null;
  }
}

export function isRole(user: AuthUser | null | undefined, ...roles: Role[]): boolean {
  return hasRole(user, ...roles);
}

export function requireRoleOrThrow(
  user: AuthUser | null | undefined,
  ...roles: Role[]
): AuthUser {
  if (!hasRole(user, ...roles)) {
    throw new Error('forbidden');
  }
  return user as AuthUser;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __AUTH__?: { user: AuthUser } | null;
  }
}

interface BrowserAuth {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

function readBrowserAuth(): BrowserAuth | null {
  if (typeof window === 'undefined') return null;
  const fromWindow = window.__AUTH__;
  if (fromWindow && typeof fromWindow === 'object' && fromWindow.user) {
    return projectBrowserAuth(fromWindow.user);
  }
  try {
    const raw = window.localStorage.getItem('th:auth:user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return projectBrowserAuth(parsed as AuthUser);
  } catch {
    return null;
  }
}

function projectBrowserAuth(user: AuthUser): BrowserAuth {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

function toAdminUser(user: BrowserAuth): AdminUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}
