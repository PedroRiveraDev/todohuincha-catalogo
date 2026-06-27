// scripts/catalog-public-images.mjs
// Catalog public/ images: SHA256, detect duplicates, detect broken chars,
// match against catalog JSON SKUs. Output: docs/INVENTARIO_IMAGENES.md
//
// Run: node scripts/catalog-public-images.mjs

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, 'public');
const JSON_PATH = join(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json');
const OUT_PATH = join(ROOT, 'docs', 'INVENTARIO_IMAGENES.md');

function normalizeName(name) {
  // lowercase, replace any non-alphanumeric with dash, collapse, trim
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function hasBrokenChars(name) {
  return /\uFFFD/.test(name) || /[�]/.test(name);
}

function isAllUpper(name) {
  // ignore extension and digits/quotes
  const base = name.replace(/\.[^.]+$/, '');
  return base === base.toUpperCase() && /[A-Z]/.test(base);
}

async function sha256(path) {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (e.isFile()) {
      const st = await stat(full);
      out.push({
        path: full,
        rel: relative(PUBLIC_DIR, full).replaceAll('\\', '/'),
        name: e.name,
        size: st.size,
      });
    }
  }
  return out;
}

async function main() {
  console.log('Cataloging', PUBLIC_DIR);
  const files = await walk(PUBLIC_DIR);
  console.log('Total files:', files.length);

  // Compute SHA256 for all
  console.log('Computing SHA256 (may take a moment)...');
  for (const f of files) {
    try {
      f.sha256 = await sha256(f.path);
    } catch (e) {
      f.sha256 = null;
      f.error = String(e);
    }
  }

  // Group by SHA256 to find duplicates
  const byHash = new Map();
  for (const f of files) {
    if (!f.sha256) continue;
    const list = byHash.get(f.sha256) ?? [];
    list.push(f);
    byHash.set(f.sha256, list);
  }
  const duplicates = [...byHash.values()].filter((l) => l.length > 1);

  // Detect broken-char names
  const broken = files.filter((f) => hasBrokenChars(f.name));

  // Detect uppercase variants
  const uppercased = files.filter((f) => isAllUpper(f.name) && /\.(png|jpg|jpeg|webp)$/i.test(f.name));

  // Load catalog JSON to get SKUs
  console.log('Loading catalog JSON...');
  const catalog = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  const allItems = catalog.items ?? [];
  const skuSet = new Set();
  const skuToItem = new Map();
  for (const it of allItems) {
    if (it.sku) {
      skuSet.add(String(it.sku).toUpperCase());
      skuToItem.set(String(it.sku).toUpperCase(), it);
    }
  }

  // Match product images to SKUs. Two strategies:
  // 1. If the filename starts with the SKU (e.g. "2284I.png", "2284I-algo.png"), match by prefix.
  // 2. Otherwise, tokenize by spaces/dashes/underscores/quotes/parentheses and look for any token == SKU.
  //    This prevents "2284I" from matching SKU "284I" via naive substring.
  const productFiles = files.filter((f) => f.rel.startsWith('products/'));
  const matched = [];
  const unmatched = [];
  for (const f of productFiles) {
    const stem = f.name.replace(/\.[^.]+$/, '').toUpperCase();
    // Strategy 1: prefix match (e.g. "2284I.png" or "2284I-ban...")
    let foundSku = null;
    for (const sku of skuSet) {
      if (stem === sku || stem.startsWith(sku + '-')) {
        foundSku = sku;
        break;
      }
    }
    // Strategy 2: token match
    if (!foundSku) {
      const tokens = stem.split(/[\s\-_"()'.,/]+/).filter(Boolean);
      for (const sku of skuSet) {
        if (tokens.includes(sku)) {
          foundSku = sku;
          break;
        }
      }
    }
    if (foundSku) {
      matched.push({ file: f, sku: foundSku, item: skuToItem.get(foundSku) });
    } else {
      unmatched.push(f);
    }
  }

  // Find SKUs that have no image on disk
  const skusWithImage = new Set(matched.map((m) => m.sku));
  const skusWithoutImage = allItems.filter((it) => it.sku && !skusWithImage.has(String(it.sku).toUpperCase()));

  // Build markdown
  const md = [];
  md.push('# Inventario de imagenes — public/');
  md.push('');
  md.push(`Generado: ${new Date().toISOString()}`);
  md.push(`Total archivos en public/: ${files.length}`);
  md.push('');
  md.push('## Resumen');
  md.push('');
  md.push(`- Total archivos: ${files.length}`);
  md.push(`- Duplicados exactos (mismo SHA256): ${duplicates.length} grupos, ${duplicates.reduce((s, l) => s + l.length, 0)} archivos`);
  md.push(`- Nombres con caracteres rotos (\\uFFFD / �): ${broken.length}`);
  md.push(`- Nombres en MAYUSCULAS (variante legacy): ${uppercased.length}`);
  md.push(`- Imagenes de productos (public/products/): ${productFiles.length}`);
  md.push(`  - Matcheadas con SKU del JSON: ${matched.length}`);
  md.push(`  - Sin match: ${unmatched.length}`);
  md.push('');

  md.push('## Duplicados exactos (mismo SHA256)');
  md.push('');
  md.push('Eliminar la version legacy (MAYUSCULAS-con-espacios) despues de validar.');
  md.push('');
  md.push('| SHA256 | Archivos | Tamano | Accion sugerida |');
  md.push('|---|---|---|---|');
  for (const group of duplicates) {
    md.push(`| ${group[0].sha256.slice(0, 12)}... | ${group.map((f) => f.rel).join('<br>')} | ${group[0].size} | Conservar slug, borrar legacy |`);
  }
  md.push('');

  md.push('## Nombres con encoding roto');
  md.push('');
  md.push('Caracter \\uFFFD (mostrado como �) en filenames. Provocado por mezcla Windows-1252/UTF-8 al subir desde Excel.');
  md.push('');
  md.push('| Archivo | Nombre normalizado sugerido |');
  md.push('|---|---|');
  for (const f of broken) {
    const stem = f.name.replace(/\.[^.]+$/, '');
    md.push(`| ${f.rel} | ${normalizeName(stem)} |`);
  }
  md.push('');

  md.push('## Cobertura por categoria');
  md.push('');
  md.push('| Categoria (codigo) | Slug | Productos en JSON | Items con imagen | Cobertura |');
  md.push('|---|---|---|---|---|');
  const cats = catalog.dictionaries?.category_dictionary ?? {};
  for (const [code, cat] of Object.entries(cats)) {
    const slug = cat.slug;
    const total = cat.products_count ?? 0;
    const itemsInCat = allItems.filter((it) => it.category_code === code);
    const withImg = itemsInCat.filter((it) => skusWithImage.has(String(it.sku ?? '').toUpperCase())).length;
    const pct = total === 0 ? 'n/a' : `${Math.round((withImg / total) * 100)}%`;
    md.push(`| ${code} | ${slug} | ${total} | ${withImg} | ${pct} |`);
  }
  md.push('');

  md.push('## SKUs sin imagen en disco (muestra hasta 50)');
  md.push('');
  md.push('Total: ' + skusWithoutImage.length);
  md.push('');
  md.push('| SKU | Categoria | Display name |');
  md.push('|---|---|---|');
  for (const it of skusWithoutImage.slice(0, 50)) {
    md.push(`| ${it.sku} | ${it.category_code} | ${(it.display_name ?? '').slice(0, 60)} |`);
  }
  if (skusWithoutImage.length > 50) {
    md.push(`| ... | ... | _(${skusWithoutImage.length - 50} SKUs mas)_ |`);
  }
  md.push('');

  md.push('## SKUs CON imagen en disco');
  md.push('');
  md.push('| SKU | Archivo en disco | Categoria | Display name |');
  md.push('|---|---|---|---|');
  // Dedupe by SKU (only one file per SKU — keep the slugified one)
  const skuToFile = new Map();
  for (const m of matched) {
    if (!skuToFile.has(m.sku) || (skuToFile.get(m.sku).name === m.file.name.toUpperCase() && !skuToFile.get(m.sku).name.includes('-'))) {
      // Prefer lowercase-slug over uppercase-legacy
      const existing = skuToFile.get(m.sku);
      const newIsLower = m.file.name === m.file.name.toLowerCase().replace(/\.[^.]+$/, (e) => e);
      if (!existing || newIsLower) skuToFile.set(m.sku, m.file);
    }
  }
  for (const [sku, file] of skuToFile) {
    const it = skuToItem.get(sku);
    md.push(`| ${sku} | ${file.rel} | ${it?.category_code ?? '?'} | ${(it?.display_name ?? '').slice(0, 50)} |`);
  }
  md.push('');

  md.push('## Imagenes de public/products/ sin match con SKU del JSON');
  md.push('');
  if (unmatched.length === 0) {
    md.push('_Todas las imagenes matchearon con un SKU._');
  } else {
    md.push('Estas imagenes existen pero su filename no contiene ningun SKU conocido del JSON.');
    md.push('');
    md.push('Subclasificacion:');
    md.push('- **Legacy duplicado (mismo SHA256 que una slug)**: el legacy MAYUSCULAS-es el duplicado que se puede borrar');
    md.push('- **SKUs huerfanos**: el filename empieza con un codigo que parece SKU (4-6 chars alfanumericos, guion) pero el SKU no esta en el JSON');
    md.push('- **Codigo de modelo en filename**: el filename termina con W0708-10, W0101, etc. (no es SKU del JSON)');
    md.push('');

    // Build SHA256 groups for product files only (both matched and unmatched)
    const allProductByHash = new Map();
    for (const m of matched) {
      const list = allProductByHash.get(m.file.sha256) ?? [];
      list.push({ file: m.file, matched: true, sku: m.sku });
      allProductByHash.set(m.file.sha256, list);
    }
    for (const f of unmatched) {
      const list = allProductByHash.get(f.sha256) ?? [];
      list.push({ file: f, matched: false });
      allProductByHash.set(f.sha256, list);
    }

    // A "legacy dupe" is a group of 2+ product images with same SHA256 where one is uppercase-with-spaces
    // (legacy) and the other is lowercase-with-dashes (slug). The slug is preferred.
    const legacyDupes = [];
    for (const [hash, group] of allProductByHash) {
      if (group.length < 2) continue;
      const upper = group.filter((g) => isAllUpper(g.file.name));
      const slug = group.filter((g) => !isAllUpper(g.file.name));
      if (upper.length > 0 && slug.length > 0) {
        for (const u of upper) {
          legacyDupes.push({ file: u.file, sibling: slug[0].file });
        }
      }
    }

    // SKUs huerfanos: stem starts with 3-6 alphanumeric+optional-letter chars that look like SKU,
    // followed by "-" or end-of-string, AND that candidate is NOT in skuSet.
    const orphanSkus = [];
    const processedHashes = new Set(legacyDupes.map((d) => d.file.sha256));
    for (const f of unmatched) {
      if (processedHashes.has(f.sha256)) continue;
      const stem = f.name.replace(/\.[^.]+$/, '').toUpperCase();
      // Pattern: 3-6 alnum/digit chars at the start, optionally followed by I or similar suffix
      const skuMatch = stem.match(/^([0-9]{3,4}[A-Z]?|[A-Z][0-9]{3,4}[A-Z]?|[A-Z]{1,2}[0-9]{3,5}[A-Z]?)$/);
      if (skuMatch) {
        const candidate = skuMatch[1];
        if (!skuSet.has(candidate)) {
          orphanSkus.push({ file: f, candidate });
        }
      }
    }

    // Model codes: anything left in unmatched after removing legacy dupes and orphan SKUs
    const modelCodes = [];
    const seenHashes2 = new Set([
      ...legacyDupes.map((d) => d.file.sha256),
      ...orphanSkus.map((o) => o.file.sha256),
    ]);
    for (const f of unmatched) {
      if (seenHashes2.has(f.sha256)) continue;
      modelCodes.push(f);
    }

    md.push('### Legacy duplicados (borrar el MAYUSCULAS, conservar el slug)');
    md.push('');
    if (legacyDupes.length === 0) {
      md.push('_Ninguno._');
    } else {
      md.push('Seguro de borrar: la imagen slugificada es la que usa el codigo.');
      md.push('');
      md.push('| Legacy a borrar | Conservar (slug) | Tamano |');
      md.push('|---|---|---|');
      for (const d of legacyDupes) {
        md.push(`| ${d.file.rel} | ${d.sibling.rel} | ${d.file.size} |`);
      }
    }
    md.push('');

    md.push('### SKUs huerfanos (filename parece SKU pero no esta en el JSON)');
    md.push('');
    if (orphanSkus.length === 0) {
      md.push('_Ninguno._');
    } else {
      md.push('| Archivo | Candidato SKU | Tamano |');
      md.push('|---|---|---|');
      for (const o of orphanSkus) {
        md.push(`| ${o.file.rel} | ${o.candidate} | ${o.file.size} |`);
      }
      md.push('');
      md.push('Accion: revisar si estos SKUs fueron borrados del Excel (item eliminado). Si no se referencian en ningun lado, eliminar la imagen.');
    }
    md.push('');

    md.push('### Codigo de modelo en filename (no es SKU del JSON)');
    md.push('');
    if (modelCodes.length === 0) {
      md.push('_Ninguno._');
    } else {
      md.push('Estas imagenes existen pero el SKU real (2200I, 2284I, etc.) NO esta en el filename — el filename usa el codigo de modelo (W0708-10, W0101, etc.) que NO matchea con el JSON.');
      md.push('El item real SI existe en el JSON con su imagen slug (`2202I.png` para `BANCO SIERRA 10" W0708-10`).');
      md.push('');
      md.push('| Archivo | Tamano | SKU real en JSON (mismo SHA256 o item equivalente) |');
      md.push('|---|---|---|');
      for (const f of modelCodes) {
        // Try to find the matching item by display_name
        const stem = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').toUpperCase();
        let linkedSku = 'no encontrado';
        for (const it of allItems) {
          const dn = (it.display_name ?? '').toUpperCase();
          if (dn && stem.length > 5 && (dn.includes(stem.slice(0, 20)) || stem.includes(dn.slice(0, 20)))) {
            linkedSku = it.sku;
            break;
          }
        }
        md.push(`| ${f.rel} | ${f.size} | ${linkedSku} |`);
      }
    }
    md.push('');
  }

  md.push('## Cobertura de assets por categoria (banner + background)');
  md.push('');
  md.push('Datos del JSON `dictionaries.category_dictionary[*].assets`. URL null = placeholder pendiente.');
  md.push('');
  md.push('| Categoria | Slug | banner.url | background.url | Recomendacion placeholder |');
  md.push('|---|---|---|---|---|');
  for (const [code, cat] of Object.entries(cats)) {
    const slug = cat.slug;
    const bannerUrl = cat.assets?.banner?.url ?? null;
    const bgUrl = cat.assets?.background?.url ?? null;
    let rec = '';
    if (!bannerUrl && !bgUrl) {
      rec = `Generar public/categories/${slug}/banner.webp + background.webp. Sugerencia visual: fondo naranja #fb4d08 con silueta del producto representativo.`;
    } else if (!bannerUrl) {
      rec = 'Falta banner — usar background como fallback o generar banner dedicado.';
    } else if (!bgUrl) {
      rec = 'Falta background — generar fondo neutro para PDF.';
    } else {
      rec = 'OK — assets presentes.';
    }
    md.push(`| ${code} | ${slug} | ${bannerUrl ?? '_null_'} | ${bgUrl ?? '_null_'} | ${rec} |`);
  }
  md.push('');

  md.push('## Cobertura de catalog_assets (placeholder, cover, back cover)');
  md.push('');
  const ca = catalog.dictionaries?.catalog_assets ?? catalog.catalog_assets ?? null;
  if (!ca) {
    md.push('NO existe `catalog_assets` en el JSON. El PDF generator cae en fallback cuando el `pdf_image_fallback_order` pide `catalog_assets.placeholder_image`.');
    md.push('');
    md.push('Accion: agregar al JSON:');
    md.push('```json');
    md.push('"catalog_assets": {');
    md.push('  "placeholder_image": { "asset_id": "placeholder", "url": "/catalog/placeholder.webp", "alt_text": "..." },');
    md.push('  "catalog_cover":     { "asset_id": "cover",      "url": "/catalog/cover.webp",     "alt_text": "..." },');
    md.push('  "catalog_back_cover":{ "asset_id": "back-cover", "url": "/catalog/back-cover.webp","alt_text": "..." }');
    md.push('}');
    md.push('```');
  } else {
    md.push('Existe `catalog_assets`:');
    md.push('');
    md.push('| Asset | URL |');
    md.push('|---|---|');
    for (const [k, v] of Object.entries(ca)) {
      md.push(`| ${k} | ${v?.url ?? '_null_'} |`);
    }
  }
  md.push('');

  md.push('## Imagenes hero/ y maquinaria/');
  md.push('');
  md.push('| Archivo | Tamano |');
  md.push('|---|---|');
  for (const f of files.filter((f) => f.rel.startsWith('hero/') || f.rel.startsWith('maquinaria/'))) {
    md.push(`| ${f.rel} | ${f.size} |`);
  }
  md.push('');

  md.push('## Pendientes para el equipo .NET');
  md.push('');
  md.push('- [ ] Cargar `category_dictionary[*].assets.banner.url` para las 21 categorias (hoy todas en `null`)');
  md.push('- [ ] Cargar `category_dictionary[*].assets.background.url` para las 21 categorias');
  md.push('- [ ] Cargar `catalog_assets.placeholder_image.url` (placeholder global para `pdf_image_fallback_order`)');
  md.push('- [ ] Cargar `catalog_assets.catalog_cover.url` (portada del PDF generado)');
  md.push('- [ ] Cargar `catalog_assets.catalog_back_cover.url` (contraportada del PDF generado)');
  md.push('- [ ] Cargar `items[*].assets.main_image.url` para productos con imagen disponible');
  md.push('- [ ] Cargar `items[*].specifications` con datos tecnicos reales (hoy todos en `null`/`[]`)');
  md.push('- [ ] Cargar `items[*].profiles` para maquinaria con ficha tecnica completa');
  md.push('- [ ] Decidir plantilla por item (`generated_outputs.catalog_card_pdf.template_key`) — `service_sheet` ya aparece en servicios');
  md.push('');
  md.push('---');
  md.push('');
  md.push('Ver `openspec/changes/catalog-v2-ui-migration-slice-4/` y `openspec/changes/catalog-machinery-assets-embed/` para el contrato del JSON.');

  await import('node:fs/promises').then((m) => m.writeFile(OUT_PATH, md.join('\n')));
  console.log('Wrote', OUT_PATH);
  console.log('Summary:');
  console.log('  files:', files.length);
  console.log('  duplicate groups:', duplicates.length);
  console.log('  broken-char names:', broken.length);
  console.log('  uppercase legacy names:', uppercased.length);
  console.log('  product images matched:', matched.length);
  console.log('  product images unmatched:', unmatched.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});