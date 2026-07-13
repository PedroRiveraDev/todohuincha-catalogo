// src/lib/auth/demo-credentials.ts
// Single source of truth for the seeded demo/mock auth users.
//
// This module is intentionally the only place in the repo that knows the
// visible demo email + password pairs. Both the login page UI and the
// runtime user repository read from here, so a credential change in one
// place is reflected everywhere.
//
// Demo-only contract:
//   - The values are NOT secrets and MUST NOT be treated as production
//     credentials. The login page publishes them on purpose.
//   - Defaults are stable so a clean checkout works without setup.
//   - Environment overrides (MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD,
//     MOCK_VENDOR_EMAIL, MOCK_VENDOR_PASSWORD) let a contributor tweak
//     the demo values for local experiments without editing source.

import type { Role } from './types';
import { mockPasswordHasher } from './password-hash';

export interface DemoCredential {
  id: string;
  email: string;
  password: string;
  displayName: string;
  role: Role;
  active: boolean;
}

export const DEMO_USERS: ReadonlyArray<DemoCredential> = [
  {
    id: 'admin-001',
    email: 'admin@todohuincha.cl',
    password: 'admin123',
    displayName: 'Administrador',
    role: 'admin',
    active: true,
  },
  {
    id: 'vendor-001',
    email: 'vendedor@todohuincha.cl',
    password: 'vendedor123',
    displayName: 'Vendedor',
    role: 'vendor',
    active: true,
  },
];

export interface DemoEnvKeys {
  adminEmail: string;
  adminPassword: string;
  vendorEmail: string;
  vendorPassword: string;
}

export const DEMO_ENV_KEYS: DemoEnvKeys = {
  adminEmail: 'MOCK_ADMIN_EMAIL',
  adminPassword: 'MOCK_ADMIN_PASSWORD',
  vendorEmail: 'MOCK_VENDOR_EMAIL',
  vendorPassword: 'MOCK_VENDOR_PASSWORD',
};

function readEnvOverride(key: string): string | undefined {
  const source = typeof process !== 'undefined' ? process.env : undefined;
  const value = source ? source[key] : undefined;
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value;
}

/**
 * Resolve the demo credentials applying any environment overrides.
 * Order is preserved: index 0 -> admin, index 1 -> vendor.
 *
 * Empty strings in the env map are treated as "not set" so callers can
 * safely forward a `process.env` snapshot without explicitly stripping
 * blank values.
 */
export function getDemoCredentials(
  env: Record<string, string | undefined> = readProcessEnv()
): DemoCredential[] {
  const overrides = {
    adminEmail: normalisedOverride(env[DEMO_ENV_KEYS.adminEmail]),
    adminPassword: normalisedOverride(env[DEMO_ENV_KEYS.adminPassword]),
    vendorEmail: normalisedOverride(env[DEMO_ENV_KEYS.vendorEmail]),
    vendorPassword: normalisedOverride(env[DEMO_ENV_KEYS.vendorPassword]),
  };
  return DEMO_USERS.map((entry) => {
    if (entry.role === 'admin') {
      return {
        ...entry,
        email: overrides.adminEmail ?? entry.email,
        password: overrides.adminPassword ?? entry.password,
      };
    }
    return {
      ...entry,
      email: overrides.vendorEmail ?? entry.email,
      password: overrides.vendorPassword ?? entry.password,
    };
  });
}

function normalisedOverride(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value;
}

function readProcessEnv(): Record<string, string | undefined> {
  if (typeof process === 'undefined' || !process.env) return {};
  return process.env as Record<string, string | undefined>;
}

function hashDemoPassword(plain: string): string {
  // mockPasswordHasher.hash is synchronous; the interface permits a
  // Promise return for callers that swap in scrypt at runtime.
  return mockPasswordHasher.hash(plain) as string;
}

/**
 * Shape consumed by UserRepository. Mirrors the historical JSON-on-disk
 * shape so the repo's normaliser stays unchanged.
 */
export interface DemoSourceRecord {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  password_hash: string;
  active: boolean;
}

/**
 * Build user-record payloads compatible with UserRepository, hashing each
 * demo password through the existing mockPasswordHasher. Hashing happens
 * at runtime / module-load time so no real hashes are committed.
 */
export function buildDemoUserRecords(
  creds: ReadonlyArray<DemoCredential> = getDemoCredentials()
): DemoSourceRecord[] {
  return creds.map((cred) => ({
    id: cred.id,
    email: cred.email,
    display_name: cred.displayName,
    role: cred.role,
    password_hash: hashDemoPassword(cred.password),
    active: cred.active,
  }));
}