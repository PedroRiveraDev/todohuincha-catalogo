import Ajv from 'ajv/dist/2020.js';
import { invalidateCache } from './admin-storage';

const CATALOG_PATH = 'docs/catalogo_productos_robusto_completo_corregido.json';
const SCHEMA_PATH = 'docs/catalogo_productos_schema_validacion_corregido.json';
const STRING_LIMIT = 2000;

export interface CategoryEditorItem {
  code: string;
  description: string;
  bannerUrl: string;
  backgroundUrl: string;
}

export interface CategoryPayloadResult {
  ok: boolean;
  payload?: CategoryEditorItem[];
  errors: string[];
}

export function parseCategoryEditorPayload(input: unknown): CategoryPayloadResult {
  const errors: string[] = [];
  if (!isRecord(input) || !Array.isArray(input.categories)) {
    return { ok: false, errors: ['categories must be an array.'] };
  }

  const payload = input.categories.map((item, index) => parseCategoryItem(item, index, errors)).filter(Boolean) as CategoryEditorItem[];
  const seen = new Set<string>();
  for (const item of payload) {
    if (seen.has(item.code)) errors.push(`categories contains duplicate code ${item.code}.`);
    seen.add(item.code);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, payload, errors: [] };
}

export function buildCategoryDictionary(
  existingDictionary: Record<string, unknown>,
  updates: CategoryEditorItem[]
): Record<string, unknown> {
  const nextDictionary: Record<string, unknown> = { ...existingDictionary };

  for (const update of updates) {
    const current = getRecord(existingDictionary[update.code]);
    if (!Object.keys(current).length) continue;

    const assets = getRecord(current.assets);
    const banner = getRecord(assets.banner);
    const background = getRecord(assets.background);

    nextDictionary[update.code] = {
      ...current,
      description: update.description,
      assets: {
        ...assets,
        banner: { ...banner, url: update.bannerUrl || null },
        background: { ...background, url: update.backgroundUrl || null },
      },
    };
  }

  return nextDictionary;
}

export async function writeCategoryEditorPayload(payload: CategoryEditorItem[]) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const root = process.cwd();
  const catalogPath = path.join(root, CATALOG_PATH);
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8')) as Record<string, unknown>;
  const schema = JSON.parse(await fs.readFile(path.join(root, SCHEMA_PATH), 'utf8')) as Record<string, unknown>;
  const dictionaries = getRecord(catalog.dictionaries);
  const dictionary = getRecord(dictionaries.category_dictionary);
  const missing = payload.filter((item) => !(item.code in dictionary)).map((item) => item.code);
  if (missing.length) return { ok: false as const, errors: [`Unknown category code(s): ${missing.join(', ')}`] };

  const updated = {
    ...catalog,
    dictionaries: {
      ...dictionaries,
      category_dictionary: buildCategoryDictionary(dictionary, payload),
    },
  };

  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile(schema);
  if (!validate(updated)) {
    const errors = (validate.errors ?? []).slice(0, 20).map((error) => `${error.instancePath || '/'}: ${error.message}`);
    return { ok: false as const, errors };
  }

  await fs.writeFile(catalogPath, JSON.stringify(updated, null, 2));
  invalidateCache();
  return { ok: true as const };
}

function parseCategoryItem(input: unknown, index: number, errors: string[]): CategoryEditorItem | null {
  if (!isRecord(input)) {
    errors.push(`categories[${index}] must be an object.`);
    return null;
  }

  const code = cleanCode(input.code);
  if (!code) errors.push(`categories[${index}].code is required.`);

  return {
    code,
    description: cleanText(input.description),
    bannerUrl: cleanText(input.bannerUrl),
    backgroundUrl: cleanText(input.backgroundUrl),
  };
}

function cleanCode(value: unknown): string {
  return cleanText(value).replace(/[^A-Z0-9_.-]/g, '').slice(0, 80);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, STRING_LIMIT) : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
