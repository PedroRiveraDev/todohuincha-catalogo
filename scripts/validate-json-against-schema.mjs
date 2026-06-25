#!/usr/bin/env node
// scripts/validate-json-against-schema.mjs
// Valida catalogo_productos_robusto_completo_corregido.json
// contra catalogo_productos_schema_validacion_corregido.json usando AJV.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCHEMA_PATH = resolve(ROOT, 'docs', 'catalogo_productos_schema_validacion_corregido.json');
const DATA_PATH = resolve(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json');

async function main() {
  console.log('Leyendo schema y datos...');
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  const data = JSON.parse(await readFile(DATA_PATH, 'utf8'));

  // AJV con draft 2020-12, todos los errores, strict false (somos permisivos con additionalProperties).
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    verbose: true,
  });

  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (err) {
    console.error('Error compilando schema:', err.message);
    process.exit(2);
  }

  console.log('Validando...');
  const ok = validate(data);

  if (ok) {
    console.log('OK: el JSON cumple el schema.');
    console.log(`Items: ${data.items.length}`);
    console.log(`Families: ${data.families.length}`);
    console.log(`Service catalog: ${data.service_catalog.length}`);
    return;
  }

  console.error('FAIL: el JSON NO cumple el schema.');
  const errs = validate.errors || [];
  console.error(`Total de errores: ${errs.length}`);
  console.error('Primeros 20 errores:');
  errs.slice(0, 20).forEach((e, i) => {
    console.error(`  [${i + 1}] ${e.instancePath || '<root>'}: ${e.message}`);
    if (e.params) console.error(`      params: ${JSON.stringify(e.params)}`);
  });

  process.exit(1);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
