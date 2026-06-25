#!/usr/bin/env node
// scripts/map-product-images.mjs
// Mapea imagenes en public/products/ al JSON robusto segun SKU.
//
// Inputs:
//   public/products/*.png|.jpg|.webp
//   docs/catalogo_productos_robusto_completo_corregido.json
//
// Logica:
//   - Para cada item del JSON, busca un archivo cuyo nombre (sin extension)
//     coincida con el SKU en public/products/.
//   - Si lo encuentra, actualiza assets.main_image con:
//       url: "/products/<archivo>"
//       storage_key: "catalog/products/<sku>/images/main.<ext>"
//       file_name: <archivo>
//       source_status: "uploaded"
//       metadata.recommended_min_width_px: 1200
//       metadata.recommended_format: <ext>
//   - Si no, deja assets.main_image en null.
//
// Solo actualiza items que:
//   - Tienen item_type == "machinery" (los unicos con imagenes disponibles)
//   - O tienen una imagen directa con SKU coincidente
//
// Tambien limpia duplicados: las versiones uppercase (viejas) coexisten
// con kebab-case (nuevas) y SKU (finales). El script reporta pero NO borra.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PRODUCTS_DIR = resolve(ROOT, 'public', 'products');
const TARGET = resolve(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json');

async function main() {
  console.log(`Leyendo ${PRODUCTS_DIR}...`);
  const files = await readdir(PRODUCTS_DIR);
  const bySku = new Map(); // SKU uppercase -> file
  const bySlug = new Map(); // kebab-case -> file

  for (const file of files) {
    const base = basename(file, extname(file));
    const ext = extname(file).slice(1).toLowerCase();
    // SKU puro: 3-5 digitos + 0-1 letras (ej 2194I, 852, 2280I)
    if (/^\d{3,5}[A-Z]?$/.test(base)) {
      bySku.set(base, { file, ext });
    }
    // kebab-case con digitos (kebab del nombre del producto)
    else if (/^\d{3,5}/.test(base.replace(/-/g, ''))) {
      bySlug.set(base, { file, ext });
    }
  }

  console.log(`  Imagenes con SKU directo: ${bySku.size}`);
  console.log(`  Imagenes kebab-case: ${bySlug.size}`);

  // Cargar JSON
  console.log(`Leyendo ${TARGET}...`);
  const raw = await readFile(TARGET, 'utf8');
  const data = JSON.parse(raw);

  let matched = 0;
  let skipped = 0;
  const unmatchedSkus = [];

  for (const item of data.items) {
    const sku = String(item.sku || '').toUpperCase();
    if (!sku) continue;

    const hit = bySku.get(sku);
    if (!hit) {
      unmatchedSkus.push(sku);
      skipped++;
      continue;
    }

    // Actualizar assets.main_image
    if (!item.assets) item.assets = {};
    item.assets.main_image = {
      asset_id: `item-${sku}-main-image`,
      asset_type: 'image',
      asset_role: 'main_image',
      url: `/products/${hit.file}`,
      storage_key: `catalog/products/${sku}/images/main.${hit.ext}`,
      file_name: hit.file,
      alt_text: `Imagen principal de ${item.display_name || item.name}`,
      caption: item.display_name || item.name || sku,
      sort_order: 1,
      is_primary: true,
      source_status: 'uploaded',
      metadata: {
        pdf_usage: 'primary_product_visual',
        recommended_min_width_px: 1200,
        recommended_format: hit.ext,
      },
    };
    matched++;
  }

  console.log(`Items matcheados: ${matched}`);
  console.log(`Items sin imagen: ${skipped}`);
  if (unmatchedSkus.length > 0 && unmatchedSkus.length <= 20) {
    console.log(`SKUs sin imagen: ${unmatchedSkus.slice(0, 20).join(', ')}`);
  } else if (unmatchedSkus.length > 20) {
    console.log(`SKUs sin imagen (sample): ${unmatchedSkus.slice(0, 20).join(', ')}...`);
  }

  // Backup
  const backupPath = TARGET + '.pre-images.bak';
  await writeFile(backupPath, raw, 'utf8');
  console.log(`Backup: ${backupPath}`);

  // Escribir
  await writeFile(TARGET, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Escrito: ${TARGET}`);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
