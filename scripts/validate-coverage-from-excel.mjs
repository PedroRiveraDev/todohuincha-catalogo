#!/usr/bin/env node
// scripts/validate-coverage-from-excel.mjs
// Lee el Excel maestro (CODIGOS_TH.xlsx) y lo cruza contra el JSON del catalogo.
// Reporta SKUs faltantes, precios diferentes y categorias no contempladas.
//
// Uso:
//   node scripts/validate-coverage-from-excel.mjs --excel=./docs/CODIGOS_TH.xlsx
//
// Dependencias necesarias:
//   npm install --save-dev xlsx
//
// Exit code:
//   0 = cobertura completa
//   1 = hay faltantes (imprime lista y detalles)

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- Args -------------------------------------------------------------------

function parseArgs(argv) {
  const args = { excel: null, json: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--excel=')) args.excel = arg.slice('--excel='.length);
    else if (arg.startsWith('--json=')) args.json = arg.slice('--json='.length);
  }
  return args;
}

const args = parseArgs(process.argv);

const DEFAULT_EXCEL = resolve(ROOT, 'docs', 'CODIGOS_TH.xlsx');
const DEFAULT_JSON = resolve(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json');

const excelPath = args.excel ? resolve(args.excel) : DEFAULT_EXCEL;
const jsonPath = args.json ? resolve(args.json) : DEFAULT_JSON;

// --- Excel parsing ----------------------------------------------------------

/**
 * Lee todas las hojas del Excel y devuelve una lista de filas planas
 * con columnas normalizadas: { sku, name, sale_price, category, sheet }
 */
function readExcelRows(filePath) {
  const workbook = XLSX.readFile(filePath);
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    for (const row of sheetRows) {
      // Heuristica: el Excel tiene columnas con nombres variables.
      // Buscamos las que matchean SKU, nombre, precio.
      const sku =
        row.sku ??
        row.SKU ??
        row.internal_reference ??
        row['Internal Reference'] ??
        row.codigo ??
        row.Codigo ??
        row['CODIGO'] ??
        '';

      const name =
        row.name ??
        row.Name ??
        row.nombre ??
        row.Nombre ??
        row.NOMBRE ??
        row.description ??
        row.Description ??
        '';

      const price =
        row.sale_price ??
        row['Sale Price'] ??
        row.precio ??
        row.Precio ??
        row['PRECIO'] ??
        row.price ??
        0;

      const skuStr = String(sku).trim();
      if (!skuStr) continue; // fila vacia

      rows.push({
        sku: skuStr,
        name: String(name).trim(),
        sale_price: Number(price) || 0,
        category: sheetName,
      });
    }
  }

  return rows;
}

// --- JSON parsing -----------------------------------------------------------

async function loadCatalogJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const data = JSON.parse(raw);
  return data;
}

// --- Comparacion ------------------------------------------------------------

function buildSkuIndex(catalog) {
  const bySku = new Map();
  for (const item of catalog.items ?? []) {
    bySku.set(item.sku, item);
  }
  return bySku;
}

function compare(excelRows, catalog) {
  const items = catalog.items ?? [];
  const jsonBySku = buildSkuIndex(catalog);

  const inExcelOnly = [];
  const inJsonOnly = [];
  const priceDifferences = [];
  const nameDifferences = [];

  const seenInExcel = new Set();

  for (const row of excelRows) {
    seenInExcel.add(row.sku);
    const item = jsonBySku.get(row.sku);
    if (!item) {
      inExcelOnly.push(row);
      continue;
    }
    const excelPrice = row.sale_price;
    const jsonPrice = item.pricing?.sale_amount ?? 0;
    if (Math.abs(excelPrice - jsonPrice) > 0.01) {
      priceDifferences.push({
        sku: row.sku,
        excel_price: excelPrice,
        json_price: jsonPrice,
        excel_name: row.name,
        json_name: item.display_name ?? item.name,
      });
    }
    const excelName = row.name.toLowerCase().trim();
    const jsonName = (item.display_name ?? item.name ?? '').toLowerCase().trim();
    if (excelName && jsonName && excelName !== jsonName) {
      nameDifferences.push({
        sku: row.sku,
        excel_name: row.name,
        json_name: item.display_name ?? item.name,
      });
    }
  }

  for (const item of items) {
    if (!seenInExcel.has(item.sku)) {
      inJsonOnly.push({ sku: item.sku, name: item.display_name ?? item.name });
    }
  }

  return {
    excel_count: excelRows.length,
    json_count: items.length,
    in_excel_only: inExcelOnly,
    in_json_only: inJsonOnly,
    price_differences: priceDifferences,
    name_differences: nameDifferences,
  };
}

// --- Reporte ----------------------------------------------------------------

function printReport(report) {
  console.log('====================================');
  console.log('  Cobertura Excel vs JSON');
  console.log('====================================');
  console.log(`SKUs en Excel: ${report.excel_count}`);
  console.log(`SKUs en JSON:  ${report.json_count}`);
  console.log('');

  console.log(`SKUs en Excel pero NO en JSON: ${report.in_excel_only.length}`);
  if (report.in_excel_only.length > 0) {
    console.log('  Lista:');
    for (const r of report.in_excel_only.slice(0, 20)) {
      console.log(`    - ${r.sku} | ${r.name} | categoria: ${r.category}`);
    }
    if (report.in_excel_only.length > 20) {
      console.log(`    ... y ${report.in_excel_only.length - 20} mas`);
    }
  }
  console.log('');

  console.log(`SKUs en JSON pero NO en Excel: ${report.in_json_only.length}`);
  if (report.in_json_only.length > 0) {
    console.log('  Lista:');
    for (const r of report.in_json_only.slice(0, 20)) {
      console.log(`    - ${r.sku} | ${r.name}`);
    }
    if (report.in_json_only.length > 20) {
      console.log(`    ... y ${report.in_json_only.length - 20} mas`);
    }
  }
  console.log('');

  console.log(`Diferencias de precio: ${report.price_differences.length}`);
  if (report.price_differences.length > 0) {
    console.log('  Lista:');
    for (const r of report.price_differences.slice(0, 20)) {
      console.log(
        `    - ${r.sku}: Excel CLP ${r.excel_price} vs JSON CLP ${r.json_price}`
      );
    }
    if (report.price_differences.length > 20) {
      console.log(`    ... y ${report.price_differences.length - 20} mas`);
    }
  }
  console.log('');

  console.log(`Diferencias de nombre: ${report.name_differences.length}`);
  if (report.name_differences.length > 0) {
    for (const r of report.name_differences.slice(0, 10)) {
      console.log(`    - ${r.sku}:`);
      console.log(`        Excel: ${r.excel_name}`);
      console.log(`        JSON:  ${r.json_name}`);
    }
    if (report.name_differences.length > 10) {
      console.log(`    ... y ${report.name_differences.length - 10} mas`);
    }
  }
  console.log('');

  const totalIssues =
    report.in_excel_only.length +
    report.in_json_only.length +
    report.price_differences.length +
    report.name_differences.length;

  if (totalIssues === 0) {
    console.log('OK: cobertura completa.');
    return 0;
  }
  console.log(`FAIL: ${totalIssues} problemas detectados.`);
  return 1;
}

// --- Main -------------------------------------------------------------------

async function main() {
  console.log(`Leyendo Excel: ${excelPath}`);
  console.log(`Comparando con: ${jsonPath}`);
  console.log('');

  let excelRows;
  try {
    excelRows = readExcelRows(excelPath);
  } catch (err) {
    console.error(`No se pudo leer el Excel: ${err.message}`);
    console.error('Sugerencia: instalar dependencia con `npm install --save-dev xlsx`.');
    process.exit(2);
  }

  const catalog = await loadCatalogJson(jsonPath);
  const report = compare(excelRows, catalog);
  const exitCode = printReport(report);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
