#!/usr/bin/env node
// scripts/strip-pdf-references.mjs
// Saca todo rastro de PDFs del modelo de datos.
// Inputs:  catalogo_productos_robusto_completo_corregido.json
// Outputs: el mismo archivo limpio

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TARGET = resolve(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json');

// Sentinel para indicar que la info vino de un PDF del desarrollador.
// NO es una referencia al PDF: es metadata de origen del dato.
const PDF_DERIVED_SOURCE = 'imported_from_pdf_to_json';

function isPdfRef(value) {
  if (typeof value !== 'string') return false;
  return /\.pdf(\s|$)/i.test(value);
}

function cleanPriceObservation(obs) {
  if (!obs || typeof obs !== 'object') return obs;
  const out = { ...obs };
  if (out.source_type === 'technical_sheet_pdf') {
    out.source_type = 'technical_sheet';
  }
  if (typeof out.source_file === 'string' && isPdfRef(out.source_file)) {
    delete out.source_file;
  }
  return out;
}

function cleanItem(item) {
  if (!item || typeof item !== 'object') return item;

  // source.catalog_file -> si apuntaba a PDF, marcar como derivado
  if (item.source && typeof item.source === 'object') {
    if (isPdfRef(item.source.catalog_file)) {
      item.source.catalog_file = PDF_DERIVED_SOURCE;
      item.source.source_kind = 'technical_sheet_pdf';
      item.source.sheet_name = null;
      item.source.sheet_slug = null;
    }
  }

  // pricing.price_observations[]
  if (item.pricing && Array.isArray(item.pricing.price_observations)) {
    item.pricing.price_observations = item.pricing.price_observations.map(cleanPriceObservation);
  }

  // machinery_profile.price_observations[]
  if (item.machinery_profile && Array.isArray(item.machinery_profile.price_observations)) {
    item.machinery_profile.price_observations = item.machinery_profile.price_observations.map(cleanPriceObservation);
  }

  return item;
}

function cleanCatalog(catalog) {
  // catalog.source_files -> delete
  if (catalog.source_files !== undefined) {
    delete catalog.source_files;
  }

  // catalog.totals
  if (catalog.totals && typeof catalog.totals === 'object') {
    delete catalog.totals.reference_documents;
    delete catalog.totals.reference_documents_used_as_templates;
    delete catalog.totals.items_with_documents;
  }

  return catalog;
}

function cleanCatalogGeneration(gen) {
  if (!gen || typeof gen !== 'object') return gen;
  if (gen.reference_pdf_policy !== undefined) {
    delete gen.reference_pdf_policy;
  }
  // Tambien: si output_types tiene campos raros, mantenerlos; solo sacamos policy.
  return gen;
}

function ensureSubtypeDictionary(dictionaries) {
  if (!dictionaries || typeof dictionaries !== 'object') return dictionaries;
  if (dictionaries.subtype_dictionary === undefined) {
    dictionaries.subtype_dictionary = {};
  }
  return dictionaries;
}

async function main() {
  console.log(`Leyendo ${TARGET}...`);
  const raw = await readFile(TARGET, 'utf8');
  const data = JSON.parse(raw);

  // 1. catalog.source_files y catalog.totals
  cleanCatalog(data.catalog);

  // 2. reference_documents array top-level
  if (data.reference_documents !== undefined) {
    delete data.reference_documents;
  }

  // 3. catalog_generation.reference_pdf_policy
  cleanCatalogGeneration(data.catalog_generation);

  // 4. dictionaries.subtype_dictionary
  ensureSubtypeDictionary(data.dictionaries);

  // 5. items[]: limpiar referencias a PDFs
  if (Array.isArray(data.items)) {
    let touched = 0;
    for (const item of data.items) {
      cleanItem(item);
      touched++;
    }
    console.log(`Items procesados: ${touched}`);
  }

  // Serializar
  console.log('Serializando...');
  const out = JSON.stringify(data, null, 2) + '\n';

  await writeFile(TARGET, out, 'utf8');
  console.log(`OK: ${TARGET} escrito (${out.length} chars)`);

  // Sanity checks
  const verify = JSON.parse(await readFile(TARGET, 'utf8'));
  const checks = {
    'catalog.source_files removido': verify.catalog.source_files === undefined,
    'catalog.totals.reference_documents removido': verify.catalog.totals.reference_documents === undefined,
    'catalog.totals.items_with_documents removido': verify.catalog.totals.items_with_documents === undefined,
    'reference_documents removido': verify.reference_documents === undefined,
    'reference_pdf_policy removido': verify.catalog_generation.reference_pdf_policy === undefined,
    'subtype_dictionary presente': typeof verify.dictionaries.subtype_dictionary === 'object',
    'items count': Array.isArray(verify.items) ? verify.items.length : 0,
    'families count': Array.isArray(verify.families) ? verify.families.length : 0,
    'service_catalog count': Array.isArray(verify.service_catalog) ? verify.service_catalog.length : 0,
  };
  console.log('\nVerificacion:');
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${v ? 'OK' : 'FAIL'}: ${k} = ${v}`);
  }
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
