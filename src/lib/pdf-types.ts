// src/lib/pdf-types.ts
// Density-based template dispatcher. Routes each item to one of three
// visual templates based on how much structured data the item carries:
//
//   - 'denso'    -> heavy machinery with many specs and/or features
//                   (renders as a 2-column technical sheet with grouped
//                   specification tables, like the TUPI 3HP reference)
//   - 'medio'    -> items with some specs or features
//                   (renders as a card with bullet list and inline specs)
//   - 'compacto' -> items with no structured data, only display_name + price
//                   (renders as a flat grouped table, like the CUCHILLO
//                   INDUSTRIAL reference)
//
// Density is decided per item, independently of item_type. A machinery
// item with no machinery_profile falls back to 'compacto' gracefully.
//
// Slice pdf-catalog-v2.
// Refs:
//   docs/INVENTARIO_CATEGORIAS.md (research notes)
//   openspec/changes/pdf-catalog-v2/spec.md

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PdfItemDensity = 'denso' | 'medio' | 'compacto';

export interface PdfMachineryProfile {
  model?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  short_description?: string | null;
  long_description?: string | null;
  use_case?: string | null;
  recommended_for?: string | null;
  features?: string[] | null;
  specification_groups?: Array<{
    group_code?: string;
    label?: string;
    description?: string | null;
    values?: Array<{
      label?: string;
      value_text?: string | null;
      value_number?: number | null;
      unit?: string | null;
      raw?: string | null;
    }>;
  }> | null;
  raw_specification_lines?: string[] | null;
  price_observations?: unknown[] | null;
  source_pdf?: unknown;
}

export interface PdfItemLike {
  sku?: string;
  display_name?: string;
  item_type?: string;
  item_subtype_code?: string | null;
  category_code?: string;
  category_label?: string;
  category_group?: string;
  machinery_profile?: PdfMachineryProfile | null;
  service_profile?: unknown;
  specifications?: Record<string, unknown> | null;
  pricing?: {
    sale_amount?: number | null;
    currency?: string;
    formatted?: string;
    is_price_available?: boolean;
  };
  assets?: {
    main_image?: { url?: string | null; data_base64?: string | null } | null;
    gallery?: Array<{ url?: string | null; data_base64?: string | null }>;
  } | null;
}

// ---------------------------------------------------------------------------
// Density classification
// ---------------------------------------------------------------------------

/**
 * Count how many concrete spec rows an item carries across all
 * specification_groups. Ignores empty groups.
 */
export function countSpecRows(item: PdfItemLike | null | undefined): number {
  if (!item) return 0;
  const groups = item.machinery_profile?.specification_groups ?? [];
  let total = 0;
  for (const g of groups) {
    if (Array.isArray(g.values)) total += g.values.length;
  }
  return total;
}

/**
 * Count how many feature bullets the item has.
 */
export function countFeatures(item: PdfItemLike | null | undefined): number {
  if (!item) return 0;
  return Array.isArray(item.machinery_profile?.features)
    ? (item.machinery_profile!.features ?? []).length
    : 0;
}

/**
 * Returns the density bucket for an item. Throws on null/undefined so
 * silent fallback does not mask bugs in caller code.
 *
 * Heuristics (per user reference captures):
 *   - DENSO: 5+ spec rows OR 4+ features  -> full machinery sheet
 *   - MEDIO: any spec row OR any feature  -> card with bullet list
 *   - COMPACTO: no structured data           -> flat grouped table row
 */
export function classifyDensity(item: PdfItemLike | null | undefined): PdfItemDensity {
  if (item === null || item === undefined) {
    throw new Error('classifyDensity: item is required');
  }
  const specs = countSpecRows(item);
  const features = countFeatures(item);

  if (specs >= 5 || features >= 4) return 'denso';
  if (specs >= 1 || features >= 1) return 'medio';
  return 'compacto';
}

/**
 * Returns true when the item has any usable image source. Used by the
 * renderer to decide between the real image, the category banner, and
 * the brand placeholder SVG.
 */
export function hasImage(item: PdfItemLike | null | undefined): boolean {
  if (!item) return false;
  const main = item.assets?.main_image;
  if (main) {
    if (typeof main.data_base64 === 'string' && main.data_base64.length > 0) return true;
    if (typeof main.url === 'string' && main.url.length > 0) return true;
  }
  const gallery = item.assets?.gallery ?? [];
  for (const g of gallery) {
    if (typeof g?.data_base64 === 'string' && g.data_base64.length > 0) return true;
    if (typeof g?.url === 'string' && g.url.length > 0) return true;
  }
  return false;
}