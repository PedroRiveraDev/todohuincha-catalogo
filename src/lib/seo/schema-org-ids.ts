// Deterministic Schema.org @id generator.
// We hash a canonical JSON snapshot with sha1 so identical inputs produce identical @ids,
// and any payload change yields a fresh id. Stable across builds and across machines.

import { createHash } from 'node:crypto';

export const SITE_URL = 'https://todohuincha.com';
export const SITE_LANG = 'es-CL';

const ORG_NAMESPACE = 'todohuincha.org';
const SITE_NAMESPACE = 'todohuincha.site';

// Stable @id constants used by every page to link WebSite + LocalBusiness back to the
// Organization. They depend only on the public company identity, so a code change that
// does NOT alter the identity (URL, legalName) leaves these unchanged.
export const ORG_ID = `${SITE_URL}/#org`;
export const SITE_ID = `${SITE_URL}/#site`;

export function buildId(namespace: string, ...parts: Array<string | number>): string {
  const payload = stableStringify({ namespace, parts });
  const hash = createHash('sha1').update(payload).digest('hex').slice(0, 16);
  const safeNamespace = namespace.replace(/[^a-z0-9-]/gi, '');
  return `${SITE_URL}/#${safeNamespace}-${hash}`;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',');
  return `{${body}}`;
}

export const SCHEMA_CONTEXT = 'https://schema.org';
export { ORG_NAMESPACE, SITE_NAMESPACE };