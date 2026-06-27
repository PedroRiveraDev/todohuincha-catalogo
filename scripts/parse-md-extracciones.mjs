// scripts/parse-md-extracciones.mjs
// Parse PDF metadata markdown files and produce docs/pdf_metadata_markdown/parsed.json
// The output contains a machinery_profile-shaped object per SKU ready to be merged
// into catalogo_productos_robusto_completo_corregido.json without touching the schema.
//
// Run: node scripts/parse-md-extracciones.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SOURCE_DIR = join(ROOT, 'docs', 'pdf_metadata_markdown');
const OUT_PATH = join(SOURCE_DIR, 'parsed.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectFormat(content) {
  // Lote 2: tiene "Datos comerciales detectados" + bullets "-"
  // Lote 3: tiene "Datos comerciales y de ficha detectados" con "sku_detectado" + "caracteristicas_detectadas"
  if (content.includes('Datos comerciales detectados') && content.includes('SKU |')) {
    return 'lote2';
  }
  if (content.includes('Datos comerciales y de ficha detectados') && content.includes('sku_detectado')) {
    return 'lote3';
  }
  if (content.includes('No se pudo leer el PDF')) {
    return 'error';
  }
  return 'unknown';
}

function mdTableGet(tableBlock, key) {
  // tableBlock is the markdown table block including header separator
  // Find a row whose first cell matches `key`
  const lines = tableBlock.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
  for (const line of lines) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length >= 2 && cells[0] === key) return cells[1];
  }
  return null;
}

function extractSection(content, headingPattern) {
  // Extract the content between a heading and the next heading of same or higher level.
  // headingPattern is a regex matching the heading line.
  const re = new RegExp(`^#{1,6}\\s+${headingPattern}\\s*$`, 'm');
  const match = re.exec(content);
  if (!match) return null;
  const start = match.index + match[0].length;
  // Find next heading
  const rest = content.slice(start);
  const nextHeading = /^(#{1,6})\s+/m.exec(rest);
  const end = nextHeading ? nextHeading.index : rest.length;
  return rest.slice(0, end).trim();
}

function parseMetadataTecnica(content) {
  // Section "## Metadata técnica del archivo" or "## 1. Metadata técnica del archivo"
  const section = extractSection(content, '(?:\\d+\\.\\s+)?Metadata técnica del archivo');
  if (!section) return null;
  const sha = mdTableGet(section, 'SHA-256');
  const size = mdTableGet(section, 'Tamaño del archivo') || mdTableGet(section, 'Tamaño');
  return {
    sha256: sha,
    byte_size: size ? parseInt(size.replace(/[^\d]/g, ''), 10) || null : null,
  };
}

function parseLote2(content) {
  // Section: "## Datos comerciales detectados"
  const dataSection = extractSection(content, 'Datos comerciales detectados');
  if (!dataSection) return null;

  const sku = mdTableGet(dataSection, 'SKU');
  const title = mdTableGet(dataSection, 'Nombre de ficha');
  const model = mdTableGet(dataSection, 'Modelo/código técnico');
  const priceRaw = mdTableGet(dataSection, 'Precio detectado');
  const currency = mdTableGet(dataSection, 'Moneda');
  const ivaIncluded = mdTableGet(dataSection, 'IVA incluido') === 'Sí';

  // Section: "### Características"
  const featuresSection = extractSection(content, 'Características');
  const features = featuresSection
    ? featuresSection.split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter((l) => l.length > 10 && !l.startsWith('_'))
    : [];

  // Section: "### Especificaciones extraídas"
  const specsSection = extractSection(content, 'Especificaciones extraídas');
  const specifications = parseSpecificationBullets(specsSection ?? '');

  // Try to merge complementary specs (some PDFs have specs as raster table)
  const complementary = parseComplementarySpecTable(content);
  const groups = [...specifications.groups];
  if (complementary) groups.push(complementary);

  const meta = parseMetadataTecnica(content);
  const filenameMatch = content.match(/Nombre de archivo\s*\|\s*([^\n|]+)/);
  const fileName = filenameMatch ? filenameMatch[1].trim() : null;

  return {
    sku,
    title,
    model,
    price: parsePrice(priceRaw),
    currency,
    iva_included: ivaIncluded,
    features,
    specification_groups: groups,
    source_pdf: meta && fileName ? { file_name: fileName, sha256: meta.sha256, byte_size: meta.byte_size } : null,
    raw_specification_lines: specifications.raw,
  };
}

function parseLote3(content) {
  const dataSection = extractSection(content, '(?:\\d+\\.\\s+)?Datos comerciales y de ficha detectados');
  if (!dataSection) return null;

  const sku = mdTableGet(dataSection, 'sku_detectado');
  const title = mdTableGet(dataSection, 'titulo_detectado');
  const model = mdTableGet(dataSection, 'codigos_modelo_detectados');
  const priceRaw = mdTableGet(dataSection, 'precios_detectados');
  const specsRaw = mdTableGet(dataSection, 'especificaciones_detectadas');

  // Features: lote3 concatenates everything into one line. Best-effort: use raw text section
  // and split by sentence before "Ficha Técnica" or "Especificaciones:".
  const features = extractFeaturesFromRaw(content);

  // Specifications: lote3 puts everything in one line. Try to parse group separators.
  const specifications = specsRaw ? parseSpecificationConcatenated(specsRaw) : { groups: [], raw: [] };

  // Merge complementary visual specs if present
  const complementary = parseComplementarySpecTable(content);
  const groups = [...specifications.groups];
  if (complementary) groups.push(complementary);

  const meta = parseMetadataTecnica(content);
  const filenameMatch = content.match(/Nombre de archivo\s*\|\s*([^\n|]+)/);
  const fileName = filenameMatch ? filenameMatch[1].trim() : null;

  return {
    sku,
    title: title?.replace(/\s+[\w-]+\s*\d{4}[A-Z]?(\([\d]+\))?\s*$/i, '').replace(/\s+\d+\((?:1|2|3)\)\s*$/, '').trim() ?? null,
    model,
    price: parsePrice(priceRaw),
    currency: priceRaw?.includes('USD') ? 'USD' : 'CLP',
    iva_included: priceRaw?.toLowerCase().includes('iva') ?? true,
    features,
    specification_groups: groups,
    source_pdf: meta && fileName ? { file_name: fileName, sha256: meta.sha256, byte_size: meta.byte_size } : null,
    raw_specification_lines: specifications.raw,
  };
}

function parsePrice(priceRaw) {
  if (!priceRaw) return null;
  // Examples: "Precio $1.666.840.", "PRECIO $2.737.000 IVA incl.", "3.572.313."
  // Strip thousand separators (dots in CLP/USD), then grab the first run of digits
  const cleaned = priceRaw.replace(/\./g, '').replace(/,/g, '');
  const match = cleaned.match(/(\d+)/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (isNaN(num) || num <= 0) return null;
  return { sale_amount: num, formatted: priceRaw.trim(), currency: priceRaw.includes('USD') ? 'USD' : 'CLP' };
}

function parseSpecificationBullets(specsSection) {
  // Bullets are "- Label: value" or "- Label\n  continuation"
  const lines = specsSection.split('\n');
  const items = [];
  for (const line of lines) {
    const m = line.match(/^\s*-\s+(.+)$/);
    if (!m) continue;
    const text = m[1].trim();
    if (text.length === 0) continue;
    items.push(text);
  }
  // Lote 2 doesn't group them. Create a single group.
  return {
    groups: items.length > 0
      ? [{
          group_code: 'especificaciones',
          label: 'Especificaciones',
          description: null,
          values: items.map(parseSpecLine),
        }]
      : [],
    raw: items,
  };
}

function parseSpecLine(line) {
  // Try to split "Label: value" — if there's no colon, whole line is label with value_text null
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) {
    return { label: line, value_text: null, value_number: null, unit: null };
  }
  const label = line.slice(0, colonIdx).trim();
  const valuePart = line.slice(colonIdx + 1).trim();

  // Priority 1: if value has pattern "X (Y unit)", use Y as value_number and unit
  const metricMatch = valuePart.match(/\(([\d.,]+)\s*([a-zA-Z%]+|mm|cm|m|kg|HP|W|rpm|RPM|V|inch|ft|lb|°|lt|kg\/|l\/)/);
  if (metricMatch) {
    const value_number = parseFloat(metricMatch[1].replace(',', '.'));
    return {
      label,
      value_text: valuePart,
      value_number: isNaN(value_number) ? null : value_number,
      unit: metricMatch[2] || null,
    };
  }

  // Priority 2: try to extract a number and unit, e.g. "1.5 HP (1100 W)"
  const numMatch = valuePart.match(/(\d+(?:[.,]\d+)?)\s*([a-zA-Z%]+|mm|cm|m|kg|HP|W|rpm|RPM|HP|V|inch|ft|lb)?/);
  if (numMatch) {
    const value_number = parseFloat(numMatch[1].replace(',', '.'));
    const unit = numMatch[2] || null;
    return { label, value_text: valuePart, value_number: isNaN(value_number) ? null : value_number, unit };
  }
  return { label, value_text: valuePart, value_number: null, unit: null };
}

function parseComplementarySpecTable(content) {
  // Some .md files have a section like "Especificaciones complementarias leídas desde tabla visual"
  // or "Especificaciones visuales complementarias detectadas en la tabla de la página 1"
  // containing a markdown table with | Field | Value | format. Parse it and return a
  // specification_groups entry.
  const headingPattern = /(?:Especificaciones\s+(?:complementarias\s+le[íi]das\s+desde\s+tabla\s+visual|visuales\s+complementarias\s+detectadas\s+en\s+la\s+tabla\s+de\s+la\s+p[áa]gina\s+\d+))/i;
  const section = extractSection(content, headingPattern.source);
  if (!section) return null;
  const tableBlock = section;
  const lines = tableBlock.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && !l.match(/^\|[\s-]+\|/));
  if (lines.length < 2) return null;
  const values = [];
  for (const line of lines) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length >= 2 && cells[0] && cells[1]) {
      const label = cells[0];
      const valueText = cells[1];
      // Skip header
      if (label.toLowerCase() === 'campo' || label.toLowerCase() === 'field' || label.toLowerCase() === 'dato') continue;
      // Try parse number/unit
      const numMatch = valueText.match(/(\d+(?:[.,]\d+)?)\s*([a-zA-Z%]+|mm|cm|m|kg|HP|W|rpm|RPM|V|inch|ft|lb|litro|litros)?/);
      let value_number = null;
      let unit = null;
      if (numMatch) {
        value_number = parseFloat(numMatch[1].replace(',', '.'));
        unit = numMatch[2] || null;
        if (isNaN(value_number)) value_number = null;
      }
      values.push({ label, value_text: valueText, value_number, unit });
    }
  }
  if (values.length === 0) return null;
  return {
    group_code: 'especificaciones_visuales',
    label: 'Especificaciones (tabla visual)',
    description: 'Datos leídos desde tabla rasterizada del PDF original',
    values,
  };
}

function parseSpecificationConcatenated(raw) {
  // raw is a single line like:
  //   "Potencia de salida: 1.5 HP (1100 W)EJE: • Diámetro (estándar): 3/4" (19 mm) • Capacidad ..."
  //
  // Strategy: split by bullets "•" first, then classify each bullet. A bullet
  // that begins with a top-level group code (EJE:, MESA:, etc.) starts a new group;
  // everything else is a spec line within the current group.

  // First, fix common problems: add a bullet before a group label if it's stuck
  // to the previous spec (e.g. "...(90 mm)MESA:" should be "...(90 mm) • MESA:").
  let cleaned = raw
    .replace(/(\))\s*(?=(MOTOR|EJE|MESA(?:\s+DESLIZANTE|\s+EXTENSIBLE)?|CABEZAL DE CORTE|CAPACIDAD DE CORTE|GUIA|GUÍA|DIMENSIONES GENERALES|DIMENSIONES DE EMPAQUE|PESO NETO\/BRUTO|GENERAL|VELOCIDAD|TAMAÑO DE LA CERCA)\s*:)/gi, '$1 • ')
    .replace(/(rpm|HP|W|mm|cm|m|kg)\s*(?=(MOTOR|EJE|MESA|CABEZAL|CAPACIDAD|GUIA|GUÍA|DIMENSIONES|PESO|GENERAL|VELOCIDAD|TAMAÑO)\s*:)/gi, '$1 • ');

  const bullets = cleaned.split(/[•▪]\s*/).map((s) => s.trim()).filter((s) => s.length > 0);

  const groupCodesSet = new Set([
    'MOTOR', 'EJE', 'MESA DESLIZANTE', 'MESA EXTENSIBLE',
    'CABEZAL DE CORTE', 'CAPACIDAD DE CORTE', 'GUIA', 'GUÍA',
    'DIMENSIONES GENERALES', 'DIMENSIONES DE EMPAQUE',
    'PESO NETO/BRUTO', 'GENERAL',
  ]);

  const groups = [];
  let currentGroup = { group_code: 'general', label: 'GENERAL', description: null, values: [] };
  groups.push(currentGroup);

  for (const bullet of bullets) {
    // Detect if the bullet is a group header like "EJE:" or "MESA DESLIZANTE:"
    // The label may have trailing content if the source line concatenated things,
    // e.g. "EJE: 3/4" (19 mm) ...". Strip the trailing content from the group label.
    const groupMatch = bullet.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s/]+?):\s*(.*)$/);
    if (groupMatch) {
      const candidate = groupMatch[1].trim();
      // Multi-word normalization (MESA  DESLIZANTE → MESA DESLIZANTE)
      const normalized = candidate.replace(/\s+/g, ' ');
      if (groupCodesSet.has(normalized)) {
        currentGroup = { group_code: slugify(normalized), label: normalized, description: null, values: [] };
        groups.push(currentGroup);
        const rest = groupMatch[2].trim();
        if (rest.length > 0) {
          currentGroup.values.push(parseSpecLine(rest));
        }
        continue;
      }
    }
    // Otherwise, it's a spec line within the current group
    if (bullet.length > 0) {
      currentGroup.values.push(parseSpecLine(bullet));
    }
  }

  // Drop empty groups (e.g. initial GENERAL with no values)
  const filtered = groups.filter((g) => g.values.length > 0);
  return { groups: filtered, raw: bullets };
}

function extractFeaturesFromRaw(content) {
  // Extract features from the raw text section, splitting between "Características:" and
  // the next "Ficha Técnica" / "Especificaciones:" marker.
  const rawSection = extractSection(content, '(?:\\d+\\.\\s+)?Texto completo extraído por página');
  if (!rawSection) return [];
  // Find the text block
  const codeBlock = rawSection.match(/```text\s*([\s\S]*?)```/);
  if (!codeBlock) return [];
  const text = codeBlock[1];
  // Find between "Características:" and "Ficha Técnica" or "Especificaciones:"
  const startMatch = /Características:/i.exec(text);
  if (!startMatch) return [];
  const start = startMatch.index + startMatch[0].length;
  const rest = text.slice(start);
  const stopMatch = /Ficha\s+Técnica|Especificaciones:|PRECIO/i.exec(rest);
  const stop = stopMatch ? stopMatch.index : rest.length;
  const caracText = rest.slice(0, stop).trim();
  // Split by periods or bullet markers; merge lines that are continuation
  const sentences = caracText
    .split(/[•▪\n]+|(?<=\.)\s+(?=[A-Z])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  return sentences;
}

function slugify(s) {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Reading markdown extracciones from', SOURCE_DIR);
  const files = await readdir(SOURCE_DIR);
  const mdFiles = files.filter((f) => f.endsWith('.md') && !f.startsWith('00_') && !f.startsWith('parsed-') && !f.endsWith('-report.md'));

  const items = [];
  const errors = [];

  for (const f of mdFiles) {
    const content = await readFile(join(SOURCE_DIR, f), 'utf8');
    const format = detectFormat(content);
    if (format === 'error') {
      errors.push({ file: f, reason: 'extraction_failed' });
      continue;
    }
    let parsed = null;
    try {
      if (format === 'lote2') parsed = parseLote2(content);
      else if (format === 'lote3') parsed = parseLote3(content);
    } catch (e) {
      errors.push({ file: f, reason: `parse_failed: ${e.message}` });
      continue;
    }
    if (!parsed || !parsed.sku) {
      errors.push({ file: f, reason: 'no_sku_detected' });
      continue;
    }
    items.push({
      source_md_file: f,
      format,
      sku: parsed.sku,
      title: parsed.title,
      model: parsed.model,
      price: parsed.price,
      currency: parsed.currency,
      iva_included: parsed.iva_included,
      features: parsed.features,
      specification_groups: parsed.specification_groups,
      raw_specification_lines: parsed.raw_specification_lines,
      source_pdf: parsed.source_pdf,
    });
  }

  const output = {
    generated_at: new Date().toISOString(),
    source_dir: relative(ROOT, SOURCE_DIR),
    total_processed: items.length,
    total_errors: errors.length,
    items: items
      .map((it) => {
        // Compute parsing_warnings
        const warnings = [];
        if (it.features.length === 0) warnings.push('no_features_extracted');
        if (it.specification_groups.length === 0) warnings.push('no_specifications_extracted');
        // Count specs with weird value_text (contains ":", trailing words like "Dimensiones")
        const weirdValues = [];
        for (const g of it.specification_groups) {
          for (const v of g.values) {
            if (v.value_text && /:\s*$/.test(v.value_text)) weirdValues.push(v.label);
            if (v.value_text && /(MOTOR|EJE|MESA|VELOCIDAD|TAMAÑO|DIMENSIONES|PESO)\s*:/.test(v.value_text)) weirdValues.push(v.label);
          }
        }
        if (weirdValues.length > 0) warnings.push(`concatenated_values:${weirdValues.length}`);
        return { ...it, parsing_warnings: warnings };
      })
      .sort((a, b) => a.sku.localeCompare(b.sku)),
    errors,
    statistics: {
      lote2_processed: items.filter((i) => i.format === 'lote2').length,
      lote3_processed: items.filter((i) => i.format === 'lote3').length,
      items_with_features: items.filter((i) => i.features.length > 0).length,
      items_with_specs: items.filter((i) => i.specification_groups.length > 0).length,
      total_specification_values: items.reduce((s, i) => s + i.specification_groups.reduce((sg, g) => sg + g.values.length, 0), 0),
      total_features: items.reduce((s, i) => s + i.features.length, 0),
    },
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2));
  console.log('Wrote', OUT_PATH);
  console.log(`Processed: ${items.length} | Errors: ${errors.length}`);
  console.log('\nSKUs successfully parsed:');
  for (const it of items) console.log(`  ${it.sku.padEnd(8)} ${(it.title ?? '').slice(0, 50).padEnd(52)} ${it.specification_groups.length} groups, ${it.features.length} features`);
  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  ${e.file} (${e.reason})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});