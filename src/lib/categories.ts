// src/lib/categories.ts
// Pure helpers for grouping categories and sorting catalog items by
// display_name. Consumed by src/pages/catalogo/index.astro and (later)
// CategorySidebar / product detail pages.
//
// Slice 2 of catalog-v2-ui-migration.
// Refs:
//   openspec/changes/catalog-v2-ui-migration-slice-2/spec.md
//   openspec/changes/catalog-v2-ui-migration-slice-2/design.md (section 3)

import type { CategorySummary } from './catalog.ts';
import type { CatalogItem } from '../data/catalog-client.ts';

// ---------------------------------------------------------------------------
// CATEGORY_GROUP_ORDER (the hardcoded 8-group contract)
// ---------------------------------------------------------------------------

/**
 * Fixed order of the 8 category groups shown in the sidebar and section
 * headers on the catalog landing page. Adapter can re-order categories;
 * this list is the sidebar contract.
 */
export const CATEGORY_GROUP_ORDER: readonly string[] = [
  'sierras',
  'consumibles',
  'cuchillos',
  'herramientas',
  'materiales',
  'servicios',
  'maquinaria',
  'instrumentos',
] as const;

// ---------------------------------------------------------------------------
// groupCategoriesByGroup
// ---------------------------------------------------------------------------

/**
 * Group categories by `category.group` in the fixed `CATEGORY_GROUP_ORDER`.
 * The returned Map has 0..8 entries, keyed in the contract order
 * (empty input -> empty Map; groups with zero categories are omitted).
 * Categories whose group is not in the contract are dropped.
 * Within a group, categories preserve their input order.
 */
export function groupCategoriesByGroup(
  categories: CategorySummary[]
): Map<string, CategorySummary[]> {
  // First pass: bucket categories by group (preserves input order within groups).
  const buckets = new Map<string, CategorySummary[]>();
  for (const cat of categories) {
    if (!CATEGORY_GROUP_ORDER.includes(cat.group)) continue;
    const bucket = buckets.get(cat.group) ?? [];
    bucket.push(cat);
    buckets.set(cat.group, bucket);
  }

  // Second pass: rebuild a new Map whose iteration order follows
  // CATEGORY_GROUP_ORDER. Empty groups are skipped, so an empty input
  // returns an empty Map (not 8 empty buckets).
  const result = new Map<string, CategorySummary[]>();
  for (const key of CATEGORY_GROUP_ORDER) {
    const bucket = buckets.get(key);
    if (bucket) result.set(key, bucket);
  }
  return result;
}

// ---------------------------------------------------------------------------
// sortItemsByDisplayName
// ---------------------------------------------------------------------------

/**
 * Return a new array sorted by `display_name` using the `es` locale
 * (`sensitivity: 'base'`: case and accent insensitive). The input array
 * is not mutated.
 */
export function sortItemsByDisplayName(items: CatalogItem[]): CatalogItem[] {
  return [...items].sort((a, b) =>
    a.display_name.localeCompare(b.display_name, 'es', { sensitivity: 'base' })
  );
}