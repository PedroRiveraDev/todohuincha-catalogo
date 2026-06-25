#!/usr/bin/env node
// scripts/sync-from-sources.mjs
// Toma Excel + PDFs del desarrollador y produce un JSON completo y validado.
// Reglas de consolidacion (seccion 15.3 de la especificacion):
//   - Match por SKU entre Excel y PDFs.
//   - Si SKU solo en Excel: item basico, technical_profile_level: "basic".
//   - Si SKU solo en PDFs: ALERTA. El SKU deberia estar en Excel.
//   - Si SKU en ambos: complementar. Excel manda en precio/categoria/nombre.
//     PDF manda en model/specs/dimensiones/imagenes.
//   - NO duplicar informacion.
//
// Uso:
//   node scripts/sync-from-sources.mjs --excel=./docs/CODIGOS_TH.xlsx --pdf-dir=./docs/_developer_pdfs/ --output=./docs/catalogo_productos_robusto_completo_corregido.json
//
// Dependencias necesarias:
//   npm install --save-dev xlsx pdfjs-dist

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import Ajv from 'ajv/dist/2020.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- Args -------------------------------------------------------------------

function parseArgs(argv) {
  const args = { excel: null, pdfDir: null, json: null, output: null, schema: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--excel=')) args.excel = arg.slice('--excel='.length);
    else if (arg.startsWith('--pdf-dir=')) args.pdfDir = arg.slice('--pdf-dir='.length);
    else if (arg.startsWith('--json=')) args.json = arg.slice('--json='.length);
    else if (arg.startsWith('--output=')) args.output = arg.slice('--output='.length);
    else if (arg.startsWith('--schema=')) args.schema = arg.slice('--schema='.length);
  }
  return args;
}

const args = parseArgs(process.argv);

const DEFAULT_EXCEL = resolve(ROOT, 'docs', 'CODIGOS_TH.xlsx');
const DEFAULT_PDF_DIR = resolve(ROOT, 'docs', '_developer_pdfs');
const DEFAULT_JSON = resolve(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json');
const DEFAULT_SCHEMA = resolve(ROOT, 'docs', 'catalogo_productos_schema_validacion_corregido.json');

const excelPath = args.excel ? resolve(args.excel) : DEFAULT_EXCEL;
const pdfDir = args.pdfDir ? resolve(args.pdfDir) : DEFAULT_PDF_DIR;
const jsonPath = args.json ? resolve(args.json) : DEFAULT_JSON;
const schemaPath = args.schema ? resolve(args.schema) : DEFAULT_SCHEMA;
const outputPath = args.output ? resolve(args.output) : jsonPath;

// --- Util: hashing ----------------------------------------------------------

function hashString(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 12);
}

// --- Excel ------------------------------------------------------------------

function readExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    for (const row of data) {
      const sku =
        row.sku ??
        row.SKU ??
        row.internal_reference ??
        row['Internal Reference'] ??
        row.codigo ??
        row.Codigo ??
        row['CODIGO'] ??
        '';
      const skuStr = String(sku).trim();
      if (!skuStr) continue;

      rows.push({
        sku: skuStr,
        name:
          row.name ??
          row.Name ??
          row.nombre ??
          row.Nombre ??
          row.NOMBRE ??
          '',
        sale_price: Number(row.sale_price ?? row.Precio ?? row.precio ?? 0) || 0,
        sheet_name: sheetName,
        sheet_slug: slugify(sheetName),
      });
    }
  }
  return rows;
}

function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// --- PDF --------------------------------------------------------------------

async function extractPdfText(filePath) {
  const data = await readFile(filePath);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  const lines = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    lines.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  return lines.join('\n');
}

function extractSkuFromText(text, fileName) {
  const fromFile = extractSkuFromFileName(fileName);
  if (fromFile) return fromFile;
  const patterns = [
    /SKU[:\s]+([A-Z0-9]{3,12})/i,
    /C[oó]digo[:\s]+([A-Z0-9]{3,12})/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

function extractSkuFromFileName(fileName) {
  const base = basename(fileName, extname(fileName));
  const m = base.match(/(\d{3,5}[A-Z]?)/);
  return m ? m[1].toUpperCase() : null;
}

function extractSpecsFromText(text) {
  const specs = [];
  const lines = text.split(/\n+/);
  for (const line of lines) {
    const m = line.match(/^([A-Za-zÁ-Úá-ú\s]{3,40}):\s*(.{2,80})$/);
    if (m) specs.push({ label: m[1].trim(), value_text: m[2].trim() });
  }
  return specs;
}

async function readPdfs(dir) {
  let files = [];
  try {
    files = (await import('node:fs/promises')).readdir;
    files = await (await import('node:fs/promises')).readdir(dir);
  } catch {
    return [];
  }
  const pdfs = files.filter((f) => f.toLowerCase().endsWith('.pdf'));
  const out = [];
  for (const f of pdfs) {
    try {
      const text = await extractPdfText(join(dir, f));
      out.push({
        file: f,
        sku: extractSkuFromText(text, f),
        specs: extractSpecsFromText(text),
      });
    } catch (err) {
      console.warn(`No se pudo procesar ${f}: ${err.message}`);
    }
  }
  return out;
}

// --- Normalizacion ---------------------------------------------------------

function normalizeSku(sku) {
  return String(sku).trim().toUpperCase();
}

function detectItemType(sku, name) {
  const s = String(sku).toUpperCase();
  const n = String(name).toLowerCase();
  // Heuristicas simples - ajustables
  if (s.endsWith('I') && /^[A-Z0-9]+I$/.test(s)) {
    // 'I' al final sugiere maquinaria importada historicamente,
    // pero el Excel no distingue tipos. Usamos nombre como fallback.
  }
  if (/(cepill|tensi|afi|moto|sier|maquina|taladro|router|shaper|planer|jointer|saw|mill)/i.test(n)) {
    return 'machinery';
  }
  return 'simple_product';
}

// --- Construccion del item -------------------------------------------------

function buildItemFromExcel(row) {
  const sku = normalizeSku(row.sku);
  const name = String(row.name).trim();
  const itemType = detectItemType(sku, name);
  return {
    id: cryptoRandomUUID(),
    sku,
    name,
    display_name: name,
    slug: `${slugify(sku)}-${slugify(name)}`.slice(0, 260),
    entity_class: 'pending_review',
    category_code: row.sheet_name,
    category_label: row.sheet_name,
    category_group: 'pending_grouping',
    item_type: itemType,
    item_subtype_code: null,
    technical_profile_level: 'basic',
    pricing: {
      sale_amount: row.sale_price,
      currency: 'CLP',
      formatted: formatCLP(row.sale_price),
      is_price_available: row.sale_price > 0,
    },
    status: {
      is_active: true,
      is_price_zero: row.sale_price === 0,
      is_catalog_visible: true,
    },
    source: {
      catalog_file: 'CODIGOS_TH.xlsx',
      sheet_name: row.sheet_name,
      sheet_slug: row.sheet_slug,
    },
    search: {
      normalized_name: name.toLowerCase(),
      tokens: name.toLowerCase().split(/\s+/).filter(Boolean),
      ai_semantic_context: `${name}. SKU ${sku}. Categoria ${row.sheet_name}.`,
    },
    specifications: {
      brand: null,
      materials: [],
      measurements_raw: [],
      quoted_inches: [],
    },
    assets: {
      main_image: null,
      gallery: [],
      suggested_storage_folder: `catalog/products/${sku}/images/`,
      pdf_image_fallback_order: [
        'item.assets.main_image',
        'family.assets.main_image',
        'category.assets.banner',
        'catalog_assets.placeholder_image',
      ],
    },
    generated_outputs: {
      catalog_card_pdf: {
        enabled: true,
        template_key: 'simple_catalog_card',
        output_storage_key: `generated/catalog/items/${sku}/ficha-catalogo.pdf`,
        status: 'not_generated',
        source: 'generated_from_json_data',
      },
    },
  };
}

function mergePdfIntoItem(item, pdfEntry) {
  if (!pdfEntry?.specs?.length) return item;

  const groups = [];
  const generalValues = pdfEntry.specs.map((s) => ({
    label: s.label,
    value_text: s.value_text,
    value_number: extractNumber(s.value_text),
    unit: extractUnit(s.value_text),
    raw: `${s.label}: ${s.value_text}`,
  }));

  if (generalValues.length > 0) {
    groups.push({
      group_code: 'general',
      label: 'General',
      description: 'Datos tecnicos extraidos del PDF de referencia.',
      values: generalValues,
    });
  }

  return {
    ...item,
    technical_profile_level: 'extended',
    machinery_profile: {
      ...(item.machinery_profile ?? {}),
      model: extractModelFromSpecs(pdfEntry.specs),
      features: [],
      specification_groups: groups,
      raw_specification_lines: pdfEntry.specs.map((s) => `${s.label}: ${s.value_text}`),
      price_observations: [],
    },
  };
}

function extractNumber(text) {
  const m = String(text).match(/[-+]?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  return Number(m[0].replace(',', '.'));
}

function extractUnit(text) {
  const m = String(text).match(/[a-zA-Z%°]+$/);
  return m ? m[0] : null;
}

function extractModelFromSpecs(specs) {
  const model = specs.find((s) => /modelo/i.test(s.label));
  return model?.value_text ?? null;
}

function formatCLP(n) {
  if (!n) return 'CLP 0,00';
  return `CLP ${Number(n).toLocaleString('es-CL', { minimumFractionDigits: 2 })}`;
}

function cryptoRandomUUID() {
  // crypto.randomUUID disponible en Node 16+
  return globalThis.crypto.randomUUID();
}

// --- Validacion con schema --------------------------------------------------

async function validateAgainstSchema(data, schemaPath) {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate(data);
  return { ok, errors: validate.errors ?? [] };
}

// --- Main -------------------------------------------------------------------

async function main() {
  console.log('====================================');
  console.log('  Sync Excel + PDFs -> JSON');
  console.log('====================================');
  console.log(`Excel:   ${excelPath}`);
  console.log(`PDFs:    ${pdfDir}`);
  console.log(`Schema:  ${schemaPath}`);
  console.log(`Output:  ${outputPath}`);
  console.log('');

  // 1. Leer Excel
  console.log('Leyendo Excel...');
  const excelRows = readExcel(excelPath);
  console.log(`  ${excelRows.length} filas con SKU`);
  console.log('');

  // 2. Leer PDFs
  console.log('Leyendo PDFs...');
  const pdfEntries = await readPdfs(pdfDir);
  console.log(`  ${pdfEntries.length} PDFs procesados`);
  const pdfBySku = new Map();
  for (const p of pdfEntries) {
    if (p.sku) pdfBySku.set(normalizeSku(p.sku), p);
  }
  console.log('');

  // 3. Alertas: SKUs en PDFs que no estan en Excel
  const skusInExcel = new Set(excelRows.map((r) => normalizeSku(r.sku)));
  const orphanPdfs = [];
  for (const p of pdfEntries) {
    if (p.sku && !skusInExcel.has(normalizeSku(p.sku))) {
      orphanPdfs.push(p);
    }
  }
  if (orphanPdfs.length > 0) {
    console.warn(`ALERTA: ${orphanPdfs.length} PDFs con SKUs que NO estan en Excel:`);
    for (const p of orphanPdfs) console.warn(`  - ${p.sku} (${p.file})`);
    console.warn('Estos SKUs NO seran incluidos en el JSON hasta resolver.');
    console.warn('');
  }

  // 4. Construir items desde Excel
  console.log('Construyendo items...');
  const items = [];
  for (const row of excelRows) {
    let item = buildItemFromExcel(row);
    const pdfEntry = pdfBySku.get(item.sku);
    if (pdfEntry) {
      item = mergePdfIntoItem(item, pdfEntry);
    }
    items.push(item);
  }
  console.log(`  ${items.length} items`);
  console.log('');

  // 5. Armar el JSON final
  const now = new Date().toISOString();
  const catalog = {
    schema_version: '1.0.0',
    catalog: {
      catalog_id: 'th-industrial-catalog',
      catalog_name: 'Catalogo de productos',
      catalog_slug: 'catalogo-de-productos',
      default_currency: 'CLP',
      source_file: 'CODIGOS_TH.xlsx',
      generated_at: now,
      totals: {
        categories: 0,
        products: items.length,
        families: 0,
        zero_price_products: items.filter((i) => i.pricing.is_price_zero).length,
        item_types: itemsByTypeCount(items),
        technical_sheets: items.filter((i) => i.technical_profile_level === 'extended').length,
      },
    },
    catalog_assets: {
      logo: null,
      cover_image: null,
      pdf_background: null,
      placeholder_image: null,
    },
    catalog_generation: {
      description: 'El sistema genera PDFs desde el JSON para los clientes.',
      output_types: {
        full_catalog_pdf: {
          enabled: true,
          output_storage_key: 'generated/catalog/catalogo-completo.pdf',
          source: 'generated_from_json_data',
        },
        machinery_technical_sheet_pdf: {
          enabled: true,
          output_storage_key_pattern: 'generated/catalog/machinery/{sku}/ficha-tecnica.pdf',
          source: 'generated_from_json_data',
        },
        service_sheet_pdf: {
          enabled: true,
          output_storage_key_pattern: 'generated/catalog/services/{service_code}/ficha-servicio.pdf',
          source: 'generated_from_json_data',
        },
        simple_product_card_pdf: {
          enabled: true,
          output_storage_key_pattern: 'generated/catalog/products/{sku}/tarjeta.pdf',
          source: 'generated_from_json_data',
        },
        category_catalog_pdf: {
          enabled: true,
          output_storage_key_pattern: 'generated/catalog/categories/{category_code}/catalogo-categoria.pdf',
          source: 'generated_from_json_data',
        },
      },
    },
    asset_strategy: {
      description: 'Reglas de resolucion de imagen principal para PDF y frontend.',
      pdf_main_image_resolution_order: [
        'item.assets.main_image',
        'family.assets.main_image',
        'category_dictionary[category_code].assets.banner',
        'catalog_assets.placeholder_image',
      ],
      main_image_rule: {
        asset_role: 'main_image',
        is_primary: true,
        sort_order: 1,
      },
      recommended_formats: ['webp', 'jpg', 'png'],
    },
    dictionary_version: { version: '1.0.0', hash_sha256: 'pending' },
    dictionaries: {
      category_dictionary: {},
      attribute_dictionary: {},
      item_type_dictionary: {},
      subtype_dictionary: {},
    },
    families: [],
    items,
    service_catalog: [],
  };

  // 6. Validar contra schema
  console.log('Validando contra schema...');
  const validation = await validateAgainstSchema(catalog, schemaPath);
  if (!validation.ok) {
    console.error('FAIL: el JSON generado NO cumple el schema.');
    for (const e of validation.errors.slice(0, 10)) {
      console.error(`  ${e.instancePath || '<root>'}: ${e.message}`);
    }
    process.exit(1);
  }
  console.log('OK: validacion de schema.');
  console.log('');

  // 7. Escribir
  await writeFile(outputPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  console.log(`Escrito: ${outputPath}`);
  console.log(`Items: ${items.length}`);
}

function itemsByTypeCount(items) {
  const counts = {};
  for (const item of items) {
    counts[item.item_type] = (counts[item.item_type] ?? 0) + 1;
  }
  return counts;
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
