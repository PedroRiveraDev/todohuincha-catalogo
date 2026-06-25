#!/usr/bin/env node
// scripts/reclassify-service-items-to-products.mjs
// Reclasifica los items de items[] con item_type == "service" a item_type == "simple_product".
// Segun confirmacion del usuario (sesion 2026-06-24):
//   - El Excel CODIGOS_TH.xlsx solo contiene productos y repuestos.
//   - Los 33 items con type "service" en items[] (RECALQUE 30, TENSIONADO 10", etc.)
//     son productos (tienen SKU, nombre y precio como cualquier producto).
//   - Los 10 servicios abstractos viven en service_catalog[] y NO se tocan.
//
// Cambios aplicados a cada item afectado:
//   - item_type: "service" -> "simple_product"
//   - service_profile: ELIMINADO
//   - item_subtype_code: MANTENIDO (sigue describiendo el subtipo: recalque, tensionado, soldadura)
//   - entity_class: MANTENIDO
//   - resto: sin cambios
//
// Tambien actualiza catalog.totals.item_types:
//   - service: 33 -> 0
//   - simple_product: 525 -> 558

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TARGET = resolve(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json');
const SCHEMA = resolve(ROOT, 'docs', 'catalogo_productos_schema_validacion_corregido.json');

async function main() {
  console.log(`Leyendo ${TARGET}...`);
  const raw = await readFile(TARGET, 'utf8');
  const data = JSON.parse(raw);

  const items = data.items ?? [];
  const before = { service: 0, simple_product: 0, spare_part: 0, machinery: 0 };
  for (const it of items) before[it.item_type] = (before[it.item_type] ?? 0) + 1;
  console.log('Antes:', before);

  let reclassified = 0;
  for (const item of items) {
    if (item.item_type === 'service') {
      item.item_type = 'simple_product';
      delete item.service_profile;
      reclassified++;
    }
  }
  console.log(`Items reclasificados: ${reclassified}`);

  // Actualizar totales
  const after = { service: 0, simple_product: 0, spare_part: 0, machinery: 0 };
  for (const it of items) after[it.item_type] = (after[it.item_type] ?? 0) + 1;
  console.log('Despues:', after);

  if (data.catalog?.totals?.item_types) {
    data.catalog.totals.item_types = after;
    console.log('catalog.totals.item_types actualizado.');
  }

  // Validar contra schema antes de escribir
  console.log('Validando contra schema...');
  const schema = JSON.parse(await readFile(SCHEMA, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false, verbose: false });
  const validate = ajv.compile(schema);
  const ok = validate(data);
  if (!ok) {
    console.error('FAIL: el JSON NO cumple el schema.');
    const errs = validate.errors ?? [];
    console.error(`Total errores: ${errs.length}`);
    for (const e of errs.slice(0, 10)) {
      console.error(`  ${e.instancePath || '<root>'}: ${e.message}`);
    }
    process.exit(1);
  }
  console.log('OK: validacion de schema.');

  // Escribir
  console.log('Serializando...');
  const out = JSON.stringify(data, null, 2) + '\n';
  await writeFile(TARGET, out, 'utf8');
  console.log(`Escrito: ${TARGET} (${out.length} chars)`);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
