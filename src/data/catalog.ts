// src/data/catalog.ts
// Re-export shim for the v2 catalog. NO mapping logic lives here — the
// legacy projection is computed inside src/lib/catalog.ts (adapter) and
// this file just re-exports it under the names existing pages import.
//
// Refs:
//   openspec/changes/catalog-v2-ui-migration-slice-1/design.md (section 3)

import { adapter } from '../lib/catalog';

export { adapter };

export const {
  items,
  families,
  categories,
  serviceCategories,
  duplicates,
  legacyView,
} = adapter;

export const legacyCatalog = legacyView;
export const legacyCategories = legacyView.categories;
export const legacyProducts = legacyView.products;
export const products = legacyProducts;

export const catalog = {
  items,
  families,
  categories,
  serviceCategories,
  total_products: items.length,
  total_categories: categories.length,
};

export const getCategory = (slug: string) =>
  categories.find((c) => c.slug === slug);

export const getProduct = (categorySlug: string, reference: string) =>
  legacyProducts.find(
    (p) => p.category.slug === categorySlug && p.internal_reference === reference
  );
