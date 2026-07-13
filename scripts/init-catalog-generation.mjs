// scripts/init-catalog-generation.mjs
// Initialize (or reset) the catalog_generation block in the main
// catalog JSON with sensible defaults. Idempotent.
//
// Run: node scripts/init-catalog-generation.mjs

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';

const ROOT = process.cwd();
const CATALOG_PATH = join(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json');
const SCHEMA_PATH = join(ROOT, 'docs', 'catalogo_productos_schema_validacion_corregido.json');
const BACKUP_PATH = join(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json.bak');

const DEFAULT_CATALOG_GENERATION = {
  description:
    'Configuracion visual del catalogo. Editable desde /admin/outputs. Ver docs/ADMIN_PLAN.md para el detalle.',
  output_types: {
    full_catalog_pdf: {
      enabled: true,
      template_key: 'catalog_full',
      layout: {
        cover_pages: [
          { id: 'cover_1', source: 'asset:cover_image_1', enabled: true },
          { id: 'cover_2', source: 'asset:cover_image_2', enabled: true },
        ],
        sections: [
          {
            id: 'categories',
            type: 'variable',
            block: 'category_section',
            source: 'categories[*]',
            template_rule: 'show_compacto',
          },
          {
            id: 'back_cover',
            type: 'fixed',
            block: 'back_cover',
          },
        ],
      },
      rules: [
        {
          id: 'show_denso',
          when:
            'item.machinery_profile && item.machinery_profile.specification_groups && item.machinery_profile.specification_groups.length >= 5',
          then: { block: 'denso' },
          note: 'Maquinaria con 5+ grupos de specs -> ficha tecnica completa',
        },
        {
          id: 'show_medio',
          when:
            'item.machinery_profile && (item.machinery_profile.features && item.machinery_profile.features.length > 0 || item.machinery_profile.specification_groups && item.machinery_profile.specification_groups.length > 0)',
          then: { block: 'medio' },
          note: 'Maquinaria con algunas specs -> card con bullets',
        },
        {
          id: 'show_compacto',
          when: 'true',
          then: { block: 'compacto' },
          note: 'Fallback para todo lo demas -> tabla compacta',
        },
      ],
    },
    machinery_technical_sheet_pdf: {
      enabled: true,
      template_key: 'machinery_technical_sheet',
      layout: null,
      rules: [],
    },
    service_sheet_pdf: {
      enabled: true,
      template_key: 'service_sheet',
      layout: null,
      rules: [],
    },
    simple_product_card_pdf: {
      enabled: true,
      template_key: 'simple_catalog_card',
      layout: null,
      rules: [],
    },
    category_catalog_pdf: {
      enabled: true,
      template_key: 'category_catalog',
      layout: null,
      rules: [],
    },
  },
};

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));

  const ajv = new Ajv({ strict: false, allErrors: true });
  const updated = { ...catalog, catalog_generation: DEFAULT_CATALOG_GENERATION };
  const validate = ajv.compile(schema);
  if (!validate(updated)) {
    console.error('AJV validation FAILED for default config:');
    for (const e of (validate.errors ?? []).slice(0, 10)) {
      console.error(`  ${e.instancePath || '/'}: ${e.message}`);
    }
    process.exit(1);
  }

  // Backup before write
  await copyFile(CATALOG_PATH, BACKUP_PATH);
  console.log(`Backup: ${BACKUP_PATH}`);

  await writeFile(CATALOG_PATH, JSON.stringify(updated, null, 2));
  console.log(`Initialized catalog_generation in ${CATALOG_PATH}`);
  console.log('Output types:');
  for (const [key, value] of Object.entries(DEFAULT_CATALOG_GENERATION.output_types)) {
    console.log(`  - ${key}: enabled=${value.enabled}, rules=${value.rules?.length ?? 0}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});