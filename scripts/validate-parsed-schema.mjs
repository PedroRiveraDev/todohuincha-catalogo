// scripts/validate-parsed-schema.mjs
// Validate docs/pdf_metadata_markdown/parsed.json against the schema.
// For each item, validate the machinery_profile-shape and report any failures.
//
// Run: node scripts/validate-parsed-schema.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';

const ROOT = process.cwd();
const SCHEMA_PATH = join(ROOT, 'docs', 'catalogo_productos_schema_validacion_corregido.json');
const PARSED_PATH = join(ROOT, 'docs', 'pdf_metadata_markdown', 'parsed.json');
const OUT_REPORT = join(ROOT, 'docs', 'pdf_metadata_markdown', 'validation-report.md');

const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
const parsed = JSON.parse(await readFile(PARSED_PATH, 'utf8'));

const ajv = new Ajv({ strict: false, allErrors: true });

// Extract machineryProfile def from the schema
const machineryProfileSchema = {
  ...schema.$defs.machineryProfile,
  $defs: schema.$defs, // include all $defs for $ref resolution
};

// Validate each parsed item's machinery_profile against machineryProfile schema
const validate = ajv.compile(machineryProfileSchema);

const results = [];
let passCount = 0;
let failCount = 0;

for (const item of parsed.items) {
  const machineryProfile = {
    model: item.model ?? null,
    brand: null,
    manufacturer: null,
    short_description: item.title ?? null,
    long_description: null,
    use_case: null,
    recommended_for: null,
    features: item.features,
    specification_groups: item.specification_groups,
    raw_specification_lines: item.raw_specification_lines ?? [],
    price_observations: item.price ? [{
      label: 'Precio',
      value_text: item.price.formatted,
      currency: item.currency ?? 'CLP',
      includes_iva: item.iva_included ?? true,
    }] : [],
    source_pdf: item.source_pdf,
  };

  const valid = validate(machineryProfile);
  if (valid) {
    passCount++;
    results.push({ sku: item.sku, status: 'PASS', errors: [] });
  } else {
    failCount++;
    results.push({
      sku: item.sku,
      status: 'FAIL',
      errors: validate.errors.map((e) => `${e.instancePath || '/'}: ${e.message}`).slice(0, 5),
    });
  }
}

const md = [];
md.push('# Validacion AJV - parsed.json contra machineryProfile schema');
md.push('');
md.push(`Generado: ${new Date().toISOString()}`);
md.push(`Items validados: ${parsed.items.length}`);
md.push(`PASS: ${passCount} | FAIL: ${failCount}`);
md.push('');
md.push('## Resumen');
md.push('');
md.push('| SKU | Title | Specs | Features | Warnings | AJV |');
md.push('|---|---|---|---|---|---|');
for (const item of parsed.items) {
  const result = results.find((r) => r.sku === item.sku);
  const totalValues = item.specification_groups.reduce((s, g) => s + g.values.length, 0);
  md.push(`| ${item.sku} | ${(item.title ?? '').slice(0, 50)} | ${totalValues} | ${item.features.length} | ${item.parsing_warnings.length} | ${result?.status ?? 'NOT_RUN'} |`);
}
md.push('');
md.push('## Fallos AJV (detalle)');
md.push('');
const fails = results.filter((r) => r.status === 'FAIL');
if (fails.length === 0) {
  md.push('_Ninguno. Todos los machinery_profile parseados son validos contra el schema._');
} else {
  for (const f of fails) {
    md.push(`### ${f.sku}`);
    for (const e of f.errors) {
      md.push(`- ${e}`);
    }
    md.push('');
  }
}
md.push('');
md.push('## Recomendaciones para mejorar la extraccion');
md.push('');
md.push('- Los 10 archivos en lote 1 (ERROR) requieren re-extraccion con un extractor mas robusto');
md.push('- Los archivos del lote 3 (formato "nuevo") tienen texto concatenado del PDF original');
md.push('  - El parser hace lo mejor posible pero algunos value_text tienen basura colgada');
md.push('  - Recomendacion: re-procesar esos PDFs con PyMuPDF + layout=True para preservar columnas');
md.push('- PILANA MADERAS SIERRAS (58 paginas, catalogo) requiere procesamiento especial');

await writeFile(OUT_REPORT, md.join('\n'));
console.log(`Wrote ${OUT_REPORT}`);
console.log(`PASS: ${passCount} | FAIL: ${failCount}`);
for (const r of results.filter((r) => r.status === 'FAIL')) {
  console.log(`FAIL ${r.sku}:`);
  for (const e of r.errors) console.log(`  - ${e}`);
}