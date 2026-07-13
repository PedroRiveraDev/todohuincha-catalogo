// tests/lib/admin-preview-data.test.mjs
// Contract tests for the admin PDF preview real-data mapper.

import test from 'node:test';
import assert from 'node:assert/strict';
import { adapter } from '../../src/lib/catalog.ts';
import {
  ADMIN_PREVIEW_PRODUCT_ROWS_PER_PAGE,
  buildAdminPreviewData,
  getAdminPreviewCatalogCategories,
} from '../../src/lib/admin-preview-data.ts';

function stateWithSections(sections) {
  return {
    cover: { enabled: true, source: 'asset:cover_image', title: 'Catálogo' },
    sections,
    rules: [],
  };
}

test('admin preview mapper: all category section expands to real adapter categories and products', () => {
  const preview = buildAdminPreviewData({
    state: stateWithSections([
      { id: 'category-products', type: 'variable', block: 'category_section', enabled: true, category_filter: 'all', show_prices: true, new_page: true },
    ]),
  });

  assert.equal(preview.counts.categoriesRendered, adapter.categories.length);
  assert.equal(preview.counts.productRowsRendered, adapter.items.length);
  assert.equal(preview.categories.length, adapter.categories.length);
  assert.ok(preview.pages.length > 2, '681 products must produce multiple visual pages');
  assert.ok(preview.pages.some((page) => page.sections.some((section) => section.products.some((product) => product.sku === 'LA1071'))));
  assert.ok(
    preview.pages.every((page) => page.usedRows <= ADMIN_PREVIEW_PRODUCT_ROWS_PER_PAGE),
    'visual pages must reserve space for category headers and product rows'
  );
});

test('admin preview mapper: filtered category returns only real products from that category', () => {
  const preview = buildAdminPreviewData({
    state: stateWithSections([
      { id: 'machines', type: 'variable', block: 'category_section', enabled: true, category_filter: 'MAQUINAS', show_prices: true, new_page: true },
    ]),
  });
  const renderedProducts = preview.pages.flatMap((page) => page.sections.flatMap((section) => section.products));

  assert.equal(preview.counts.categoriesRendered, 1);
  assert.equal(preview.counts.productRowsRendered, adapter.itemsByCategory('MAQUINAS').length);
  assert.ok(renderedProducts.length > 0);
  assert.ok(renderedProducts.every((product) => product.categoryCode === 'MAQUINAS'));
});

test('admin preview mapper: new_page creates more visual pages for fixed sections', () => {
  const samePagePreview = buildAdminPreviewData({
    rowsPerPage: 10,
    state: stateWithSections([
      { id: 'a', type: 'fixed', block: 'title', enabled: true, title: 'A', new_page: false },
      { id: 'b', type: 'fixed', block: 'description', enabled: true, title: 'B', new_page: false },
    ]),
  });
  const newPagePreview = buildAdminPreviewData({
    rowsPerPage: 10,
    state: stateWithSections([
      { id: 'a', type: 'fixed', block: 'title', enabled: true, title: 'A', new_page: false },
      { id: 'b', type: 'fixed', block: 'description', enabled: true, title: 'B', new_page: true },
    ]),
  });

  assert.equal(samePagePreview.counts.pages, 2);
  assert.equal(newPagePreview.counts.pages, 3);
});

test('admin preview mapper: category draft overlay changes preview description and assets', () => {
  const categories = getAdminPreviewCatalogCategories([
    {
      code: 'MAQUINAS',
      description: 'Descripción editada en borrador',
      bannerUrl: '/draft/banner.webp',
      backgroundUrl: '/draft/background.webp',
    },
  ]);
  const category = categories.find((item) => item.code === 'MAQUINAS');

  assert.ok(category);
  assert.equal(category.description, 'Descripción editada en borrador');
  assert.equal(category.bannerUrl, '/draft/banner.webp');
  assert.equal(category.backgroundUrl, '/draft/background.webp');
});
