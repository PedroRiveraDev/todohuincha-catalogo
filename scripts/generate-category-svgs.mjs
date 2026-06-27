// scripts/generate-category-svgs.mjs
// Generate SVG placeholders for every category:
//   - public/categories/{slug}/banner.svg    (1200x400, orange brand banner)
//   - public/categories/{slug}/background.svg (1600x900, subtle watermark bg)
//
// Pure stdlib, no dependencies. Idempotent (overwrites).
// Run: node scripts/generate-category-svgs.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public', 'categories');

// Hardcoded list (mirrors docs/catalogo_productos_robusto_completo_corregido.json
// category_dictionary). Order matches the source JSON so the output is stable.
const CATEGORIES = [
  { code: 'RECALQUE', slug: 'recalque', label: 'Recalque', group: 'servicios' },
  { code: 'TENSIONADO', slug: 'tensionado', label: 'Tensionado', group: 'servicios' },
  { code: 'SOLDADURA', slug: 'soldadura', label: 'Soldadura', group: 'servicios' },
  { code: 'ACERO.UDD', slug: 'acero-udd', label: 'Acero Uddeholm', group: 'materiales' },
  { code: 'ACERO.KAPF.', slug: 'acero-kapf', label: 'Acero Kapfenberg', group: 'materiales' },
  { code: 'TRABADO', slug: 'trabado', label: 'Trabado', group: 'sierras' },
  { code: 'C.ABRASIVOS', slug: 'c-abrasivos', label: 'Consumibles Abrasivos', group: 'consumibles' },
  { code: 'C.ARMSTRONG', slug: 'c-armstrong', label: 'Consumibles Armstrong', group: 'consumibles' },
  { code: 'C.SIMONDS', slug: 'c-simonds', label: 'Consumibles Simonds', group: 'consumibles' },
  { code: 'S.CIRCULARES', slug: 's-circulares', label: 'Sierras Circulares', group: 'sierras' },
  { code: 'CUCH.AST.', slug: 'cuch-ast', label: 'Cuchillos Astilladores', group: 'cuchillos' },
  { code: 'CUCH.CONS.', slug: 'cuch-cons', label: 'Cuchillos Consumibles', group: 'cuchillos' },
  { code: 'CUCH.ESTRIADOS', slug: 'cuch-estriados', label: 'Cuchillos Estriados', group: 'cuchillos' },
  { code: 'CUCH.LISOS', slug: 'cuch-lisos', label: 'Cuchillos Lisos', group: 'cuchillos' },
  { code: 'CUCH.POLINEROS', slug: 'cuch-polineros', label: 'Cuchillos Polineros', group: 'cuchillos' },
  { code: 'INST.MED.ACC.', slug: 'inst-med-acc', label: 'Instrumentos de Medición', group: 'instrumentos' },
  { code: 'MAQUINAS', slug: 'maquinas', label: 'Máquinas', group: 'maquinaria' },
  { code: 'HERR.IND.ALIM.', slug: 'herr-ind-alim', label: 'Herramientas Industria Alimentaria', group: 'instrumentos' },
  { code: 'S.ALIMENTO', slug: 's-alimento', label: 'Sierras para Alimento', group: 'sierras' },
  { code: 'S.BIMETAL', slug: 's-bimetal', label: 'Sierras Bimetal', group: 'sierras' },
  { code: 'S.CARPINTERAS', slug: 's-carpinteras', label: 'Sierras Carpinteras', group: 'sierras' },
  { code: 'SERVICIOS', slug: 'servicios', label: 'Servicios', group: 'servicios' },
];

const ORANGE = '#FB4D08';
const SLATE = '#313E48';
const MUTED = '#6C6B65';
const CREAM = '#FFFAF7';
const LINE = '#EADFD8';

// ---- banner.svg (1200x400, orange brand band) ----
function banner(label) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="1200" height="400">
  <defs>
    <pattern id="diag" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="40" stroke="#ffffff" stroke-width="1" opacity="0.08"/>
    </pattern>
  </defs>
  <rect width="1200" height="400" fill="${ORANGE}"/>
  <rect width="1200" height="400" fill="url(#diag)"/>
  <rect x="40" y="40" width="6" height="320" fill="#ffffff" opacity="0.6"/>
  <text x="80" y="170" font-family="Helvetica, Arial, sans-serif" font-size="64" font-weight="900" fill="#ffffff" letter-spacing="2">${escapeXml(label.toUpperCase())}</text>
  <text x="80" y="230" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="600" fill="#ffffff" opacity="0.85" letter-spacing="6">TODO HUINCHA · CATÁLOGO INDUSTRIAL</text>
  <text x="80" y="360" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="500" fill="#ffffff" opacity="0.7" letter-spacing="3">COMERCIALIZADORA · DESDE 1995</text>
</svg>
`;
}

// ---- background.svg (1600x900, subtle watermark) ----
function background(label) {
  const cx = 800;
  const cy = 450;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
  <defs>
    <pattern id="grid" patternUnits="userSpaceOnUse" width="80" height="80">
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="${LINE}" stroke-width="1" opacity="0.35"/>
    </pattern>
  </defs>
  <rect width="1600" height="900" fill="${CREAM}"/>
  <rect width="1600" height="900" fill="url(#grid)"/>
  <g opacity="0.06" transform="translate(${cx} ${cy}) rotate(-12)">
    <text text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="180" font-weight="900" fill="${SLATE}" letter-spacing="6">${escapeXml(label.toUpperCase())}</text>
  </g>
  <g transform="translate(60 80)">
    <rect width="14" height="60" fill="${ORANGE}"/>
    <text x="32" y="32" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="800" fill="${SLATE}" letter-spacing="4">TODO HUINCHA</text>
    <text x="32" y="54" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="500" fill="${MUTED}" letter-spacing="2">CATÁLOGO INDUSTRIAL · DESDE 1995</text>
  </g>
  <g transform="translate(60 800)">
    <text x="0" y="0" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="600" fill="${MUTED}" letter-spacing="2">${escapeXml(label.toUpperCase())} · FONDO INSTITUCIONAL</text>
  </g>
</svg>
`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---- main ----
async function main() {
  let count = 0;
  for (const cat of CATEGORIES) {
    const dir = join(OUT_DIR, cat.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'banner.svg'), banner(cat.label), 'utf8');
    await writeFile(join(dir, 'background.svg'), background(cat.label), 'utf8');
    count += 2;
  }
  console.log(`Generated ${count} SVG files in ${OUT_DIR}`);
  console.log(`Categories: ${CATEGORIES.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});