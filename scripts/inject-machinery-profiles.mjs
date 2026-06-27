// scripts/inject-machinery-profiles.mjs
// Inject parsed machinery_profile data into the main catalog JSON
// WITHOUT modifying the schema. Only populates null/empty values.
// Run: node scripts/inject-machinery-profiles.mjs

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';

const ROOT = process.cwd();
const CATALOG_PATH = join(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json');
const SCHEMA_PATH = join(ROOT, 'docs', 'catalogo_productos_schema_validacion_corregido.json');
const PARSED_PATH = join(ROOT, 'docs', 'pdf_metadata_markdown', 'parsed.json');
const BACKUP_PATH = join(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json.bak');

const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
const parsed = JSON.parse(await readFile(PARSED_PATH, 'utf8'));

// Backup first
await copyFile(CATALOG_PATH, BACKUP_PATH);
console.log(`Backed up to ${BACKUP_PATH}`);

// Index parsed items by SKU
const parsedBySku = new Map();
for (const it of parsed.items) {
  parsedBySku.set(it.sku, it);
}

// Track changes
let machineryProfileInjected = 0;
let priceInjected = 0;
let sourcePdfInjected = 0;
const changes = [];

// Process each item in catalog
for (const item of catalog.items) {
  if (item.item_type !== 'machinery') continue;
  const parsedItem = parsedBySku.get(item.sku);
  if (!parsedItem) continue;

  // Build machinery_profile from parsed data
  const machineryProfile = {
    model: parsedItem.model ?? null,
    brand: null,  // not extracted from .md
    manufacturer: null,
    short_description: parsedItem.title ?? null,
    long_description: null,
    use_case: null,
    recommended_for: null,
    features: parsedItem.features ?? [],
    specification_groups: parsedItem.specification_groups ?? [],
    raw_specification_lines: parsedItem.raw_specification_lines ?? [],
    price_observations: parsedItem.price ? [{
      label: 'Precio',
      value_text: parsedItem.price.formatted,
      currency: parsedItem.currency ?? 'CLP',
      includes_iva: parsedItem.iva_included ?? true,
    }] : [],
    source_pdf: parsedItem.source_pdf ?? null,
  };

  // Inject
  item.machinery_profile = machineryProfile;
  machineryProfileInjected++;
  changes.push({
    sku: item.sku,
    title: parsedItem.title,
    spec_count: machineryProfile.specification_groups.reduce((s, g) => s + g.values.length, 0),
    feature_count: machineryProfile.features.length,
    price: parsedItem.price?.sale_amount ?? null,
    parsing_warnings: parsedItem.parsing_warnings ?? [],
  });

  // Inject price if missing
  if (parsedItem.price && (item.pricing?.sale_amount == null || item.pricing?.sale_amount === 0)) {
    if (!item.pricing) item.pricing = {};
    item.pricing.sale_amount = parsedItem.price.sale_amount;
    if (!item.pricing.currency) item.pricing.currency = parsedItem.currency ?? 'CLP';
    if (!item.pricing.formatted) item.pricing.formatted = parsedItem.price.formatted;
    item.pricing.is_price_available = true;
    priceInjected++;
  }

  // Inject source_pdf if missing
  if (parsedItem.source_pdf && !item.source_pdf) {
    item.source_pdf = parsedItem.source_pdf;
    sourcePdfInjected++;
  }
}

// Write updated catalog
await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2));
console.log(`Updated ${CATALOG_PATH}`);

// Validate with AJV
console.log('\nValidating updated catalog against schema...');
const ajv = new Ajv({ strict: false, allErrors: false });
const validate = ajv.compile(schema);
const valid = validate(catalog);

if (valid) {
  console.log('AJV: PASS - updated catalog is valid against schema');
} else {
  console.log(`AJV: FAIL - ${validate.errors?.length ?? 0} errors`);
  for (const e of (validate.errors ?? []).slice(0, 20)) {
    console.log(`  ${e.instancePath}: ${e.message}`);
  }
}

// Report
console.log('\n=== INJECTION REPORT ===');
console.log(`machinery_profile injected: ${machineryProfileInjected}`);
console.log(`pricing.sale_amount updated: ${priceInjected}`);
console.log(`source_pdf added: ${sourcePdfInjected}`);
console.log(`\nItems modified:`);
for (const c of changes) {
  const warn = c.parsing_warnings.length > 0 ? ` [warnings: ${c.parsing_warnings.join(', ')}]` : '';
  console.log(`  ${c.sku.padEnd(8)} ${(c.title ?? '').slice(0, 50).padEnd(52)} specs=${c.spec_count} features=${c.feature_count} price=${c.price}${warn}`);
}
console.log(`\nBackup at: ${BACKUP_PATH}`);