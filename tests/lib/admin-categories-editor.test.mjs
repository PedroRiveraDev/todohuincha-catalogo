import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCategoryDictionary,
  parseCategoryEditorPayload,
  writeCategoryEditorPayload,
} from '../../src/lib/admin-categories-editor.ts';
import { invalidateCache, readCatalogGeneration, writeCatalogGeneration } from '../../src/lib/admin-storage.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogRelativePath = 'docs/catalogo_productos_robusto_completo_corregido.json';
const schemaRelativePath = 'docs/catalogo_productos_schema_validacion_corregido.json';

test('parseCategoryEditorPayload: accepts existing category editable fields only', () => {
  const result = parseCategoryEditorPayload({
    categories: [
      {
        code: 'RECALQUE',
        description: 'Descripción editada',
        bannerUrl: '/banner.webp',
        backgroundUrl: '/background.webp',
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload?.[0].code, 'RECALQUE');
  assert.equal(result.payload?.[0].bannerUrl, '/banner.webp');
});

test('parseCategoryEditorPayload: accepts dotted category codes', () => {
  const result = parseCategoryEditorPayload({
    categories: [
      {
        code: 'PINTURA.INDUSTRIAL',
        description: 'Categoría con código punteado',
        bannerUrl: '/banner.webp',
        backgroundUrl: '/background.webp',
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload?.[0].code, 'PINTURA.INDUSTRIAL');
});

test('buildCategoryDictionary: preserves unknown fields and updates only description/banner/background urls', () => {
  const updated = buildCategoryDictionary(
    {
      RECALQUE: {
        label: 'Recalque',
        custom: { keep: true },
        description: 'Anterior',
        assets: {
          banner: { url: '/old-banner.svg', alt_text: 'Mantener alt' },
          background: { url: '/old-background.svg', metadata: { keep: true } },
          icon: { url: '/icon.svg' },
        },
      },
    },
    [{ code: 'RECALQUE', description: 'Nueva', bannerUrl: '/new-banner.webp', backgroundUrl: '/new-background.webp' }]
  );

  assert.deepEqual(updated.RECALQUE.custom, { keep: true });
  assert.equal(updated.RECALQUE.description, 'Nueva');
  assert.equal(updated.RECALQUE.assets.banner.url, '/new-banner.webp');
  assert.equal(updated.RECALQUE.assets.banner.alt_text, 'Mantener alt');
  assert.equal(updated.RECALQUE.assets.background.url, '/new-background.webp');
  assert.deepEqual(updated.RECALQUE.assets.background.metadata, { keep: true });
  assert.deepEqual(updated.RECALQUE.assets.icon, { url: '/icon.svg' });
});

test('catalog writers: full-catalog write after category write preserves category changes and unrelated JSON fields', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'todohuincha-catalog-writers-'));
  const previousCwd = process.cwd();
  const dottedCode = 'PINTURA.INDUSTRIAL';
  const unrelatedMarker = { source: 'regression-test', keep: true };

  try {
    await fs.mkdir(path.join(tempRoot, 'docs'), { recursive: true });
    const catalog = JSON.parse(await fs.readFile(path.join(repoRoot, catalogRelativePath), 'utf8'));
    catalog.__regression_unrelated_marker = unrelatedMarker;
    catalog.dictionaries.category_dictionary[dottedCode] = {
      ...catalog.dictionaries.category_dictionary.RECALQUE,
      label: 'Pintura Industrial',
      slug: 'pintura-industrial',
      description: 'Descripción original con punto',
      assets: {
        ...catalog.dictionaries.category_dictionary.RECALQUE.assets,
        banner: {
          ...catalog.dictionaries.category_dictionary.RECALQUE.assets.banner,
          url: '/old-dotted-banner.svg',
        },
        background: {
          ...catalog.dictionaries.category_dictionary.RECALQUE.assets.background,
          url: '/old-dotted-background.svg',
        },
      },
    };

    await fs.writeFile(path.join(tempRoot, catalogRelativePath), JSON.stringify(catalog, null, 2));
    await fs.copyFile(path.join(repoRoot, schemaRelativePath), path.join(tempRoot, schemaRelativePath));

    process.chdir(tempRoot);
    invalidateCache();

    const generationFromCache = await readCatalogGeneration();
    const categoryResult = await writeCategoryEditorPayload([
      {
        code: dottedCode,
        description: 'Descripción editada con punto',
        bannerUrl: '/new-dotted-banner.webp',
        backgroundUrl: '/new-dotted-background.webp',
      },
    ]);
    assert.equal(categoryResult.ok, true);

    const fullCatalogResult = await writeCatalogGeneration({
      ...generationFromCache,
      description: 'Full catalog update from previously cached generation',
    });
    assert.equal(fullCatalogResult.ok, true);

    const persisted = JSON.parse(await fs.readFile(path.join(tempRoot, catalogRelativePath), 'utf8'));
    const dottedCategory = persisted.dictionaries.category_dictionary[dottedCode];

    assert.equal(dottedCategory.description, 'Descripción editada con punto');
    assert.equal(dottedCategory.assets.banner.url, '/new-dotted-banner.webp');
    assert.equal(dottedCategory.assets.background.url, '/new-dotted-background.webp');
    assert.deepEqual(persisted.__regression_unrelated_marker, unrelatedMarker);

    const backupExists = await fs.access(path.join(tempRoot, `${catalogRelativePath}.bak`)).then(() => true, () => false);
    assert.equal(backupExists, false);
  } finally {
    process.chdir(previousCwd);
    invalidateCache();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
