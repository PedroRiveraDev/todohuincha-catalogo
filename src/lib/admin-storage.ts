// src/lib/admin-storage.ts
// Read and write catalog_generation inside the main catalog JSON.
//
// The admin edits `catalog_generation.output_types.<type>.layout` and
// `.rules` to configure how PDFs are generated. We do NOT create new
// top-level keys; everything lives inside the schema-permitted blocks.
//
// All writes go through AJV validation against the catalog schema so we
// never produce an invalid JSON. The JSON file is the only source of truth.

import Ajv from 'ajv/dist/2020.js';
import type { CatalogConfigLayout, AdminRule, OutputTypeKey } from './admin-types';

const CATALOG_PATH = 'docs/catalogo_productos_robusto_completo_corregido.json';
const SCHEMA_PATH = 'docs/catalogo_productos_schema_validacion_corregido.json';

// ---------------------------------------------------------------------------
// Module-scope state (loaded lazily, mutated by writes, re-validated)
// ---------------------------------------------------------------------------

let cachedCatalog: unknown | null = null;
let cachedSchema: unknown | null = null;

async function readCatalogFromDisk(): Promise<unknown> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const ROOT = process.cwd();
  const raw = await fs.readFile(path.join(ROOT, CATALOG_PATH), 'utf8');
  return JSON.parse(raw);
}

async function loadCatalog(): Promise<unknown> {
  if (cachedCatalog) return cachedCatalog;
  cachedCatalog = await readCatalogFromDisk();
  return cachedCatalog;
}

async function loadSchema(): Promise<unknown> {
  if (cachedSchema) return cachedSchema;
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const ROOT = process.cwd();
  const raw = await fs.readFile(path.join(ROOT, SCHEMA_PATH), 'utf8');
  cachedSchema = JSON.parse(raw);
  return cachedSchema;
}

/**
 * Resets the in-memory cache so the next read re-fetches from disk.
 * Call this when you know the file changed externally.
 */
export function invalidateCache(): void {
  cachedCatalog = null;
  cachedSchema = null;
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Reads the current catalog_generation block. Returns null if the
 * JSON doesn't have one yet (first run after init script).
 */
export async function readCatalogGeneration(): Promise<unknown | null> {
  const catalog = (await loadCatalog()) as Record<string, unknown>;
  return (catalog.catalog_generation ?? null) as unknown | null;
}

/**
 * Reads the layout for a specific output_type. Returns null if no
 * layout configured yet.
 */
export async function readOutputLayout(
  outputType: OutputTypeKey
): Promise<CatalogConfigLayout | null> {
  const gen = (await readCatalogGeneration()) as Record<string, unknown> | null;
  if (!gen) return null;
  const outputTypes = (gen.output_types ?? {}) as Record<string, unknown>;
  const out = (outputTypes[outputType] ?? null) as Record<string, unknown> | null;
  if (!out) return null;
  return ((out as Record<string, unknown>).layout ?? null) as CatalogConfigLayout | null;
}

export async function readOutputRules(
  outputType: OutputTypeKey
): Promise<AdminRule[] | null> {
  const gen = (await readCatalogGeneration()) as Record<string, unknown> | null;
  if (!gen) return null;
  const outputTypes = (gen.output_types ?? {}) as Record<string, unknown>;
  const out = (outputTypes[outputType] ?? null) as Record<string, unknown> | null;
  if (!out) return null;
  return (((out as Record<string, unknown>).rules ?? []) as AdminRule[]) ?? [];
}

// ---------------------------------------------------------------------------
// Write helpers (AJV-validated)
// ---------------------------------------------------------------------------

/**
 * Saves the full catalog_generation block back to the JSON file.
 * Validates against the schema before writing. Throws on validation
 * failure with the AJV errors.
 */
export async function writeCatalogGeneration(
  generation: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const ROOT = process.cwd();

  const catalog = (await readCatalogFromDisk()) as Record<string, unknown>;
  const schema = await loadSchema();

  const updated = { ...catalog, catalog_generation: generation };
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile(schema as Record<string, unknown>);
  const valid = validate(updated);
  if (!valid) {
    const errors = (validate.errors ?? []).slice(0, 20).map(
      (e) => `${e.instancePath || '/'}: ${e.message}`
    );
    return { ok: false, errors };
  }

  await fs.writeFile(path.join(ROOT, CATALOG_PATH), JSON.stringify(updated, null, 2));
  invalidateCache();
  return { ok: true };
}

/**
 * Saves just the layout for one output_type. Preserves other
 * output_types and other top-level keys.
 */
export async function writeOutputLayout(
  outputType: OutputTypeKey,
  layout: CatalogConfigLayout
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const gen = ((await readCatalogGeneration()) ?? {}) as Record<string, unknown>;
  const outputTypes = ((gen.output_types ?? {}) as Record<string, unknown>);
  const existingOut = ((outputTypes[outputType] ?? {}) as Record<string, unknown>);
  const updatedOut = { ...existingOut, layout };
  const updatedGen = {
    ...gen,
    output_types: { ...outputTypes, [outputType]: updatedOut },
  };
  return await writeCatalogGeneration(updatedGen);
}

/**
 * Saves just the rules for one output_type.
 */
export async function writeOutputRules(
  outputType: OutputTypeKey,
  rules: AdminRule[]
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const gen = ((await readCatalogGeneration()) ?? {}) as Record<string, unknown>;
  const outputTypes = ((gen.output_types ?? {}) as Record<string, unknown>);
  const existingOut = ((outputTypes[outputType] ?? {}) as Record<string, unknown>);
  const updatedOut = { ...existingOut, rules };
  const updatedGen = {
    ...gen,
    output_types: { ...outputTypes, [outputType]: updatedOut },
  };
  return await writeCatalogGeneration(updatedGen);
}
