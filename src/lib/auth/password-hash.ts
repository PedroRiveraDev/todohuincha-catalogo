// src/lib/auth/password-hash.ts
// Password hashing built on node:crypto.scrypt.
//
// scrypt is chosen because it ships with Node (no external deps) and is
// memory-hard. The encoded format is intentionally simple so it is readable
// in tests and survives JSON roundtrips:
//
//   scrypt$<cost>$<blockSize>$<parallelization>$<salt-hex>$<derivedKey-hex>
//
// Verification uses crypto.timingSafeEqual on equal-length buffers, so a
// stolen database dump does not leak the password length beyond that
// observable from the field itself.

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const SCRYPT_PREFIX = 'scrypt';

export interface PasswordHasher {
  hash(plain: string): string | Promise<string>;
  verify(plain: string, encoded: string): boolean | Promise<boolean>;
}

interface EncodedFields {
  cost: number;
  blockSize: number;
  parallelization: number;
  saltHex: string;
  derivedHex: string;
}

function encode(plain: string, salt: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    scrypt(
      plain,
      salt,
      KEY_LENGTH,
      { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: 64 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        const encoded: string = [
          SCRYPT_PREFIX,
          COST,
          BLOCK_SIZE,
          PARALLELIZATION,
          salt.toString('hex'),
          derivedKey.toString('hex'),
        ].join('$');
        resolve(encoded);
      }
    );
  });
}

function decode(encoded: string): EncodedFields | null {
  const parts = encoded.split('$');
  if (parts.length !== 6) return null;
  const [prefix, costStr, blockStr, parallelStr, saltHex, derivedHex] = parts;
  if (prefix !== SCRYPT_PREFIX) return null;
  const cost = Number.parseInt(costStr, 10);
  const blockSize = Number.parseInt(blockStr, 10);
  const parallelization = Number.parseInt(parallelStr, 10);
  if (!Number.isFinite(cost) || !Number.isFinite(blockSize) || !Number.isFinite(parallelization)) return null;
  if (saltHex.length === 0 || derivedHex.length === 0) return null;
  return { cost, blockSize, parallelization, saltHex, derivedHex };
}

function verifyBuffers(plain: string, fields: EncodedFields): Promise<boolean> {
  return new Promise((resolve, reject) => {
    scrypt(
      plain,
      Buffer.from(fields.saltHex, 'hex'),
      KEY_LENGTH,
      { N: fields.cost, r: fields.blockSize, p: fields.parallelization, maxmem: 64 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        const stored = Buffer.from(fields.derivedHex, 'hex');
        if (stored.length !== derivedKey.length) {
          resolve(false);
          return;
        }
        resolve(timingSafeEqual(stored, derivedKey));
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Real implementations (scrypt)
// ---------------------------------------------------------------------------

export const scryptPasswordHasher: PasswordHasher = {
  async hash(plain) {
    if (typeof plain !== 'string' || plain.length === 0) {
      throw new Error('password must be a non-empty string');
    }
    const salt = randomBytes(SALT_LENGTH);
    return encode(plain, salt);
  },
  async verify(plain, encoded) {
    if (typeof plain !== 'string' || typeof encoded !== 'string') return false;
    const fields = decode(encoded);
    if (!fields) return false;
    try {
      return await verifyBuffers(plain, fields);
    } catch {
      return false;
    }
  },
};

// ---------------------------------------------------------------------------
// Deterministic hasher for tests + demo-credentials seeding.
//
// Encodes the hash with a sentinel that prevents the real scrypt path from
// ever accepting it. The mock verifies by string equality with `plain` as
// the canonical input. Used by the demo-credentials builder and by unit
// tests, never exposed to runtime callers.
// ---------------------------------------------------------------------------

export const mockPasswordHasher: PasswordHasher = {
  hash(plain) {
    return `mock$${Buffer.from(plain).toString('base64')}`;
  },
  verify(plain, encoded) {
    if (typeof plain !== 'string' || typeof encoded !== 'string') return false;
    return encoded === `mock$${Buffer.from(plain).toString('base64')}`;
  },
};

// ---------------------------------------------------------------------------
// Admin user passwords are stored in source control (mock), but we still
// want them to go through the hashing path so tests can verify the format.
// Use a small module-level helper to seed the JSON file.
// ---------------------------------------------------------------------------

export function isMockEncodedHash(encoded: string): boolean {
  return encoded.startsWith('mock$');
}

export function isScryptEncodedHash(encoded: string): boolean {
  return encoded.startsWith('scrypt$');
}
