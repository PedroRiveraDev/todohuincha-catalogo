// Hand-written validator. Returns { ok, errors } — no exceptions in normal flow.
// Rejects smart quotes (U+2018/U+2019/U+201C/U+201D) inside user-facing copy fields
// to keep visible Spanish typography predictable.

import type {
  Branch,
  Company,
  TimelineMilestone,
  ValidationResult,
} from './types.ts';
import { ALLOWED_REGIONS, PHONE_PATTERN } from './types.ts';

const SMART_QUOTE_PATTERN = /[\u2018\u2019\u201C\u201D]/;

const empty = (): ValidationResult => ({ ok: true, errors: [] });
const fail = (errors: string[]): ValidationResult => ({ ok: false, errors });

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const hasSmartQuote = (value: unknown): boolean => {
  if (typeof value === 'string') return SMART_QUOTE_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(hasSmartQuote);
  if (isObject(value)) return Object.values(value).some(hasSmartQuote);
  return false;
};

export function validateCompany(candidate: unknown): ValidationResult {
  if (!isObject(candidate)) return fail(['company: expected an object']);

  const errors: string[] = [];

  const requiredStrings: Array<[string, unknown]> = [
    ['legalName', candidate.legalName],
    ['brandName', candidate.brandName],
    ['taxId', candidate.taxId],
    ['mission', candidate.mission],
    ['vision', candidate.vision],
    ['shortPitch', candidate.shortPitch],
    ['mapUrl', candidate.mapUrl],
    ['url', candidate.url],
    ['logo', candidate.logo],
  ];
  for (const [field, value] of requiredStrings) {
    if (typeof value !== 'string' || value.length === 0) errors.push(`${field}: required non-empty string`);
  }

  const copyFields: Array<[string, unknown]> = [
    ['mission', candidate.mission],
    ['vision', candidate.vision],
    ['shortPitch', candidate.shortPitch],
  ];
  for (const [field, value] of copyFields) {
    if (hasSmartQuote(value)) errors.push(`${field}: rejected — smart quote characters (U+2018/U+2019/U+201C/U+201D) are not allowed`);
  }

  const phones = candidate.phones;
  if (!Array.isArray(phones) || phones.length === 0) {
    errors.push('phones: required non-empty array');
  } else if (phones.some((p) => typeof p !== 'string' || !PHONE_PATTERN.test(p))) {
    errors.push(`phones: every value must match ${PHONE_PATTERN}`);
  }

  const emails = candidate.emails;
  if (!Array.isArray(emails) || emails.length === 0) {
    errors.push('emails: required non-empty array');
  } else if (emails.some((e) => typeof e !== 'string' || !/.+@.+\..+/.test(e))) {
    errors.push('emails: every value must look like an email');
  }

  const founders = candidate.founders;
  if (!Array.isArray(founders) || founders.length === 0) {
    errors.push('founders: required non-empty array');
  }

  const socials = candidate.socials;
  if (!isObject(socials)) {
    errors.push('socials: required object');
  } else {
    if (typeof socials.linkedin !== 'string' || socials.linkedin.length === 0) {
      errors.push('socials.linkedin: required');
    }
  }

  const address = candidate.address;
  if (!isObject(address)) {
    errors.push('address: required object');
  } else {
    if (typeof address.country !== 'string' || address.country !== 'CL') {
      errors.push('address.country: must be "CL"');
    }
    if (typeof address.region !== 'string' || !ALLOWED_REGIONS.includes(address.region)) {
      errors.push(`address.region: must be one of ${ALLOWED_REGIONS.join(' | ')}`);
    }
    if (typeof address.street !== 'string' || address.street.length === 0) {
      errors.push('address.street: required');
    }
    if (typeof address.locality !== 'string' || address.locality.length === 0) {
      errors.push('address.locality: required');
    }
    const geo = address.geo;
    if (!isObject(geo) || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') {
      errors.push('address.geo: required { lat: number, lng: number }');
    }
  }

  return errors.length === 0 ? empty() : fail(errors);
}

export function validateBranches(candidate: unknown): ValidationResult {
  if (!Array.isArray(candidate)) return fail(['branches: expected an array']);
  if (candidate.length === 0) return fail(['branches: required non-empty array']);

  const errors: string[] = [];
  candidate.forEach((entry: unknown, index: number) => {
    const prefix = `branches[${index}]`;
    if (!isObject(entry)) {
      errors.push(`${prefix}: expected object`);
      return;
    }
    if (typeof entry.slug !== 'string' || !/^[a-z0-9-]+$/.test(entry.slug)) {
      errors.push(`${prefix}.slug: kebab-case slug required`);
    }
    if (typeof entry.name !== 'string' || entry.name.length === 0) {
      errors.push(`${prefix}.name: required`);
    }
    if (typeof entry.city !== 'string' || entry.city.length === 0) {
      errors.push(`${prefix}.city: required`);
    }
    if (typeof entry.region !== 'string' || !ALLOWED_REGIONS.includes(entry.region)) {
      errors.push(`${prefix}.region: must be one of ${ALLOWED_REGIONS.join(' | ')}`);
    }
    if (typeof entry.phone !== 'string' || !PHONE_PATTERN.test(entry.phone)) {
      errors.push(`${prefix}.phone: must match ${PHONE_PATTERN}`);
    }
    if (typeof entry.mapUrl !== 'string' || !entry.mapUrl.startsWith('https://')) {
      errors.push(`${prefix}.mapUrl: must be an https URL`);
    }
    if (typeof entry.isHeadquarters !== 'boolean') {
      errors.push(`${prefix}.isHeadquarters: required boolean`);
    }
  });

  return errors.length === 0 ? empty() : fail(errors);
}

export function validateTimeline(candidate: unknown): ValidationResult {
  if (!Array.isArray(candidate)) return fail(['timeline: expected an array']);
  if (candidate.length === 0) return empty(); // empty timeline is allowed; pages render "Próximamente".

  const errors: string[] = [];
  let prevYear = -Infinity;
  candidate.forEach((entry: unknown, index: number) => {
    const prefix = `timeline[${index}]`;
    if (!isObject(entry)) {
      errors.push(`${prefix}: expected object`);
      return;
    }
    if (typeof entry.year !== 'number' || !Number.isFinite(entry.year)) {
      errors.push(`${prefix}.year: required number`);
      return;
    }
    if (typeof entry.event !== 'string' || entry.event.length === 0) {
      errors.push(`${prefix}.event: required`);
    }
    if (entry.year <= prevYear) {
      errors.push(`${prefix}.year: must be strictly greater than the previous year`);
    }
    prevYear = entry.year;
  });

  return errors.length === 0 ? empty() : fail(errors);
}

export function validateBrandFile(candidate: unknown): ValidationResult {
  if (!isObject(candidate)) return fail(['brandFile: expected an object']);
  const status = candidate.status;
  if (status !== 'pending' && status !== 'ready') {
    return fail(['brandFile.status: must be "pending" or "ready"']);
  }
  const brands = candidate.brands;
  if (!Array.isArray(brands)) return fail(['brandFile.brands: required array']);

  if (status === 'pending') {
    if (brands.length !== 0) return fail(['brandFile.brands: pending files must carry an empty array']);
    return empty();
  }

  const errors: string[] = [];
  brands.forEach((entry: unknown, index: number) => {
    const prefix = `brands[${index}]`;
    if (!isObject(entry)) {
      errors.push(`${prefix}: expected object`);
      return;
    }
    if (typeof entry.name !== 'string' || entry.name.length === 0) {
      errors.push(`${prefix}.name: required`);
    }
    if (typeof entry.logo !== 'string' || entry.logo.length === 0) {
      errors.push(`${prefix}.logo: required (path under public/)`);
    }
    if (typeof entry.alt !== 'string' || entry.alt.length === 0) {
      errors.push(`${prefix}.alt: required`);
    }
  });
  return errors.length === 0 ? empty() : fail(errors);
}

// Exported for unit-test reuse without polluting public surface.
export const _internal = { hasSmartQuote };
export type { Branch, Company, TimelineMilestone };