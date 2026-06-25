// tests/lib/__catalog-bad-loader.mjs
// Test helper used by catalog.test.mjs to exercise the AJV failure path.
// Runs the SAME load+validate pipeline as src/lib/catalog.ts, but against the
// poisoned fixture in __fixtures__/malformed.json. Kept as a real test asset
// so the negative test has a stable, fast loader.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv from 'ajv/dist/2020.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '__fixtures__', 'malformed.json');
const SCHEMA_PATH = resolve(
  __dirname,
  '..',
  '..',
  'docs',
  'catalogo_productos_schema_validacion_corregido.json'
);

export async function loadAndValidateBadCatalog() {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  const data = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (!valid) {
    const top5 = (validate.errors ?? [])
      .slice(0, 5)
      .map((e) => `${e.instancePath || '<root>'}: ${e.message}`)
      .join('; ');
    throw new Error(`Catalog schema mismatch: ${top5}`);
  }

  return data;
}
