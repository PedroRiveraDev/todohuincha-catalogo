#!/usr/bin/env node
// scripts/validate-coverage-from-pdfs.mjs
// Lee los PDFs de referencia del desarrollador y los cruza contra el JSON.
// Detecta SKUs que aparecen en PDFs pero no en el JSON y campos tecnicos faltantes.
//
// Uso:
//   node scripts/validate-coverage-from-pdfs.mjs --pdf-dir=./docs/_developer_pdfs/
//
// Dependencias necesarias:
//   npm install --save-dev pdfjs-dist
//
// Exit code:
//   0 = cobertura completa
//   1 = hay faltantes

import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname, basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- Args -------------------------------------------------------------------

function parseArgs(argv) {
  const args = { pdfDir: null, json: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--pdf-dir=')) args.pdfDir = arg.slice('--pdf-dir='.length);
    else if (arg.startsWith('--json=')) args.json = arg.slice('--json='.length);
  }
  return args;
}

const args = parseArgs(process.argv);

const DEFAULT_PDF_DIR = resolve(ROOT, 'docs', '_developer_pdfs');
const DEFAULT_JSON = resolve(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json');

const pdfDir = args.pdfDir ? resolve(args.pdfDir) : DEFAULT_PDF_DIR;
const jsonPath = args.json ? resolve(args.json) : DEFAULT_JSON;

// --- PDF extraction ---------------------------------------------------------

/**
 * Extrae texto plano de un PDF. Usa pdfjs-dist.
 */
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
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    lines.push(pageText);
  }
  return lines.join('\n');
}

/**
 * Heuristica para extraer SKU del texto de un PDF.
 * - Busca patron "SKU:" o "Codigo:" seguido de un codigo alfanumerico.
 * - Si el nombre del archivo contiene un codigo valido (ej "2281I"), lo usa.
 */
function extractSkuFromText(text, fileName) {
  const skuFromFile = extractSkuFromFileName(fileName);
  if (skuFromFile) return skuFromFile;

  const patterns = [
    /SKU[:\s]+([A-Z0-9]{3,12})/i,
    /C[oó]digo[:\s]+([A-Z0-9]{3,12})/i,
    /\b(?:modelo|ref|cod)[:\s]+([A-Z0-9]{3,12})/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

function extractSkuFromFileName(fileName) {
  // Patrones tipo "2281I", "852", "W0404"
  const base = basename(fileName, extname(fileName));
  const m = base.match(/(\d{3,5}[A-Z]?|\d{3,5}[A-Z]\b)/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Extrae pares "label: value" del texto para mapear a specification_groups.
 */
function extractSpecifications(text) {
  const specs = [];
  const lines = text.split(/\n+/);
  for (const line of lines) {
    const m = line.match(/^([A-Za-zÁ-Úá-ú\s]{3,40}):\s*(.{2,80})$/);
    if (m) {
      specs.push({ label: m[1].trim(), value: m[2].trim() });
    }
  }
  return specs;
}

// --- Procesamiento ----------------------------------------------------------

async function processPdf(filePath) {
  const fileName = basename(filePath);
  let text = '';
  try {
    text = await extractPdfText(filePath);
  } catch (err) {
    return { file: fileName, ok: false, error: err.message };
  }
  const sku = extractSkuFromText(text, fileName);
  const specs = extractSpecifications(text);
  return { file: fileName, sku, specs, ok: true };
}

// --- Comparacion contra JSON ------------------------------------------------

async function loadCatalogJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function compare(pdfEntries, catalog) {
  const jsonBySku = new Map();
  for (const item of catalog.items ?? []) {
    jsonBySku.set(item.sku, item);
  }

  const pdfsWithoutSku = [];
  const skusMissingInJson = [];
  const skusWithMissingSpecs = [];
  const skusOk = [];

  for (const entry of pdfEntries) {
    if (!entry.ok) continue;
    if (!entry.sku) {
      pdfsWithoutSku.push(entry.file);
      continue;
    }
    const item = jsonBySku.get(entry.sku);
    if (!item) {
      skusMissingInJson.push({ sku: entry.sku, file: entry.file });
      continue;
    }
    const existingGroups = item.machinery_profile?.specification_groups ?? [];
    const existingLabels = new Set();
    for (const g of existingGroups) {
      for (const v of g.values ?? []) {
        existingLabels.add((v.label ?? '').toLowerCase().trim());
      }
    }
    const missingSpecs = entry.specs.filter(
      (s) => !existingLabels.has(s.label.toLowerCase().trim())
    );
    if (missingSpecs.length > 0) {
      skusWithMissingSpecs.push({
        sku: entry.sku,
        file: entry.file,
        missing: missingSpecs.map((s) => `${s.label}: ${s.value}`),
      });
    } else {
      skusOk.push(entry.sku);
    }
  }

  return {
    pdfs_total: pdfEntries.length,
    pdfs_ok: pdfEntries.filter((e) => e.ok).length,
    pdfs_without_sku: pdfsWithoutSku,
    skus_missing_in_json: skusMissingInJson,
    skus_with_missing_specs: skusWithMissingSpecs,
    skus_ok,
  };
}

// --- Reporte ----------------------------------------------------------------

function printReport(report) {
  console.log('====================================');
  console.log('  Cobertura PDFs del desarrollador');
  console.log('====================================');
  console.log(`PDFs encontrados: ${report.pdfs_total}`);
  console.log(`PDFs procesados: ${report.pdfs_ok}`);
  console.log('');

  console.log(`PDFs sin SKU detectable: ${report.pdfs_without_sku.length}`);
  if (report.pdfs_without_sku.length > 0) {
    for (const f of report.pdfs_without_sku) {
      console.log(`    - ${f}`);
    }
  }
  console.log('');

  console.log(`SKUs en PDFs pero NO en JSON: ${report.skus_missing_in_json.length}`);
  if (report.skus_missing_in_json.length > 0) {
    for (const r of report.skus_missing_in_json) {
      console.log(`    - ${r.sku} (${r.file})`);
    }
  }
  console.log('');

  console.log(
    `SKUs con specs faltantes en el JSON: ${report.skus_with_missing_specs.length}`
  );
  if (report.skus_with_missing_specs.length > 0) {
    for (const r of report.skus_with_missing_specs) {
      console.log(`    - ${r.sku} (${r.file}):`);
      for (const m of r.missing) console.log(`        FALTA: ${m}`);
    }
  }
  console.log('');

  console.log(`SKUs con cobertura completa: ${report.skus_ok.length}`);
  console.log('');

  const totalIssues =
    report.pdfs_without_sku.length +
    report.skus_missing_in_json.length +
    report.skus_with_missing_specs.length;

  if (totalIssues === 0) {
    console.log('OK: cobertura completa.');
    return 0;
  }
  console.log(`FAIL: ${totalIssues} problemas detectados.`);
  return 1;
}

// --- Main -------------------------------------------------------------------

async function main() {
  console.log(`Leyendo PDFs de: ${pdfDir}`);
  console.log(`Comparando con:   ${jsonPath}`);
  console.log('');

  let files;
  try {
    files = (await readdir(pdfDir)).filter((f) => f.toLowerCase().endsWith('.pdf'));
  } catch (err) {
    console.error(`No se pudo leer el directorio: ${err.message}`);
    console.error('Sugerencia: crear el directorio y colocar los PDFs ahi.');
    process.exit(2);
  }

  if (files.length === 0) {
    console.warn(`No se encontraron PDFs en ${pdfDir}.`);
    console.warn('Sugerencia: colocar PDFs de referencia del desarrollador en ese directorio.');
    process.exit(0);
  }

  const entries = [];
  for (const f of files) {
    process.stdout.write(`Procesando ${f}... `);
    const entry = await processPdf(join(pdfDir, f));
    if (entry.ok) console.log(`SKU=${entry.sku}, ${entry.specs.length} specs`);
    else console.log(`ERROR: ${entry.error}`);
    entries.push(entry);
  }
  console.log('');

  const catalog = await loadCatalogJson(jsonPath);
  const report = compare(entries, catalog);
  const exitCode = printReport(report);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
