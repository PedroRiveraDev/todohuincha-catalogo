// src/lib/catalog.ts
// Build-time adapter for the v2 catalog. Sole owner of AJV validation,
// SKU dedup, derived collections, helper API, and the legacyView projection
// consumed by src/data/catalog.ts (the shim).
//
// Refs:
//   openspec/changes/catalog-v2-ui-migration-slice-1/proposal.md
//   openspec/changes/catalog-v2-ui-migration-slice-1/spec.md
//   openspec/changes/catalog-v2-ui-migration-slice-1/design.md

import { loadCatalog, loadSchema } from './catalog-source';
import type {
  CatalogItem,
  Catalog,
  JSONSchema,
  ServiceProfile,
} from '../data/catalog-client';
import Ajv from 'ajv/dist/2020.js';

// ---------------------------------------------------------------------------
// Local type declarations
// ---------------------------------------------------------------------------

export interface LegacyProduct {
  internal_reference: string;
  name: string;
  sale_price: number;
  category: { title: string; slug: string };
}

export interface LegacyCategory {
  title: string;
  slug: string;
  products_count: number;
  products: LegacyProduct[];
  /** Alias for backward compat with code reading `category.label`. */
  label: string;
}

export interface CategorySummary {
  code: string;
  label: string;
  slug: string;
  group: string;
  products_count: number;
  items: CatalogItem[];
  /** Alias: existing pages read `category.title`. */
  title: string;
  /** Alias: existing pages read `category.products[].internal_reference`. */
  products: LegacyProduct[];
}

export interface ServiceCategorySummary {
  service_code: string;
  service_name: string;
  pricing_mode: ServiceProfile['pricing_mode'];
  is_schedulable: boolean;
  requires_diagnosis: boolean;
  capabilities: unknown[];
}

export interface LegacyView {
  categories: LegacyCategory[];
  products: LegacyProduct[];
  catalog: {
    total_products: number;
    total_categories: number;
    categories: LegacyCategory[];
  };
}

// ---------------------------------------------------------------------------
// Load + validate
// ---------------------------------------------------------------------------

const [schemaRaw, catalogRaw] = await Promise.all([
  loadSchema() as Promise<JSONSchema>,
  loadCatalog() as Promise<Catalog>,
]);

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schemaRaw);
const valid = validate(catalogRaw);

if (!valid) {
  const summary = (validate.errors ?? [])
    .slice(0, 5)
    .map((e) => `${e.instancePath || '<root>'}: ${e.message}`)
    .join('; ');
  throw new Error(`Catalog schema mismatch: ${summary}`);
}

const catalog: Catalog = catalogRaw;

// ---------------------------------------------------------------------------
// Dedup items by sku (first wins)
// ---------------------------------------------------------------------------

const seenSku = new Set<string>();
const duplicates: string[] = [];
const uniqueItems: CatalogItem[] = [];

for (const it of catalog.items) {
  if (seenSku.has(it.sku)) {
    duplicates.push(it.sku);
    continue;
  }
  seenSku.add(it.sku);
  uniqueItems.push(it);
}

// ---------------------------------------------------------------------------
// Derived collections
// ---------------------------------------------------------------------------

const categoryDict = (catalog.dictionaries?.category_dictionary ?? {}) as Record<
  string,
  { label?: string; slug?: string; group?: string; category_group?: string }
>;

function toLegacyProduct(item: CatalogItem, category: CategorySummary): LegacyProduct {
  return {
    internal_reference: item.sku,
    name: item.display_name,
    sale_price: item.pricing?.sale_amount ?? 0,
    category: { title: category.label, slug: category.slug },
  };
}

function buildCategorySummary(
  code: string,
  dict: { label?: string; slug?: string; group?: string; category_group?: string },
  items: CatalogItem[]
): CategorySummary {
  const sorted = [...items].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const label = String(dict.label ?? code);
  const slug = String(dict.slug ?? code.toLowerCase());
  const group = String(dict.category_group ?? dict.group ?? '');

  const summary: CategorySummary = {
    code,
    label,
    slug,
    group,
    products_count: sorted.length,
    items: sorted,
    title: label,
    products: [],
  };
  summary.products = sorted.map((it) => toLegacyProduct(it, summary));
  return summary;
}

const categories: CategorySummary[] = (() => {
  const byCode = new Map<string, CatalogItem[]>();
  for (const it of uniqueItems) {
    const arr = byCode.get(it.category_code) ?? [];
    arr.push(it);
    byCode.set(it.category_code, arr);
  }
  const out: CategorySummary[] = [];
  for (const [code, items] of byCode) {
    const dict = categoryDict[code];
    if (!dict) continue; // skip orphan codes with no dictionary entry
    out.push(buildCategorySummary(code, dict, items));
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
})();

const serviceCategories: ServiceCategorySummary[] = (
  catalog.service_catalog as unknown as ServiceProfile[]
).map((s) => ({
  service_code: s.service_code,
  service_name: s.service_name,
  pricing_mode: s.pricing_mode,
  is_schedulable: s.is_schedulable,
  requires_diagnosis: s.requires_diagnosis,
  capabilities: s.capabilities ?? [],
}));

const families: unknown[] = catalog.families;

// ---------------------------------------------------------------------------
// Legacy view (v1 shape projection)
// ---------------------------------------------------------------------------

function buildLegacyView(cats: CategorySummary[]): LegacyView {
  const legacyCategories: LegacyCategory[] = cats.map((c) => ({
    title: c.label,
    slug: c.slug,
    products_count: c.products_count,
    products: c.products,
    label: c.label,
  }));

  // Flat product list: category order, then by internal_reference ascending.
  const flatProducts: LegacyProduct[] = [];
  for (const c of cats) {
    for (const p of c.products) {
      flatProducts.push(p);
    }
  }
  flatProducts.sort((a, b) => a.internal_reference.localeCompare(b.internal_reference));

  return {
    categories: legacyCategories,
    products: flatProducts,
    catalog: {
      total_products: flatProducts.length,
      total_categories: legacyCategories.length,
      categories: legacyCategories,
    },
  };
}

const legacyView: LegacyView = buildLegacyView(categories);

// ---------------------------------------------------------------------------
// Helpers (pure, operate on post-dedup items)
// ---------------------------------------------------------------------------

function getCategory(code: string): CategorySummary | undefined {
  return categories.find((c) => c.code === code);
}

function getCategoryBySlug(slug: string): CategorySummary | undefined {
  return categories.find((c) => c.slug === slug);
}

function getItem(sku: string): CatalogItem | undefined {
  return uniqueItems.find((it) => it.sku === sku);
}

function getFamilyByKey(familyKey: string): unknown | undefined {
  return families.find((f) => {
    const fam = f as { family_key?: string };
    return fam.family_key === familyKey;
  });
}

function itemsByCategory(code: string): CatalogItem[] {
  return getCategory(code)?.items ?? [];
}

function itemsByFamily(familyKey: string): CatalogItem[] {
  return uniqueItems.filter((it) => it.family_key === familyKey);
}

function itemsByType(t: CatalogItem['item_type']): CatalogItem[] {
  return uniqueItems.filter((it) => it.item_type === t);
}

function countByType(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const it of uniqueItems) {
    counts[it.item_type] = (counts[it.item_type] ?? 0) + 1;
  }
  return counts;
}

function countByGroup(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const it of uniqueItems) {
    const group = it.category_group || '<none>';
    counts[group] = (counts[group] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Adapter export (frozen, single source of truth)
// ---------------------------------------------------------------------------

export const adapter = Object.freeze({
  // raw v2 collections
  items: uniqueItems,
  families,
  serviceCategories,
  categories,
  duplicates,
  // v1-shape projection
  legacyView,
  // helpers
  getCategory,
  getCategoryBySlug,
  getItem,
  getFamilyByKey,
  itemsByCategory,
  itemsByFamily,
  itemsByType,
  countByType,
  countByGroup,
});
