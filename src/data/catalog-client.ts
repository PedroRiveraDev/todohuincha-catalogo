// src/data/catalog-client.ts
// Cliente para consumir el catalogo siguiendo el patron schema-first.
// El cliente primero pide /schema, lo cachea en localStorage, y valida
// la respuesta de /catalog.json contra el schema local antes de usarla.
//
// Documentacion del patron: seccion 12 de
// docs/especificacion_catalogo_industrial_primera_version_corregida.md

import Ajv, { type ValidateFunction } from 'ajv';

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export interface Money {
  sale_amount: number | null;
  currency: string;
  formatted: string | null;
  is_price_available: boolean;
}

export interface Status {
  is_active: boolean;
  is_price_zero: boolean;
  is_catalog_visible: boolean;
}

export interface ItemSource {
  catalog_file: string;
  sheet_name: string | null;
  sheet_slug: string | null;
  source_kind?: string;
}

export interface ItemSearch {
  normalized_name: string;
  tokens: string[];
  ai_semantic_context: string;
}

export interface ItemAssets {
  main_image: unknown;
  gallery: unknown[];
  suggested_storage_folder?: string;
  pdf_image_fallback_order?: string[];
}

export interface ServiceProfile {
  service_code: string;
  service_name: string;
  service_group?: string | null;
  pricing_mode: 'fixed' | 'range' | 'quoted' | 'by_measure' | 'by_hour';
  requires_diagnosis: boolean;
  is_schedulable: boolean;
  capabilities: unknown[];
}

export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  display_name: string;
  slug: string;
  family_key?: string | null;
  family_id?: string | null;
  variant_prefix?: string | null;
  entity_class: string;
  category_code: string;
  category_label: string;
  category_group: string;
  item_type: 'simple_product' | 'spare_part' | 'machinery' | 'service';
  item_subtype_code?: string | null;
  technical_profile_level: 'basic' | 'standard' | 'extended';
  pricing: Money;
  status: Status;
  source: ItemSource;
  search: ItemSearch;
  specifications: Record<string, unknown>;
  assets: ItemAssets;
  service_profile?: ServiceProfile;
  machinery_profile?: Record<string, unknown>;
  spare_part_profile?: Record<string, unknown>;
}

export interface Catalog {
  schema_version: string;
  catalog: Record<string, unknown>;
  catalog_assets: Record<string, unknown>;
  catalog_generation: Record<string, unknown>;
  asset_strategy: Record<string, unknown>;
  dictionary_version: Record<string, unknown>;
  dictionaries: Record<string, Record<string, unknown>>;
  families: unknown[];
  items: CatalogItem[];
  service_catalog: unknown[];
}

export interface JSONSchema {
  $id?: string;
  $schema?: string;
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Cache keys y TTL
// ---------------------------------------------------------------------------

const SCHEMA_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

function schemaKey(slug: string): string {
  return `th:schema:${slug}`;
}

function schemaTsKey(slug: string): string {
  return `th:schema:${slug}:ts`;
}

function catalogKey(slug: string): string {
  return `th:catalog:${slug}`;
}

function hasStorage(): boolean {
  try {
    return typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readStorage(key: string): string | null {
  if (!hasStorage()) return null;
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (!hasStorage()) return;
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // localStorage lleno o no disponible: ignorar
  }
}

function removeStorage(key: string): void {
  if (!hasStorage()) return;
  try {
    globalThis.localStorage.removeItem(key);
  } catch {
    // ignorar
  }
}

// ---------------------------------------------------------------------------
// Fetch con headers de cache
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  const data = (await res.json()) as T;
  return { data, headers: res.headers };
}

async function fetchSchemaRaw(slug: string): Promise<{ schema: JSONSchema; version: string }> {
  const url = `/api/catalogs/${slug}/schema.json`;
  const { data, headers } = await fetchJson<JSONSchema>(url);
  const version = headers.get('X-Schema-Version') ?? data?.$id ?? '1.0.0';
  return { schema: data, version };
}

async function fetchCatalogRaw(slug: string): Promise<{ catalog: Catalog; version: string }> {
  const url = `/api/catalogs/${slug}/catalog.json`;
  const { data, headers } = await fetchJson<Catalog>(url);
  const version = headers.get('X-Schema-Version') ?? data?.schema_version ?? '1.0.0';
  return { catalog: data, version };
}

// ---------------------------------------------------------------------------
// Validacion con AJV
// ---------------------------------------------------------------------------

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  verbose: false,
});

const validatorCache = new WeakMap<JSONSchema, ValidateFunction>();

function compileValidator(schema: JSONSchema): ValidateFunction {
  const cached = validatorCache.get(schema);
  if (cached) return cached;
  const validate = ajv.compile(schema);
  validatorCache.set(schema, validate);
  return validate;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[] | null;
}

export function validateAgainstSchema(schema: JSONSchema, data: unknown): ValidationResult {
  const validate = compileValidator(schema);
  const valid = validate(data) as boolean;
  if (valid) return { valid: true, errors: null };
  const errors = (validate.errors ?? []).map((e) => {
    const path = e.instancePath || '<root>';
    return `${path}: ${e.message}`;
  });
  return { valid: false, errors };
}

// ---------------------------------------------------------------------------
// API principal: schema
// ---------------------------------------------------------------------------

export interface GetSchemaOptions {
  forceRefresh?: boolean;
}

export async function getSchema(slug: string, options: GetSchemaOptions = {}): Promise<JSONSchema> {
  if (!options.forceRefresh) {
    const cached = readCachedSchema(slug);
    if (cached) return cached.schema;
  }

  const { schema, version } = await fetchSchemaRaw(slug);
  writeCachedSchema(slug, schema, version);
  return schema;
}

export function getCachedSchemaVersion(slug: string): string | null {
  return readStorage(schemaKey(slug) + ':v');
}

function readCachedSchema(slug: string): { schema: JSONSchema; version: string } | null {
  const raw = readStorage(schemaKey(slug));
  const tsRaw = readStorage(schemaTsKey(slug));
  const version = readStorage(schemaKey(slug) + ':v');
  if (!raw || !tsRaw || !version) return null;
  const age = Date.now() - Number(tsRaw);
  if (age >= SCHEMA_TTL_MS) return null;
  try {
    return { schema: JSON.parse(raw) as JSONSchema, version };
  } catch {
    return null;
  }
}

function writeCachedSchema(slug: string, schema: JSONSchema, version: string): void {
  writeStorage(schemaKey(slug), JSON.stringify(schema));
  writeStorage(schemaTsKey(slug), String(Date.now()));
  writeStorage(schemaKey(slug) + ':v', version);
}

// ---------------------------------------------------------------------------
// API principal: catalog
// ---------------------------------------------------------------------------

export interface GetCatalogOptions {
  forceRefresh?: boolean;
}

export async function getCatalog(slug: string, options: GetCatalogOptions = {}): Promise<Catalog> {
  const schema = await getSchema(slug, { forceRefresh: options.forceRefresh });

  if (!options.forceRefresh) {
    const cached = readCachedCatalog(slug);
    if (cached) return cached;
  }

  const { catalog } = await fetchCatalogRaw(slug);

  const validation = validateAgainstSchema(schema, catalog);
  if (!validation.valid) {
    // Forzar refresh del schema por si quedo desincronizado
    const { schema: freshSchema } = await fetchSchemaRaw(slug);
    writeCachedSchema(slug, freshSchema, getCachedSchemaVersion(slug) ?? '1.0.0');
    const retry = validateAgainstSchema(freshSchema, catalog);
    if (!retry.valid) {
      throw new Error(
        `Schema mismatch after refresh: ${(retry.errors ?? []).slice(0, 3).join('; ')}`
      );
    }
  }

  writeCachedCatalog(slug, catalog);
  return catalog;
}

function readCachedCatalog(slug: string): Catalog | null {
  const raw = readStorage(catalogKey(slug));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Catalog;
  } catch {
    return null;
  }
}

function writeCachedCatalog(slug: string, catalog: Catalog): void {
  writeStorage(catalogKey(slug), JSON.stringify(catalog));
}

// ---------------------------------------------------------------------------
// Helpers de busqueda
// ---------------------------------------------------------------------------

export function findItemBySku(catalog: Catalog, sku: string): CatalogItem | null {
  return catalog.items.find((it) => it.sku === sku) ?? null;
}

export function listItemsByCategory(catalog: Catalog, categoryCode: string): CatalogItem[] {
  return catalog.items.filter((it) => it.category_code === categoryCode);
}

export function listItemsByFamily(catalog: Catalog, familyKey: string): CatalogItem[] {
  return catalog.items.filter((it) => it.family_key === familyKey);
}

export function listItemsByType(
  catalog: Catalog,
  itemType: CatalogItem['item_type']
): CatalogItem[] {
  return catalog.items.filter((it) => it.item_type === itemType);
}

export function searchItems(catalog: Catalog, query: string): CatalogItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return catalog.items;
  return catalog.items.filter((it) => {
    const haystack = [
      it.name,
      it.display_name,
      it.sku,
      it.category_label,
      it.entity_class,
      ...(it.search?.tokens ?? []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

// ---------------------------------------------------------------------------
// Limpieza de cache
// ---------------------------------------------------------------------------

export function clearCatalogCache(slug: string): void {
  removeStorage(schemaKey(slug));
  removeStorage(schemaTsKey(slug));
  removeStorage(schemaKey(slug) + ':v');
  removeStorage(catalogKey(slug));
}
