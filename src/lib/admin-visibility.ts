// src/lib/admin-visibility.ts
// Visibility persistence + rules for admin/vendor/public roles.
//
// Storage shape (inside catalog_generation.output_types.full_catalog_pdf.visibility):
// {
//   products:   { by_sku:   { SKU: { visible_to_vendor, visible_to_public } },
//                 default:  { visible_to_vendor, visible_to_public } },
//   categories: { by_code:  { CODE: { visible_to_vendor, visible_to_public } },
//                 default:  { visible_to_vendor, visible_to_public } }
// }
//
// Rule: the data layer (visibility block) describes the OPEN defaults +
// per-item overrides. The "admin sees everything" rule is a CODE-LAYER
// rule (admin always wins regardless of flags). The "vendor sees only
// visible_to_vendor" rule is a CODE-LAYER rule, not a data-layer rule.
// "Anonymous" is NOT a role.

import type { Role } from './auth/types';
import {
  invalidateCache,
  readCatalogGeneration,
  writeCatalogGeneration,
} from './admin-storage';

export const VISIBILITY_OUTPUT_TYPE = 'full_catalog_pdf';

export interface VisibilityFlags {
  visible_to_vendor: boolean;
  visible_to_public: boolean;
}

export interface VisibilityPerItem<TKey extends string> {
  by_code?: Record<TKey, VisibilityFlags>; // for categories (codes are uppercase)
  by_sku?: Record<TKey, VisibilityFlags>; // for products (SKUs are alphanumeric)
  default: VisibilityFlags;
}

export interface CatalogVisibility {
  products: VisibilityPerItem<string>;
  categories: VisibilityPerItem<string>;
}

export const DEFAULT_VISIBILITY: CatalogVisibility = {
  products: { default: { visible_to_vendor: true, visible_to_public: false } },
  categories: { default: { visible_to_vendor: true, visible_to_public: false } },
};

export interface VisibilityUpdate {
  products?: {
    by_sku?: Record<string, Partial<VisibilityFlags>>;
    default?: Partial<VisibilityFlags>;
  };
  categories?: {
    by_code?: Record<string, Partial<VisibilityFlags>>;
    default?: Partial<VisibilityFlags>;
  };
}

export interface VisibilityDraftItem {
  key: string;
  visible_to_vendor: boolean;
  visible_to_public: boolean;
}

export interface VisibilityEditablePayload {
  products: VisibilityDraftItem[];
  categories: VisibilityDraftItem[];
  default_product: VisibilityFlags;
  default_category: VisibilityFlags;
}

// ---------------------------------------------------------------------------
// Read / write through existing admin-storage JSON helpers
// ---------------------------------------------------------------------------

interface SourceOutputConfig {
  layout?: Record<string, unknown>;
  rules?: unknown[];
  visibility?: CatalogVisibility;
}

function isVisibilityFlags(value: unknown): value is VisibilityFlags {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.visible_to_vendor === 'boolean' && typeof v.visible_to_public === 'boolean';
}

function isVisibilityPerItem(value: unknown): value is VisibilityPerItem<string> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!isVisibilityFlags(v.default)) return false;
  const maybeByCode = v.by_code;
  if (maybeByCode !== undefined) {
    if (!maybeByCode || typeof maybeByCode !== 'object' || Array.isArray(maybeByCode)) return false;
    for (const entry of Object.values(maybeByCode as Record<string, unknown>)) {
      if (!isVisibilityFlags(entry)) return false;
    }
  }
  const maybeBySku = v.by_sku;
  if (maybeBySku !== undefined) {
    if (!maybeBySku || typeof maybeBySku !== 'object' || Array.isArray(maybeBySku)) return false;
    for (const entry of Object.values(maybeBySku as Record<string, unknown>)) {
      if (!isVisibilityFlags(entry)) return false;
    }
  }
  return true;
}

function isCatalogVisibility(value: unknown): value is CatalogVisibility {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return isVisibilityPerItem(v.products) && isVisibilityPerItem(v.categories);
}

function normaliseFlags(partial: Partial<VisibilityFlags> | undefined, fallback: VisibilityFlags): VisibilityFlags {
  return {
    visible_to_vendor: typeof partial?.visible_to_vendor === 'boolean' ? partial.visible_to_vendor : fallback.visible_to_vendor,
    visible_to_public: typeof partial?.visible_to_public === 'boolean' ? partial.visible_to_public : fallback.visible_to_public,
  };
}

function normaliseVisibility(visibility: CatalogVisibility): CatalogVisibility {
  return {
    products: {
      by_sku: visibility.products.by_sku ?? {},
      default: normaliseFlags(visibility.products.default, { visible_to_vendor: true, visible_to_public: false }),
    },
    categories: {
      by_code: visibility.categories.by_code ?? {},
      default: normaliseFlags(visibility.categories.default, { visible_to_vendor: true, visible_to_public: false }),
    },
  };
}

/**
 * Read the current visibility block for full_catalog_pdf. Falls back to
 * safe defaults when the block is missing or malformed (we do NOT throw —
 * "missing visibility" is a normal state during early admin work).
 */
export async function readOutputVisibility(): Promise<CatalogVisibility> {
  const generation = (await readCatalogGeneration()) as Record<string, unknown> | null;
  if (!generation) return DEFAULT_VISIBILITY;
  const outputTypes = (generation.output_types ?? {}) as Record<string, SourceOutputConfig | undefined>;
  const out = outputTypes[VISIBILITY_OUTPUT_TYPE];
  if (!out || !out.visibility) return DEFAULT_VISIBILITY;
  if (!isCatalogVisibility(out.visibility)) return DEFAULT_VISIBILITY;
  return normaliseVisibility(out.visibility);
}

/**
 * Save the visibility block. Preserves every other key under
 * catalog_generation.output_types.full_catalog_pdf (layout, rules, etc).
 * Writes through `writeCatalogGeneration` so AJV validation still runs.
 */
export async function writeOutputVisibility(
  next: CatalogVisibility
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const generation = ((await readCatalogGeneration()) ?? {}) as Record<string, unknown>;
  const outputTypes = (generation.output_types ?? {}) as Record<string, SourceOutputConfig>;
  const existingOutput = outputTypes[VISIBILITY_OUTPUT_TYPE] ?? {};
  const updatedOutput: SourceOutputConfig = {
    ...existingOutput,
    visibility: normaliseVisibility(next),
  };
  const updatedGeneration = {
    ...generation,
    output_types: { ...outputTypes, [VISIBILITY_OUTPUT_TYPE]: updatedOutput },
  };
  const result = await writeCatalogGeneration(updatedGeneration);
  if (result.ok) invalidateCache();
  return result;
}

// ---------------------------------------------------------------------------
// Role rules (code-layer, not data-layer)
// ---------------------------------------------------------------------------

/**
 * Admin always sees everything, regardless of the data-layer flags.
 * This is enforced here so the data layer does not need to know about
 * roles at all.
 */
export function adminSeesEverything(): boolean {
  return true;
}

/**
 * Vendor sees products/categories that are explicitly marked
 * `visible_to_vendor: true`. Public sees `visible_to_public: true`.
 * Anonymous = NO role, returns `false` everywhere.
 */
export function isItemVisibleToRole(
  role: Role | null | undefined,
  flags: VisibilityFlags | undefined,
  isPublished: (flags: VisibilityFlags | undefined) => boolean = (f) => Boolean(f?.visible_to_public)
): boolean {
  if (role === 'admin') return true;
  if (role === 'vendor') return Boolean(flags?.visible_to_vendor);
  if (role === null || role === undefined) return false;
  return isPublished(flags);
}

/**
 * Draft pattern: when both visible_to_vendor AND visible_to_public are
 * false, the item is "draft / unpublished". This is purely a UI hint;
 * the runtime rule is still role-based.
 */
export function isItemDraft(flags: VisibilityFlags | undefined): boolean {
  if (!flags) return true;
  return !flags.visible_to_vendor && !flags.visible_to_public;
}

export function resolveProductVisibility(
  visibility: CatalogVisibility,
  sku: string
): VisibilityFlags {
  const override = visibility.products.by_sku?.[sku];
  if (override) return override;
  return visibility.products.default;
}

export function resolveCategoryVisibility(
  visibility: CatalogVisibility,
  code: string
): VisibilityFlags {
  const override = visibility.categories.by_code?.[code];
  if (override) return override;
  return visibility.categories.default;
}

// ---------------------------------------------------------------------------
// Payload parsing for the /api/admin/visibility.json endpoint
// ---------------------------------------------------------------------------

export interface VisibilityParseResult {
  ok: boolean;
  payload?: CatalogVisibility;
  errors: string[];
}

const SKU_PATTERN = /^[A-Za-z0-9_.-]{1,80}$/;
const CATEGORY_PATTERN = /^[A-Z0-9_.-]{1,80}$/;

export function parseVisibilityPayload(input: unknown): VisibilityParseResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ['payload must be an object'] };
  }
  if (input.products !== undefined && !isRecord(input.products)) {
    errors.push('products must be an object');
  }
  if (input.categories !== undefined && !isRecord(input.categories)) {
    errors.push('categories must be an object');
  }
  if (errors.length) return { ok: false, errors };

  const products = parseVisibilityBucket(input.products, 'products', 'by_sku', SKU_PATTERN, errors, {
    visible_to_vendor: true,
    visible_to_public: false,
  });
  const categories = parseVisibilityBucket(input.categories, 'categories', 'by_code', CATEGORY_PATTERN, errors, {
    visible_to_vendor: true,
    visible_to_public: false,
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, payload: { products, categories }, errors: [] };
}

function parseVisibilityBucket(
  raw: unknown,
  label: string,
  overrideKey: 'by_sku' | 'by_code',
  pattern: RegExp,
  errors: string[],
  fallbackDefault: VisibilityFlags
): VisibilityPerItem<string> {
  const bucket: Record<string, unknown> = isRecord(raw) ? raw : {};
  const defaultFlags = normaliseFlags(bucket.default as Partial<VisibilityFlags> | undefined, fallbackDefault);

  const overrideMap: Record<string, VisibilityFlags> = {};
  const overrideInput = bucket[overrideKey];
  if (overrideInput !== undefined) {
    if (!isRecord(overrideInput)) {
      errors.push(`${label}.${overrideKey} must be an object`);
      return { default: defaultFlags };
    }
    for (const [key, value] of Object.entries(overrideInput)) {
      if (!pattern.test(key)) {
        errors.push(`${label}.${overrideKey}.${key} has invalid format`);
        continue;
      }
      const flags = normaliseFlags(value as Partial<VisibilityFlags> | undefined, defaultFlags);
      overrideMap[key] = flags;
    }
  }

  return {
    default: defaultFlags,
    [overrideKey]: overrideMap,
  } as VisibilityPerItem<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
