// src/lib/auth/types.ts
// Domain types for the auth module. No behaviours, no I/O.
// Roles are a closed set: 'admin' and 'vendor'. Anonymous sessions are not
// roles — they are represented by an empty Session.

export type Role = 'admin' | 'vendor';

export const ROLES: readonly Role[] = ['admin', 'vendor'] as const;

export interface AuthUser {
  /** Stable internal id from the demo credentials source. */
  id: string;
  /** Login email (always lowercase) */
  email: string;
  /** Display name shown in admin/vendor chrome */
  displayName: string;
  /** User role — single source of truth for capabilities */
  role: Role;
  /** Soft-disable flag — inactive users are refused at login time */
  active: boolean;
}

export interface AuthUserRecord extends AuthUser {
  /** Stored password hash. Never returned to callers through public APIs. */
  passwordHash: string;
}

export interface Session {
  /** Opaque random token used as cookie value. */
  token: string;
  /** AuthUser fields projected into the session payload. */
  user: AuthUser;
  /** Unix ms when the session was created (used for TTL/audit). */
  createdAt: number;
}

export interface LoginAttempt {
  email: string;
  password: string;
}

export interface LoginResult {
  ok: boolean;
  reason?: 'missing_credentials' | 'unknown_user' | 'inactive_user' | 'bad_password';
  session?: Session;
}

export interface RoleGuardResult {
  ok: boolean;
  reason?: 'unauthenticated' | 'insufficient_role';
  user?: AuthUser;
}
