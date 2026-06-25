// src/lib/catalog-source.ts
// Carga los archivos canonicos del catalogo (schema + datos) desde /docs en build time.
// En output: 'static' estos fs.readFile se ejecutan al build y el contenido se embebe
// en el bundle del endpoint. El cliente recibe el contenido como archivo estatico.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// src/lib -> ../../.. -> raiz del proyecto
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const DOCS_DIR = resolve(PROJECT_ROOT, 'docs');

const SCHEMA_PATH = resolve(DOCS_DIR, 'catalogo_productos_schema_validacion_corregido.json');
const CATALOG_PATH = resolve(DOCS_DIR, 'catalogo_productos_robusto_completo_corregido.json');

export interface CatalogPaths {
  schemaPath: string;
  catalogPath: string;
}

export function getCatalogPaths(): CatalogPaths {
  return {
    schemaPath: SCHEMA_PATH,
    catalogPath: CATALOG_PATH,
  };
}

export async function loadSchema(): Promise<unknown> {
  const raw = await readFile(SCHEMA_PATH, 'utf8');
  return JSON.parse(raw);
}

export async function loadCatalog(): Promise<unknown> {
  const raw = await readFile(CATALOG_PATH, 'utf8');
  return JSON.parse(raw);
}

export async function loadSchemaRaw(): Promise<string> {
  return readFile(SCHEMA_PATH, 'utf8');
}

export async function loadCatalogRaw(): Promise<string> {
  return readFile(CATALOG_PATH, 'utf8');
}

export const CATALOG_SLUG = 'catalogo-de-productos' as const;
