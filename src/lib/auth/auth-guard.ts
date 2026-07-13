// src/lib/auth/auth-guard.ts
// Role-based guards. Pure functions over a Session.
//
// `requireRole` returns either an authorised user or a structured reason
// the caller can translate into an HTTP response.

import type { AuthUser, Role, RoleGuardResult } from './types';

export function hasRole(user: AuthUser | null | undefined, ...roles: Role[]): boolean {
  if (!user || !user.active) return false;
  return roles.includes(user.role);
}

export function isAdminRole(user: AuthUser | null | undefined): user is AuthUser {
  return hasRole(user, 'admin');
}

export function isVendorRole(user: AuthUser | null | undefined): user is AuthUser {
  return hasRole(user, 'vendor');
}

export function requireRole(
  user: AuthUser | null | undefined,
  ...roles: Role[]
): RoleGuardResult {
  if (!user) return { ok: false, reason: 'unauthenticated' };
  if (!user.active) return { ok: false, reason: 'unauthenticated' };
  if (!roles.includes(user.role)) {
    return { ok: false, reason: 'insufficient_role' };
  }
  return { ok: true, user };
}

export function requireAdmin(user: AuthUser | null | undefined): RoleGuardResult {
  return requireRole(user, 'admin');
}

export function requireVendor(user: AuthUser | null | undefined): RoleGuardResult {
  return requireRole(user, 'vendor');
}

export function requireAnyAuth(user: AuthUser | null | undefined): RoleGuardResult {
  if (!user || !user.active) return { ok: false, reason: 'unauthenticated' };
  return { ok: true, user };
}
