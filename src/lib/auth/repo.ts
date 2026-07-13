// src/lib/auth/repo.ts
// User repository — sources user records via an injected Source and
// exposes lookup helpers. Pure data access; no password verification or
// login workflow lives here.

import type { AuthUser, AuthUserRecord, Role } from './types';
import { buildDemoUserRecords } from './demo-credentials';

export interface SourceRecord {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  password_hash: string;
  active: boolean;
}

/** Loader shape: returns raw user records in the canonical SourceRecord shape. */
export type Source = () => Promise<SourceRecord[]>;

export class UserRepository {
  private cache: AuthUserRecord[] | null = null;
  private readonly source: Source;

  constructor(source?: Source) {
    this.source = source ?? defaultDemoSource;
  }

  async list(): Promise<AuthUserRecord[]> {
    if (this.cache === null) {
      const raw = await this.source();
      this.cache = raw.map((entry, index) => normalizeEntry(entry, index)).filter(
        (record): record is AuthUserRecord => record !== null
      );
    }
    return this.cache;
  }

  async findByEmail(email: string): Promise<AuthUserRecord | null> {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const records = await this.list();
    return records.find((record) => record.email === normalized) ?? null;
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    if (!id) return null;
    const records = await this.list();
    return records.find((record) => record.id === id) ?? null;
  }

  /** Project the credential-bearing record into a safe AuthUser shape. */
  static toAuthUser(record: AuthUserRecord): AuthUser {
    return {
      id: record.id,
      email: record.email,
      displayName: record.displayName,
      role: record.role,
      active: record.active,
    };
  }

  /** Replace the in-memory cache (used by tests). */
  reset(): void {
    this.cache = null;
  }
}

// ---------------------------------------------------------------------------
// Default source: build the demo records from the single source of truth
// (demo-credentials.ts). Hashing happens at module-load time so no real
// hashes are committed to source control.
// ---------------------------------------------------------------------------

const defaultDemoSource: Source = async () => buildDemoUserRecords();

function normalizeEntry(
  entry: SourceRecord,
  index: number
): AuthUserRecord | null {
  if (!entry || typeof entry !== 'object') return null;
  const email = normalizeEmail(entry.email);
  const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : '';
  const role = entry.role;
  const passwordHash = typeof entry.password_hash === 'string' ? entry.password_hash : '';
  const active = entry.active !== false;
  if (!email) throw new Error(`demo user entry #${index} missing email`);
  if (!id) throw new Error(`demo user entry #${index} missing id`);
  if (role !== 'admin' && role !== 'vendor') {
    throw new Error(`demo user entry #${id} has unsupported role: ${String(role)}`);
  }
  if (!passwordHash) throw new Error(`demo user entry #${id} missing password_hash`);
  return {
    id,
    email,
    displayName: typeof entry.display_name === 'string' && entry.display_name.trim()
      ? entry.display_name.trim()
      : email.split('@')[0] ?? email,
    role,
    passwordHash,
    active,
  };
}

function normalizeEmail(email: unknown): string {
  if (typeof email !== 'string') return '';
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : '';
}