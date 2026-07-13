// tests/lib/admin-full-catalog-editor.test.mjs
// Focused tests for the full-catalog admin editor payload helpers.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFullCatalogOutputConfig,
  createFullCatalogSectionFromPalette,
  parseFullCatalogEditorPayload,
} from '../../src/lib/admin-full-catalog-editor.ts';
import { parseFullCatalogJsonRequest, prerender } from '../../src/pages/api/admin/full-catalog.json.ts';

test('full-catalog API route: is runtime-only so browser POST bodies are available in dev', async () => {
  assert.equal(prerender, false);
});

test('full-catalog API route: parses application/json request bodies without FormData', async () => {
  const request = new Request('http://localhost/api/admin/full-catalog.json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cover: { enabled: true, source: 'asset:cover_image' },
      sections: [],
      rules: [],
    }),
  });

  const result = await parseFullCatalogJsonRequest(request);

  assert.deepEqual(result, {
    cover: { enabled: true, source: 'asset:cover_image' },
    sections: [],
    rules: [],
  });
});

test('parseFullCatalogEditorPayload: accepts the first supported editing slice', () => {
  const result = parseFullCatalogEditorPayload({
    cover: {
      enabled: true,
      source: 'asset:cover_image',
      title: 'Catálogo 2026',
      subtitle: 'Productos y servicios',
      year: '2026',
      font_family: 'system-ui',
    },
    sections: [
      {
        id: 'catalog-title',
        type: 'fixed',
        block: 'title',
        enabled: true,
        title: 'Catálogo completo',
      },
    ],
    rules: [
      {
        id: 'machinery-dense',
        label: 'Maquinaria densa',
        when: 'item.category_label === "Maquinas"',
        block: 'denso',
        note: 'Use dense layout for machinery.',
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.payload?.cover.title, 'Catálogo 2026');
  assert.equal(result.payload?.cover.font_family, 'system-ui');
});

test('parseFullCatalogEditorPayload: rejects unsafe rule expressions', () => {
  const result = parseFullCatalogEditorPayload({
    cover: { enabled: true, source: 'asset:cover_image' },
    sections: [],
    rules: [{ id: 'bad', when: 'eval("bad")', block: 'medio' }],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /rules\[0\]\.when/);
});

test('buildFullCatalogOutputConfig: preserves unrelated output fields and stores edits under layout/rules', () => {
  const updated = buildFullCatalogOutputConfig(
    {
      enabled: true,
      output_storage_key: 'generated/catalog/catalogo-completo.pdf',
      source: 'generated_from_json_data',
      custom_unrelated: { keep: true },
    },
    {
      cover: {
        enabled: false,
        source: 'asset:new-cover',
        title: 'Nuevo título',
        subtitle: 'Nuevo subtítulo',
        year: '2027',
        alignment: 'center',
        height: '360',
        opacity: '82',
        background: '/cover.webp',
        font_family: 'Georgia, serif',
      },
      sections: [
        {
          id: 'category-products',
          type: 'variable',
          block: 'category_section',
          source: 'categories[*]',
          enabled: false,
          title: 'Categorías editadas',
          category_filter: 'MAQUINAS',
          show_prices: false,
          new_page: true,
        },
      ],
      rules: [{ id: 'all', label: 'Todas', when: 'true', block: 'medio', note: 'Default' }],
    }
  );

  assert.equal(updated.enabled, true);
  assert.deepEqual(updated.custom_unrelated, { keep: true });
  assert.equal(updated.layout.cover_pages[0].enabled, false);
  assert.equal(updated.layout.cover_pages[0].data.title, 'Nuevo título');
  assert.equal(updated.layout.cover_pages[0].data.alignment, 'center');
  assert.equal(updated.layout.cover_pages[0].data.background, '/cover.webp');
  assert.equal(updated.layout.cover_pages[0].data.font_family, 'Georgia, serif');
  assert.equal(updated.layout.sections[0].data.enabled, false);
  assert.equal(updated.layout.sections[0].data.title, 'Categorías editadas');
  assert.equal(updated.layout.sections[0].data.category_filter, 'MAQUINAS');
  assert.equal(updated.layout.sections[0].data.show_prices, false);
  assert.equal(updated.layout.sections[0].data.new_page, true);
  assert.deepEqual(updated.rules[0].then, { block: 'medio' });
});

test('parseFullCatalogEditorPayload: accepts two image-only cover pages', () => {
  const result = parseFullCatalogEditorPayload({
    cover: { enabled: true, source: '/admin/assets/page_1.png' },
    cover_pages: [
      { id: 'cover_1', enabled: true, source: '/admin/assets/page_1.png', background: '/admin/assets/page_1.png', title: '', subtitle: '', year: '', render_mode: 'full_page_image' },
      { id: 'cover_2', enabled: true, source: '/admin/assets/page_2.png', background: '/admin/assets/page_2.png', title: '', subtitle: '', year: '', render_mode: 'full_page_image' },
    ],
    sections: [],
    rules: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload?.cover_pages.length, 2);
  assert.equal(result.payload?.cover_pages[0].render_mode, 'full_page_image');
  assert.equal(result.payload?.cover_pages[1].source, '/admin/assets/page_2.png');
});

test('buildFullCatalogOutputConfig: preserves two image-only cover pages under layout.cover_pages', () => {
  const updated = buildFullCatalogOutputConfig(
    {
      layout: {
        cover_pages: [
          { id: 'cover_1', source: 'asset:old_1', enabled: true, data: { keep: 'one' } },
          { id: 'cover_2', source: 'asset:old_2', enabled: true, data: { keep: 'two' } },
        ],
      },
    },
    {
      cover: { enabled: true, source: '/admin/assets/page_1.png' },
      cover_pages: [
        { id: 'cover_1', enabled: true, source: '/admin/assets/page_1.png', background: '/admin/assets/page_1.png', title: '', subtitle: '', year: '', render_mode: 'full_page_image' },
        { id: 'cover_2', enabled: true, source: '/admin/assets/page_2.png', background: '/admin/assets/page_2.png', title: '', subtitle: '', year: '', render_mode: 'full_page_image' },
      ],
      sections: [],
      rules: [],
    }
  );

  assert.equal(updated.layout.cover_pages.length, 2);
  assert.equal(updated.layout.cover_pages[0].source, '/admin/assets/page_1.png');
  assert.equal(updated.layout.cover_pages[1].source, '/admin/assets/page_2.png');
  assert.equal(updated.layout.cover_pages[0].data.render_mode, 'full_page_image');
  assert.equal(updated.layout.cover_pages[1].data.render_mode, 'full_page_image');
  assert.equal(updated.layout.cover_pages[0].data.title, '');
  assert.equal(updated.layout.cover_pages[1].data.subtitle, '');
  assert.equal(updated.layout.cover_pages[0].data.keep, 'one');
  assert.equal(updated.layout.cover_pages[1].data.keep, 'two');
});

test('buildFullCatalogOutputConfig: preserves section unknown fields and nested data fields', () => {
  const updated = buildFullCatalogOutputConfig(
    {
      layout: {
        sections: [
          {
            id: 'category-products',
            type: 'variable',
            block: 'category_section',
            source: 'categories[*]',
            custom_section_setting: { columns: 3 },
            data: {
              enabled: true,
              title: 'Productos anteriores',
              intro: 'Debe preservarse',
              nested: { keep: true },
            },
          },
        ],
      },
    },
    {
      cover: { enabled: true, source: 'asset:cover_image' },
      sections: [
        {
          id: 'category-products',
          type: 'variable',
          block: 'category_section',
          source: 'categories[*]',
          enabled: false,
          title: 'Productos editados',
        },
      ],
      rules: [],
    }
  );

  assert.deepEqual(updated.layout.sections[0].custom_section_setting, { columns: 3 });
  assert.equal(updated.layout.sections[0].data.enabled, false);
  assert.equal(updated.layout.sections[0].data.title, 'Productos editados');
  assert.equal(updated.layout.sections[0].data.intro, 'Debe preservarse');
  assert.deepEqual(updated.layout.sections[0].data.nested, { keep: true });
});

test('buildFullCatalogOutputConfig: preserves rule extra fields while updating edited fields', () => {
  const updated = buildFullCatalogOutputConfig(
    {
      rules: [
        {
          id: 'machinery',
          label: 'Maquinaria',
          when: 'item.category_label === "Maquinas"',
          then: { block: 'denso', show_badge: 'featured' },
          priority: 10,
        },
      ],
    },
    {
      cover: { enabled: true, source: 'asset:cover_image' },
      sections: [],
      rules: [{ id: 'machinery', label: 'Maquinaria editada', when: 'true', block: 'medio', note: 'Updated' }],
    }
  );

  assert.equal(updated.rules[0].label, 'Maquinaria editada');
  assert.equal(updated.rules[0].when, 'true');
  assert.equal(updated.rules[0].priority, 10);
  assert.deepEqual(updated.rules[0].then, { block: 'medio', show_badge: 'featured' });
});

test('createFullCatalogSectionFromPalette: creates supported layout section blocks without new schema fields', () => {
  const categorySection = createFullCatalogSectionFromPalette('category_section', [{ id: 'category-products-123' }], 123);
  const titleSection = createFullCatalogSectionFromPalette('section_title', [], 456);

  assert.deepEqual(categorySection, {
    id: 'category-products-123-2',
    type: 'variable',
    block: 'category_section',
    source: 'categories[*]',
    enabled: true,
    title: 'Productos por categoría',
    alignment: 'left',
    height: 'auto',
    background: '',
    opacity: '100',
    category_filter: 'all',
    show_prices: true,
    new_page: true,
  });
  assert.deepEqual(titleSection, {
    id: 'section-title-456',
    type: 'fixed',
    block: 'title',
    enabled: true,
    title: 'Título de sección',
    alignment: 'left',
    height: 'auto',
    background: '',
    opacity: '100',
    show_prices: true,
    new_page: true,
  });
  assert.equal(createFullCatalogSectionFromPalette('cover_page', [], 789), null);
});
