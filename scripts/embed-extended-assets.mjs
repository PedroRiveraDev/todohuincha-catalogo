#!/usr/bin/env node
// scripts/embed-extended-assets.mjs
// Inlines PNG + PDF binaries into the v2 catalog JSON for items with
// machinery_profile.technical_profile_level === "extended" and non-empty
// specification_groups. Idempotent: re-running produces byte-identical
// output (verified by tests/scripts/embed-extended-assets.test.mjs case 6).
//
// CLI:
//   node scripts/embed-extended-assets.mjs [--input <path>] [--output <path>] [--dry-run] [--verbose]
//
// Defaults:
//   --input   docs/catalogo_productos_robusto_completo_corregido.json
//   --output  same as --input (in-place write)
//   --dry-run prints the summary table and does NOT write
//   --verbose logs per-item file paths and byte sizes to stderr
//
// Refs:
//   openspec/changes/catalog-machinery-assets-embed/proposal.md
//   openspec/changes/catalog-machinery-assets-embed/spec.md
//   openspec/changes/catalog-machinery-assets-embed/design.md (section 4)

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

// Resolve project root from cwd so tests can run the script with
// `spawnSync({ cwd: <fixture-dir> })` and have it pick up the fixture's
// `public/products/` and `docs/Catalogo actual/` trees. In production the
// user invokes from the repo root, so cwd IS the project root.
const ROOT = process.cwd();
const PDF_DIR = resolve(ROOT, 'docs', 'Catalogo actual');
const DEFAULT_INPUT = resolve(
  ROOT,
  'docs',
  'catalogo_productos_robusto_completo_corregido.json'
);

function parseArgs(argv) {
  const args = { input: null, output: null, dryRun: false, verbose: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--input=')) args.input = arg.slice('--input='.length);
    else if (arg === '--input') args.input = argv[++i];
    else if (arg.startsWith('--output=')) args.output = arg.slice('--output='.length);
    else if (arg === '--output') args.output = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--verbose') args.verbose = true;
  }
  return args;
}

const args = parseArgs(process.argv);
const inputPath = args.input ? resolve(args.input) : DEFAULT_INPUT;
const outputPath = args.output ? resolve(args.output) : inputPath;

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function findPdfsForSku(sku) {
  let entries;
  try {
    entries = await readdir(PDF_DIR);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .filter((f) => f.includes(sku))
    .sort(); // code-unit order; deterministic across OS
}

async function embedOne(item, verbose) {
  const sku = item.sku;
  const summary = {
    sku,
    imgFound: false,
    imgBytes: 0,
    pdfFound: false,
    pdfBytes: 0,
    status: 'embedded',
  };

  // Image
  const img = item.assets?.main_image;
  if (img && typeof img.url === 'string' && img.url.startsWith('/products/')) {
    const fsPath = join(ROOT, 'public', img.url.replace(/^\//, ''));
    if (existsSync(fsPath)) {
      const bytes = await readFile(fsPath);
      img.data_base64 = bytes.toString('base64');
      img.byte_size = bytes.length;
      img.sha256 = sha256(bytes);
      summary.imgFound = true;
      summary.imgBytes = bytes.length;
      if (verbose) console.error(`[debug] ${sku} img: ${fsPath} (${bytes.length} B)`);
    } else {
      console.error(`[warn] sku=${sku} img missing at ${fsPath}`);
      summary.status = 'partial';
    }
  }

  // PDF
  const candidates = await findPdfsForSku(sku);
  if (candidates.length === 0) {
    console.error(`[warn] sku=${sku} no PDF found`);
    if (summary.status === 'embedded') summary.status = 'image-only';
  } else {
    if (candidates.length > 1) {
      console.error(
        `[info] sku=${sku} ${candidates.length} PDFs found, using ${candidates[0]}`
      );
    }
    const bytes = await readFile(join(PDF_DIR, candidates[0]));
    item.machinery_profile = item.machinery_profile ?? {};
    item.machinery_profile.source_pdf = {
      storage_key: `catalog/products/${sku}/datasheet.pdf`,
      file_name: candidates[0],
      data_base64: bytes.toString('base64'),
      sha256: sha256(bytes),
      byte_size: bytes.length,
    };
    summary.pdfFound = true;
    summary.pdfBytes = bytes.length;
    if (verbose) console.error(`[debug] ${sku} pdf: ${candidates[0]} (${bytes.length} B)`);
  }

  return summary;
}

function printSummaryTable(rows) {
  const header = ['sku', 'img_found', 'img_bytes', 'pdf_found', 'pdf_bytes', 'status'];
  const widths = [10, 10, 10, 10, 10, 12];
  const sep = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const fmt = (cells) =>
    '| ' + cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ') + ' |';
  console.log(sep);
  console.log(fmt(header));
  console.log(sep);
  for (const r of rows)
    console.log(
      fmt([r.sku, r.imgFound, r.imgBytes, r.pdfFound, r.pdfBytes, r.status])
    );
  console.log(sep);
}

async function main() {
  console.error(`[info] reading ${inputPath}`);
  const data = JSON.parse(await readFile(inputPath, 'utf8'));
  const summaries = [];
  let embedded = 0;
  let skipped = 0;
  for (const item of data.items) {
    if (item.item_type !== 'machinery') continue;
    if (item.technical_profile_level !== 'extended') continue;
    const groups = item.machinery_profile?.specification_groups;
    if (!Array.isArray(groups) || groups.length === 0) {
      console.error(`[skip] sku=${item.sku} reason=empty specification_groups`);
      summaries.push({
        sku: item.sku,
        imgFound: false,
        imgBytes: 0,
        pdfFound: false,
        pdfBytes: 0,
        status: 'skip',
      });
      skipped++;
      continue;
    }
    summaries.push(await embedOne(item, args.verbose));
    embedded++;
  }
  printSummaryTable(summaries);
  console.error(
    `[info] embedded: ${embedded}, skipped: ${skipped}, total extended: ${embedded + skipped}`
  );
  if (args.dryRun) {
    console.error('[dry-run] no write performed');
    return;
  }
  await writeFile(outputPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.error(`[info] wrote ${outputPath}`);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});