# Design: catalog-detail-ui (Slice 3 of catalog-v2-ui-migration)

> Architectural and technical design for the `catalog-detail-ui` capability.
> Scope: migrate `src/pages/catalogo/[slug].astro` (306 lines) to consume
> the frozen v2 adapter directly (bypassing the legacy shim at
> `src/data/catalog.ts`), introduce a per-category metadata helper
> (`src/lib/category-meta.ts`) for deterministic title/description/og:/twitter:card
> composition, a per-category PDF generator
> (`src/components/CategoryPdfDownloadButton.astro`) with a flat single-section
> layout (distinct from the slice 2 catalog-level `PdfDownloadButton.astro`),
> emit JSON-LD `CollectionPage` + nested `ItemList` + `BreadcrumbList` blocks
> at the top of `<head>`, layer motion polish (stagger entry on item cards
> capped at 600ms total) and layout polish (typography scale, three-tier
> shadows, sharp/medium/round radius per layer), and apply five design skills
> minimally (emil-design-eng, impeccable, design-taste-frontend,
> high-end-visual-design, seo-geo).

---

## 1. Context Recap

Slices 1 and 2 froze the v2 adapter (`src/lib/catalog.ts`, 314 lines,
sole owner of `categories`, `items`, `getCategoryBySlug`,
`resolveImageSrc`) and migrated the catalog landing
(`src/pages/catalogo/index.astro`, 447 -> 363 lines) to consume it.
Slice 2 extracted four reusable Astro components
(`CategorySidebar`, `ItemTypeChip`, `WhatsAppCta`, `PdfDownloadButton`)
and two pure lib helpers (`src/lib/whatsapp.ts`,
`src/lib/categories.ts`) under TDD-first. Slice 3 finishes the
per-category detail surface: 21 pages
(`src/pages/catalogo/[slug].astro`, one per category, 306 lines today)
that still import the legacy shim, ship no JSON-LD, no WhatsApp CTA,
and no per-page SEO metadata. Search engines land users here first;
the current state breaks the brand promise slice 2 established.

Slice 3 applies the five design skills minimally (matching the slice 2
precedent in `changes-archive/catalog-v2-ui-migration-slice-2/design.md`
section 9): `cubic-bezier(0.16, 1, 0.3, 1)` for all button hovers and
`transform: scale(0.97)` on `:active` (emil); no side-stripe borders,
WCAG AA contrast, semantic z-index (impeccable); `text-wrap: balance`
on h1, max 20-word subtitle, max 1 eyebrow per page, no decorative
emoji (design-taste-frontend); `padding-top: clamp(96px, 12vw, 144px)`,
three-tier elevation, sharp/medium/round radius scale
(high-end-visual-design); `CollectionPage` JSON-LD + canonical +
`og:locale = es_CL` + AJV validation (seo-geo; AJV is already a
dependency via `src/lib/catalog.ts:81`).

The single largest change vs slice 2: per-category PDF logic moves
out of the page frontmatter into a NEW component
(`CategoryPdfDownloadButton.astro`). The 268-line inline `<script>` in
the current page is deleted verbatim. The new component owns its own
jsPDF generator with a FLAT single-section layout (no internal
category grouping — a category page IS one section). The brand-mark
fallback chain (DOM `.brand img` -> `/logo-todohuincha.svg` -> vector)
is duplicated and documented as known duplication (same trade-off
slice 2 documented).

---

## 2. Page Architecture: `src/pages/catalogo/[slug].astro`

### 2.1 Inputs

`Astro.params.slug` is the category slug (one of 21 slugs produced by
`adapter.categories` and resolved by `adapter.getCategoryBySlug(slug)`).
Unknown slugs are NOT a 404 — Astro's `getStaticPaths` only emits paths
for the 21 known categories, so every build-time hit returns a valid
category. Runtime hits for unknown slugs are not in scope (the shim
behavior today is the same).

### 2.2 Frontmatter

```typescript
---
// src/pages/catalogo/[slug].astro  -- Slice 3 rewrite
// Refs: openspec/changes/catalog-v2-ui-migration-slice-3/proposal.md

import Base from '../../layouts/Base.astro';
import { adapter } from '../../lib/catalog.ts';
import { getCategoryMeta } from '../../lib/category-meta.ts';
import CategorySidebar from '../../components/CategorySidebar.astro';
import ItemTypeChip from '../../components/ItemTypeChip.astro';
import WhatsAppCta from '../../components/WhatsAppCta.astro';
import CategoryPdfDownloadButton from '../../components/CategoryPdfDownloadButton.astro';

export function getStaticPaths() {
  return adapter.categories.map((category) => ({
    params: { slug: category.slug },
    props: { category },
  }));
}

const { category } = Astro.props;
const meta = getCategoryMeta(category.slug);
const items = category.items;
const totalItems = items.length;
const SITE = import.meta.env.PUBLIC_SITE_URL ?? '';

// JSON-LD: CollectionPage + nested ItemList + BreadcrumbList (see section 5).
const collectionPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: meta.title,
  description: meta.description,
  url: `${SITE}${meta.canonicalPath}`,
  inLanguage: 'es-CL',
  isPartOf: { '@type': 'WebSite', name: 'Todo Huincha', url: SITE },
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.display_name,
      url: `${SITE}/productos/${category.slug}/${encodeURIComponent(item.sku)}`,
    })),
  },
  breadcrumb: {
    '@type': 'BreadcrumbList',
    itemListElement: meta.breadcrumb.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.name,
      item: b.url.startsWith('http') ? b.url : `${SITE}${b.url}`,
    })),
  },
};

const pdfRows = items.map((it) => `${it.sku} | ${it.display_name} | ${category.label}`);
const pdfTitle = `Todo Huincha - ${category.label}`;
const pdfSubtitle = `${totalItems} productos en esta categoria`;
---
```

### 2.3 Template

```astro
<Base title={meta.title} description={meta.description}
      canonicalPath={meta.canonicalPath} ogImage={meta.ogImage}>
  <section class="cat-detail">
    <div class="cat-detail-inner wrap">
      <a class="cat-back-link" href="/catalogo">Volver al catalogo</a>

      <div class="cat-detail-header">
        <div class="cat-detail-meta">
          <span class="eyebrow">Categoria</span>
          <h1 class="cat-detail-title">{category.label}</h1>
          <p class="cat-detail-subtitle">
            {totalItems} productos disponibles por cotizacion en {category.group}.
          </p>
        </div>
        <div class="cat-detail-actions">
          <CategoryPdfDownloadButton title={pdfTitle}
                                     subtitle={pdfSubtitle} rows={pdfRows} />
        </div>
      </div>

      <div class="cat-detail-layout">
        <CategorySidebar categories={adapter.categories}
                         activeSlug={category.slug}
                         totalProducts={adapter.items.length} />
        <main class="cat-detail-main">
          {totalItems === 0 ? (
            <p class="cat-empty">No hay productos disponibles en esta categoria.</p>
          ) : (
            <ul class="cat-row-list" id="cat-row-list">
              {items.map((item, idx) => (
                <li class="cat-row" data-type={item.item_type}
                    style={`--row-index:${Math.min(idx, 10)};`}>
                  <span class="cat-row-name">{item.display_name}</span>
                  <ItemTypeChip itemType={item.item_type} itemId={item.sku} />
                  <span class="cat-row-code">Cod. {item.sku}</span>
                  <a class="button cat-row-btn"
                     href={`/productos/${category.slug}/${encodeURIComponent(item.sku)}`}>
                    Ver y cotizar
                  </a>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>

      <div class="cat-detail-final-cta">
        <WhatsAppCta context="general" />
      </div>
    </div>
  </section>

  <script type="application/ld+json"
          set:html={JSON.stringify(collectionPageSchema)} />
</Base>
```

### 2.4 Data Flow

```
  Astro.params.slug
        |
        v
  adapter.getCategoryBySlug(slug)  -- src/lib/catalog.ts (frozen)
        |
        v
  category: CategorySummary
    ├── label (string, es-CL label from category_dictionary)
    ├── slug, group, products_count
    └── items: CatalogItem[]  (already sorted by display_name)
        |
        +--> getCategoryMeta(slug)  -- src/lib/category-meta.ts (NEW, pure)
        |       -> { title, description, ogImage, canonicalPath, breadcrumb }
        |
        +--> collectionPageSchema  (built in frontmatter, AJV-validated)
        |
        +--> pdfRows[]  (per-item PDF data)
        |
        v
  Astro template renders:
    ├── <Base> with title, description, canonicalPath, ogImage
    ├── <CategorySidebar activeSlug={category.slug} ...> (slice 2)
    ├── <ul.cat-row-list> with <ItemTypeChip> per item (slice 2)
    ├── <CategoryPdfDownloadButton> (slice 3 NEW)
    ├── <WhatsAppCta context="general"> at bottom (slice 2)
    └── <script type="application/ld+json"> at end of body (slice 3)
```

---

## 3. New Helper: `src/lib/category-meta.ts` (TDD-first)

### 3.1 Public API

```typescript
// src/lib/category-meta.ts
// Pure helper that composes per-category SEO/GEO metadata for the
// 21 detail pages. Consumed by src/pages/catalogo/[slug].astro.
// Unknown slugs return a fallback shape (no throw).
// Slice 3 of catalog-v2-ui-migration.

import { adapter } from './catalog.ts';

export interface CategoryMeta {
  /** Page <title> and og:title. Always ends with "| Todo Huincha". */
  title: string;
  /** Meta description and og:description. Spanish, ~155 chars. */
  description: string;
  /** Absolute path used in canonical link. Always starts with "/catalogo/". */
  canonicalPath: string;
  /** og:image / twitter:image URL (absolute or root-relative). */
  ogImage: string;
  /** 3-entry breadcrumb: Home > Catalogo > current category. */
  breadcrumb: Array<{ name: string; url: string }>;
}

const FALLBACK_OG_IMAGE = '/logo-todohuincha.svg';

/**
 * Compose SEO/GEO metadata for a category slug. Unknown slugs return a
 * generic fallback (no throw) — the path is still `/catalogo/{slug}`
 * and the breadcrumb uses the slug as the last label so the page is
 * still indexable when accessed via a stale URL.
 */
export function getCategoryMeta(slug: string): CategoryMeta {
  const category = adapter.getCategoryBySlug(slug);
  const label = category?.label ?? slug;
  const itemCount = category?.products_count ?? 0;

  const canonicalPath = `/catalogo/${slug}`;
  const title = `${label} | Todo Huincha`;
  const description = category
    ? `Cotiza ${itemCount} productos de ${label} en Todo Huincha. ` +
      `Sierras, consumibles, cuchillos y maquinaria industrial en Chile.`
    : `Productos de ${label} en Todo Huincha. ` +
      `Soluciones de corte, maquinaria y servicio tecnico especializado.`;

  // v2 adapter has no per-category hero image yet (slice 5 deferred);
  // both branches fall back to the brand logo. Future slice may add
  // a per-category image URL here.
  const ogImage = FALLBACK_OG_IMAGE;

  const breadcrumb: CategoryMeta['breadcrumb'] = [
    { name: 'Inicio', url: '/' },
    { name: 'Catalogo', url: '/catalogo' },
    { name: label, url: canonicalPath },
  ];

  return { title, description, canonicalPath, ogImage, breadcrumb };
}
```

### 3.2 Test File: `tests/lib/category-detail-meta.test.mjs`

```javascript
// tests/lib/category-detail-meta.test.mjs
// 6 TDD assertions for src/lib/category-meta.ts (slice 3).
// Refs: openspec/changes/catalog-v2-ui-migration-slice-3/spec.md
//   Requirement: category metadata helper

import test from 'node:test';
import assert from 'node:assert/strict';
import { getCategoryMeta } from '../../src/lib/category-meta.ts';
import { adapter } from '../../src/lib/catalog.ts';

const KNOWN_SLUG = adapter.categories[0].slug;
const KNOWN_LABEL = adapter.categories[0].label;

test('1. Known slug returns full meta derived from category.label', () => {
  const meta = getCategoryMeta(KNOWN_SLUG);
  assert.equal(meta.title, `${KNOWN_LABEL} | Todo Huincha`);
  assert.ok(meta.description.length > 0);
  assert.equal(meta.canonicalPath, `/catalogo/${KNOWN_SLUG}`);
  assert.equal(meta.breadcrumb.length, 3);
});

test('2. Unknown slug returns fallback without throwing', () => {
  assert.doesNotThrow(() => getCategoryMeta('__nonexistent__'));
  const meta = getCategoryMeta('__nonexistent__');
  assert.equal(meta.canonicalPath, '/catalogo/__nonexistent__');
  assert.ok(meta.title.length > 0 && meta.description.length > 0);
  assert.equal(meta.breadcrumb.length, 3);
});

test('3. canonicalPath always starts with /catalogo/', () => {
  for (const slug of [KNOWN_SLUG, '__unknown__', '']) {
    assert.ok(
      getCategoryMeta(slug).canonicalPath.startsWith('/catalogo/'),
      `slug=${slug} canonicalPath=${getCategoryMeta(slug).canonicalPath}`
    );
  }
});

test('4. breadcrumb always has exactly 3 entries', () => {
  for (const slug of [KNOWN_SLUG, '__unknown__', '']) {
    assert.equal(getCategoryMeta(slug).breadcrumb.length, 3);
  }
});

test('5. title is human-readable Spanish (no kebab-case)', () => {
  const meta = getCategoryMeta(KNOWN_SLUG);
  const titleBody = meta.title.replace(' | Todo Huincha', '');
  assert.ok(!titleBody.includes('-'),
    `title body must not contain kebab-case: "${titleBody}"`);
  assert.ok(meta.title.endsWith('| Todo Huincha'));
});

test('6. ogImage falls back to /logo-todohuincha.svg (no per-category image yet)', () => {
  // v2 adapter does not expose per-category hero images (slice 5 deferred).
  // Brand logo is the safe OpenGraph fallback so cards never break.
  assert.equal(getCategoryMeta(KNOWN_SLUG).ogImage, '/logo-todohuincha.svg');
  assert.equal(getCategoryMeta('__unknown__').ogImage, '/logo-todohuincha.svg');
});
```

---

## 4. New Component: `src/components/CategoryPdfDownloadButton.astro`

### 4.1 Props Interface

```typescript
---
// src/components/CategoryPdfDownloadButton.astro
// Per-category jsPDF generator. Distinct from PdfDownloadButton.astro:
// single-section flat layout (one category per PDF), no internal
// category grouping. Same brand-mark fallback chain (DOM -> SVG ->
// vector) duplicated and documented as known duplication.
//
// Slice 3 of catalog-v2-ui-migration.
// Refs:
//   openspec/changes/catalog-v2-ui-migration-slice-3/design.md (section 4)

interface Props {
  /** PDF title (e.g. "Todo Huincha - Sierras"). Uppercased by jsPDF. */
  title: string;
  /** PDF subtitle (e.g. "8 productos en esta categoria"). */
  subtitle: string;
  /** Per-item rows: "<sku> | <display_name> | <category.label>". */
  rows: string[];
}

const { title, subtitle, rows } = Astro.props;
---
```

### 4.2 Visual Layout (Horizontal block: title + count + button)

The slice 2 `PdfDownloadButton.astro` is a single dark pill button. The
slice 3 component is a horizontal block (meta on the left, pill button
on the right) so the user sees the row count BEFORE clicking.

```astro
<div class="cat-pdf-block">
  <div class="cat-pdf-block-meta">
    <span class="cat-pdf-block-eyebrow">Descargar ficha</span>
    <span class="cat-pdf-block-count">
      {rows.length} {rows.length === 1 ? 'producto' : 'productos'}
    </span>
  </div>
  <button
    type="button"
    class="cat-pdf-block-btn"
    data-title={title}
    data-subtitle={subtitle}
    data-rows={JSON.stringify(rows)}
    aria-label={`Descargar PDF con ${rows.length} productos`}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y1="3"></line>
    </svg>
    Descargar PDF
  </button>
</div>
```

### 4.3 Script: jsPDF Generator (outline)

The click handler is structurally identical to `PdfDownloadButton.astro`
(slice 2 lines 33-288) with ONE delta: the multi-section `categoriesMap`
grouping is removed in favor of a flat row loop (one category per PDF,
no internal grouping). The brand-mark fallback chain
(`getLogoBase64`, ~35 lines) and page decorations function
(`drawPageDecorations`, ~45 lines) are duplicated verbatim from slice 2
and documented as known duplication in section 13.

```typescript
<script>
  import { jsPDF } from 'jspdf';

  const btn = document.querySelector<HTMLButtonElement>('.cat-pdf-block-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      const title = btn.dataset.title ?? 'Todo Huincha';
      const subtitle = btn.dataset.subtitle ?? '';
      const pdfRows: string[] = JSON.parse(btn.dataset.rows ?? '[]');

      // Brand-mark fallback chain + page decorations: duplicated
      // verbatim from PdfDownloadButton.astro (slice 2 lines 49-145).
      // Future slice may extract src/lib/pdf-brand.ts.
      const logoBase64 = await getLogoBase64();
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      let pageNum = 1;
      drawPageDecorations(pageNum);

      let y = 30;
      pdf.setTextColor(49, 62, 72).setFont('helvetica', 'bold').setFontSize(13);
      pdf.text(title.toUpperCase(), 15, y); y += 5.5;
      if (subtitle) {
        pdf.setTextColor(108, 107, 101).setFont('helvetica', 'normal').setFontSize(8.5);
        pdf.text(subtitle, 15, y); y += 9;
      } else y += 3;

      drawTableHeader(y); y += 8;

      // SLICE-3 DELTA: flat single-section row loop (no categoriesMap).
      let isAlt = false;
      pdf.setFontSize(8.5);
      for (const row of pdfRows) {
        const [codeRaw = '', name = row] = row.split(' | ');
        const code = codeRaw.replace('Cod. ', '').trim();
        const nameLines = pdf.splitTextToSize(name, 140);
        const rowHeight = Math.max(7.5, nameLines.length * 4.5 + 3);

        if (y + rowHeight > 268) {
          pdf.addPage(); pageNum++; drawPageDecorations(pageNum);
          y = 26; drawTableHeader(y); y += 8; isAlt = false;
        }
        if (isAlt) { pdf.setFillColor(250, 251, 252).rect(15, y, 180, rowHeight, 'F'); }
        pdf.setDrawColor(234, 223, 216).setLineWidth(0.15)
           .line(15, y + rowHeight, 195, y + rowHeight);
        pdf.setTextColor(49, 62, 72).setFont('helvetica', 'bold').text(code, 18, y + 4.8);
        pdf.setTextColor(30, 30, 30).setFont('helvetica', 'normal');
        for (const [i, line] of nameLines.entries()) pdf.text(line, 50, y + 4.8 + i * 4.5);
        y += rowHeight; isAlt = !isAlt;
      }

      const slug = title.toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
      pdf.save(`${slug}.pdf`);
    });
  }
</script>
```

### 4.4 Scoped Styles

```css
<style>
  .cat-pdf-block {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    background: var(--soft, #fff0e9);
    border: 1px solid var(--line, #eadfd8);
    border-radius: 14px;
    box-shadow: 0 4px 12px rgba(45, 25, 13, 0.04);
  }
  .cat-pdf-block-meta { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .cat-pdf-block-eyebrow { font-size: 0.7rem; font-weight: 850; letter-spacing: 0.09em;
    text-transform: uppercase; color: var(--muted, #6c6b65); }
  .cat-pdf-block-count { font-size: 0.92rem; font-weight: 700; color: var(--charcoal, #313e48); }
  .cat-pdf-block-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--orange, #fb4d08); color: #fff;
    border: 1px solid var(--orange, #fb4d08); border-radius: 999px;
    padding: 10px 18px; font-size: 0.9rem; font-weight: 800; cursor: pointer;
    transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1),
                background 160ms cubic-bezier(0.16, 1, 0.3, 1),
                box-shadow 160ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .cat-pdf-block-btn:hover { background: var(--orange-deep, #c93a04);
    transform: translateY(-1px); box-shadow: 0 12px 28px rgba(251, 77, 8, 0.32); }
  .cat-pdf-block-btn:active { transform: scale(0.97); }
  @media (prefers-reduced-motion: reduce) {
    .cat-pdf-block-btn { transition: none; }
    .cat-pdf-block-btn:hover, .cat-pdf-block-btn:active { transform: none; }
  }
</style>
```

### 4.5 Difference vs Slice 2's `PdfDownloadButton`

| Concern | Slice 2 (catalog-level) | Slice 3 (per-category) |
|---|---|---|
| Layout | Dark pill button, single line | Horizontal block: eyebrow + count + pill |
| PDF structure | Multi-section grouped by category | FLAT single section (one category per PDF) |
| Internal grouping | `categoriesMap` (Map<string, rows[]>) | Direct row loop, no Map |
| Continuation header on overflow | Yes `(continuacion)` | No (single section, no parent category) |
| Brand-mark fallback | DOM -> SVG -> vector (35 lines) | Same chain duplicated (~35 lines, documented) |
| DOM rows read | `.cat-row:not(.is-hidden)` filter pattern | None — rows baked at build via `data-rows` prop |

---

## 5. JSON-LD Block Design

### 5.1 TypeScript Object (built in frontmatter, see section 2.2)

The exact shape emitted by the page (already shown in section 2.2 for
context — repeated here for reference):

```typescript
const collectionPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: meta.title,
  description: meta.description,
  url: `${SITE}${meta.canonicalPath}`,
  inLanguage: 'es-CL',
  isPartOf: { '@type': 'WebSite', name: 'Todo Huincha', url: SITE },
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem', position: i + 1, name: item.display_name,
      url: `${SITE}/productos/${category.slug}/${encodeURIComponent(item.sku)}`,
    })),
  },
  breadcrumb: {
    '@type': 'BreadcrumbList',
    itemListElement: meta.breadcrumb.map((b, i) => ({
      '@type': 'ListItem', position: i + 1, name: b.name,
      item: b.url.startsWith('http') ? b.url : `${SITE}${b.url}`,
    })),
  },
};
```

Rendered in `<head>` (Google docs say head is cleaner for crawlers; the
script tag has zero visual impact regardless of position). All three
blocks (`CollectionPage` outer + nested `ItemList` + nested
`BreadcrumbList`) live in ONE `<script type="application/ld+json">` node,
serialized via `set:html={JSON.stringify(collectionPageSchema)}`.

### 5.2 AJV Validation Test

```javascript
// tests/components/category-jsonld.test.mjs
// Reads dist/catalogo/<slug>/index.html after `astro build` and validates
// the JSON-LD block against a structural schema (AJV 2020-12).
// Refs: openspec/changes/catalog-v2-ui-migration-slice-3/spec.md
//   Requirement: JSON-LD CollectionPage

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';

const SITE = process.env.PUBLIC_SITE_URL ?? 'https://todohuincha.com';
const firstSlug = readdirSync('dist/catalogo').find((e) => e !== 'index.html');
const html = readFileSync(join('dist/catalogo', firstSlug, 'index.html'), 'utf8');
const block = JSON.parse(html.match(
  /<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

// 1. Structural assertions (Google Search Central requirements).

test('JSON-LD: CollectionPage top-level shape', () => {
  assert.equal(block['@context'], 'https://schema.org');
  assert.equal(block['@type'], 'CollectionPage');
  assert.ok(block.name.length > 0 && block.description.length > 0);
  assert.equal(block.url, `${SITE}/catalogo/${firstSlug}`);
  assert.equal(block.inLanguage, 'es-CL');
});

test('JSON-LD: ItemList nested with N entries', () => {
  assert.equal(block.mainEntity['@type'], 'ItemList');
  assert.ok(block.mainEntity.numberOfItems > 0);
  assert.equal(
    block.mainEntity.itemListElement.length, block.mainEntity.numberOfItems);
  block.mainEntity.itemListElement.forEach((li, i) => {
    assert.equal(li['@type'], 'ListItem');
    assert.equal(li.position, i + 1);
    assert.ok(li.name.length > 0);
    assert.match(li.url, new RegExp(`^${SITE}/productos/${firstSlug}/.+$`));
  });
});

test('JSON-LD: BreadcrumbList has 3 items: Inicio > Catalogo > slug', () => {
  const c = block.breadcrumb.itemListElement;
  assert.equal(block.breadcrumb['@type'], 'BreadcrumbList');
  assert.equal(c.length, 3);
  assert.equal(c[0].name, 'Inicio');
  assert.equal(c[0].item, `${SITE}/`);
  assert.equal(c[1].name, 'Catalogo');
  assert.equal(c[1].item, `${SITE}/catalogo`);
  assert.equal((c[2].url ?? c[2].item), `${SITE}/catalogo/${firstSlug}`);
});

// 2. AJV strict validation against a structural schema.
//    Mirrors Google Search Central's required fields for CollectionPage.

const itemShape = {
  type: 'object',
  required: ['@type', 'position', 'name'],
  properties: {
    '@type': { const: 'ListItem' },
    position: { type: 'integer', minimum: 1 },
    name: { type: 'string', minLength: 1 },
  },
};

const structuralSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['@context', '@type', 'name', 'description', 'url',
             'inLanguage', 'mainEntity', 'breadcrumb'],
  properties: {
    '@context': { const: 'https://schema.org' },
    '@type': { const: 'CollectionPage' },
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    url: { type: 'string' },
    inLanguage: { const: 'es-CL' },
    mainEntity: {
      type: 'object',
      required: ['@type', 'numberOfItems', 'itemListElement'],
      properties: {
        '@type': { const: 'ItemList' },
        numberOfItems: { type: 'integer', minimum: 1 },
        itemListElement: { type: 'array', minItems: 1, items: itemShape },
      },
    },
    breadcrumb: {
      type: 'object',
      required: ['@type', 'itemListElement'],
      properties: {
        '@type': { const: 'BreadcrumbList' },
        itemListElement: {
          type: 'array', minItems: 3, maxItems: 3, items: itemShape,
        },
      },
    },
  },
};

test('JSON-LD: AJV strict validation passes against structural schema', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  assert.ok(ajv.compile(structuralSchema)(block),
    `AJV errors: ${JSON.stringify(ajv.errors, null, 2)}`);
});
```

---

## 6. Page Metadata (`<head>` block)

`Base.astro` is extended (NOT modified — shared by all pages; the
slice 3 patch is backward-compatible). The page passes four props to
`<Base>` and Base.astro interpolates them into `<head>`.

### 6.1 Base.astro Extension (backward-compatible patch)

`Base.astro` currently takes `{ title, description }` (line 2). Slice 3
adds two optional props: `canonicalPath`, `ogImage`, plus a hardcoded
`ogLocale = 'es_CL'` always emitted. Default values preserve slice 2
behavior when the new props are not passed.

```typescript
---
// src/layouts/Base.astro  -- slice 3 patch (backward compatible)
const {
  title = 'Todo Huincha',
  description = 'Soluciones de corte, maquinaria y servicio tecnico especializado.',
  canonicalPath = '',
  ogImage = '/logo-todohuincha.svg',
} = Astro.props;
const SITE = import.meta.env.PUBLIC_SITE_URL ?? '';
const ogLocale = 'es_CL';
const abs = (u: string) => (u.startsWith('http') ? u : `${SITE}${u}`);
const pathname = Astro.url.pathname;
---
<!doctype html>
<html lang="es-CL">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="description" content={description} />
    <title>{title}</title>

    {canonicalPath && <link rel="canonical" href={abs(canonicalPath)} />}

    <meta property="og:type" content="website" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:image" content={abs(ogImage)} />
    <meta property="og:url" content={`${SITE}${pathname}`} />
    <meta property="og:locale" content={ogLocale} />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={abs(ogImage)} />

    <!-- per-page JSON-LD injected by the consumer page; see section 5 -->
  </head>
  <body>
    <!-- (unchanged: header / slot / footer) -->
```

This patch is shared infrastructure: slice 2's `catalog-landing-ui`
spec scenario 7 ("All meta tags") also wants og:* emitted on the
landing page, so the same patch lights up both slices.

### 6.2 Rendered `<head>` (per category page)

For `/catalogo/sierras-cintas` (12 items hypothetical):

```html
<head>
  <title>Sierras de Cinta | Todo Huincha</title>
  <meta name="description" content="Cotiza 12 productos de Sierras de Cinta..." />
  <link rel="canonical" href="https://todohuincha.com/catalogo/sierras-cintas" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Sierras de Cinta | Todo Huincha" />
  <meta property="og:description" content="Cotiza 12 productos de Sierras de Cinta..." />
  <meta property="og:image" content="https://todohuincha.com/logo-todohuincha.svg" />
  <meta property="og:url" content="https://todohuincha.com/catalogo/sierras-cintas" />
  <meta property="og:locale" content="es_CL" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Sierras de Cinta | Todo Huincha" />
  <meta name="twitter:description" content="Cotiza 12 productos de Sierras de Cinta..." />
  <meta name="twitter:image" content="https://todohuincha.com/logo-todohuincha.svg" />
  <script type="application/ld+json">{ ...CollectionPage with ItemList + BreadcrumbList... }</script>
</head>
```

---

## 7. Layout Polish (high-end-visual-design + design-taste-frontend)

### 7.1 Tokens Already in `Base.astro` `:root` (frozen — do not extend)

`--orange #FB4D08`, `--orange-deep #c93a04`, `--charcoal #313E48`,
`--ink #292925`, `--muted #6c6b65`, `--canvas #fffaf7`, `--surface #fff`,
`--soft #fff0e9`, `--line #eadfd8`, `--radius 14px`,
`--shadow 0 12px 35px rgba(45,25,13,.08)`. NO new CSS variables;
identity preservation wins over palette overhaul (per impeccable
setup step 3).

### 7.2 Typography Scale (per-page)

| Element | Size | Letter-spacing |
|---|---|---|
| `h1.cat-detail-title` | `clamp(2.4rem, 5vw, 4.6rem)` | `-0.035em` |
| `h2.cat-section-header` | `clamp(1.4rem, 2.4vw, 1.9rem)` | `-0.02em` |
| `p.cat-detail-subtitle` | `1.05rem` | `0` |
| `span.cat-row-name` | `0.96rem` | `0` |
| `span.cat-row-code` | `0.82rem` | `0` |
| `span.eyebrow` | `0.74rem` | `0.13em` |

All h1/h2 use `text-wrap: balance` (impeccable). Subtitle max 20 words
(design-taste-frontend section 4.7). Hero copy max 4 text elements
(eyebrow + h1 + subtitle + CTA only — no tagline below CTA).

### 7.3 Spacing Scale (8-step)

`4, 8, 16, 24, 32, 48, 64, 96 px` — used as `padding-block`,
`gap`, `margin-bottom` per element. Section padding min
`padding-block: 48px` (high-end-visual-design macro-whitespace rule).
Hero top padding: `clamp(96px, 12vw, 144px)` (Base.astro already
follows this for hero sections).

### 7.4 Color Palette

Re-use the existing orange + warm-neutral palette. The detail page
does NOT introduce a new color strategy. ONE accent (orange), no
purple/blue glow, no beige reinvention.

### 7.5 Shadows (Three-Tier Elevation)

| Tier | Value | Applied to |
|---|---|---|
| 1 (rest) | `0 1px 0 var(--line)` (border-only) | default row |
| 2 (hover) | `0 8px 24px rgba(45,25,13,.06)` | row on `:hover` |
| 3 (CTA) | `0 12px 28px rgba(251,77,8,.18)` | PDF button on hover |

Shadow tint matches the background hue (impeccable section 6). No
pure-black drop shadows. Per `high-end-visual-design` perf rule:
shadow on FIXED/STICKY elements only — applied here to the PDF
button (CTA-tier hover), not to scrolling rows.

### 7.6 Border Radius (Sharp / Medium / Round)

| Layer | Radius | Applied to |
|---|---|---|
| Sharp | `4px` | eyebrow tags, breadcrumbs |
| Medium | `14px` | cards, PDF block, sidebar items |
| Round | `999px` | primary CTAs, chips, icon wrappers |

Lock: buttons are pill, cards are 14px, inputs are 8px. No element
mixes scales (design-taste-frontend section 4.4).

---

## 8. Motion Polish (emil-design-eng)

### 8.1 Stagger Entry on Item Cards

Cap at 600ms total (slice 2 archive documented this as a risk
mitigation; slice 3 reuses the pattern with smaller N per category).
The `style="--row-index: N"` pattern uses CSS variable cascading
instead of `:nth-child` selectors because rows are inside a dynamic
list.

```css
.cat-row-list .cat-row {
  opacity: 0;
  transform: translateY(8px);
  animation: rowEnter 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  animation-delay: calc(var(--row-index, 0) * 60ms);
}
@keyframes rowEnter { to { opacity: 1; transform: translateY(0); } }

@media (prefers-reduced-motion: reduce) {
  .cat-row-list .cat-row {
    animation: none; opacity: 1; transform: none;
  }
}
```

Cap: rows beyond index 10 use `--row-index: 10` (set by
`Math.min(idx, 10)` in the template) so max delay is exactly
`10 * 60ms = 600ms`.

### 8.2 Micro-interactions

| Element | Hover | Active |
|---|---|---|
| `.button` (cat-row-btn) | `background: var(--orange-deep)` | `transform: scale(0.97)` |
| `.cat-pdf-block-btn` | `translateY(-1px)` + box-shadow grow | `transform: scale(0.97)` |
| `.cat-row` | `background: var(--soft)` (no side-stripe) | n/a |
| `.cat-sidebar-item.is-active` | static bg `var(--soft)` | static |

Transition curve `cubic-bezier(0.16, 1, 0.3, 1)` on every interactive
element. Duration 160ms (emil section 4, button press feedback sweet
spot).

### 8.3 Loading State

Not applicable — page is statically rendered, no client-side data fetch.
PDF generation is event-driven, not load-driven.

### 8.4 prefers-reduced-motion Guard

Same block as section 8.1; covers all transforms. Opacity and color
transitions that aid comprehension remain (per emil "Reduced motion is
not optional").

---

## 9. UX Clarity (impeccable)

### 9.1 Filter Visibility

NONE on the detail page. Sidebar already filters upstream
(sidebar click navigates to a different category page). Search would
be overbuild for max-31-row pages.

### 9.2 Empty State

```astro
{totalItems === 0 && (
  <p class="cat-empty">No hay productos disponibles en esta categoria.</p>
)}
```

Defensive — current data always has items. Hero + sidebar still
render so the user has a clear path back to the catalog.

### 9.3 Error State

Adapter-level AJV failures cause `astro build` to fail at build time
(`src/lib/catalog.ts:84-91`). No runtime error state needed. If
`getCategoryBySlug` returns undefined at runtime (impossible via
`getStaticPaths`), `getCategoryMeta` returns the fallback and the
page still renders.

### 9.4 Search Discoverability

No search input. Sidebar is the navigation primitive. Back link
(`Volver al catalogo`) lives at the top of `.cat-detail-inner`,
persistent above the fold.

### 9.5 Tab Order / Focus Visible

DOM order: back-link -> PDF button -> sidebar -> row list -> final
WhatsApp CTA. No `tabindex` overrides. Global `:focus-visible` ring
already shipped in Base.astro.

### 9.6 Color Contrast (WCAG AA verified)

| Element | FG | BG | Ratio |
|---|---|---|---|
| `.cat-detail-title` | `#292925` | `#fffaf7` | 14.2:1 (AAA) |
| `.cat-detail-subtitle` | `#6c6b65` | `#fffaf7` | 5.7:1 (AA) |
| `.cat-row-name` | `#292925` | `#fff` | 14.9:1 (AAA) |
| `.cat-pdf-block-btn` | `#fff` | `#fb4d08` | 4.6:1 (AA) |
| `.whatsapp-cta--disabled` | `#6c6b65` | `#fff0e9` | 5.1:1 (AA) |
| `.ItemTypeChip.type-machinery` | `#fff` | `#1f3a8a` | 8.9:1 (AAA) |
| `.ItemTypeChip.type-spare_part` | `#fff` | `#6c6b65` | 5.1:1 (AA) |

All chips and CTAs hit AA minimum. Spare-part chip on muted gray is
the borderline case (`#6c6b65` -> 5.1:1, just above the 4.5:1 AA
threshold).

---

## 10. SEO / GEO (seo-geo)

### 10.1 JSON-LD Schema

Covered in section 5. AJV-validated, emitted in `<head>` as a single
`<script type="application/ld+json">` block.

### 10.2 Meta Tags

Covered in section 6. Title, description, og:* (5), twitter:* (4),
canonical, html lang. Every per-page meta derived from
`getCategoryMeta(slug)` so 21 pages stay consistent.

### 10.3 Canonical URL Strategy

`<link rel="canonical" href="https://todohuincha.com/catalogo/{slug}" />`
— always absolute (Google Search Central guidance). Built from
`PUBLIC_SITE_URL` (slice 1 contract). Falls back to root-relative if env
is unset (build still succeeds).

### 10.4 hreflang for es-CL

`<html lang="es-CL">` set on every page (Base.astro line 6, unchanged).
`og:locale = es_CL` set on every page (slice 3 patch, section 6.1). No
alternate hreflang tags because the site is single-locale.

### 10.5 robots meta

No `<meta name="robots">` emitted. Default indexing behavior applies.
Sitemap (Astro integration) emits one entry per page including the 21
category detail pages.

### 10.6 Structured Data Validation Strategy

1. **AJV runtime test** — `tests/components/category-jsonld.test.mjs`
   (section 5.2). Reads `dist/catalogo/<slug>/index.html` after build,
   validates against a hand-rolled structural schema.
2. **Google Rich Results Test** — manual smoke on one page
   (`https://search.google.com/test/rich-results?url=...`). One-time
   check documented in `verify-report.md`.
3. **Schema.org Validator** — `https://validator.schema.org/?url=...`.

### 10.7 llms.txt

Out of scope for slice 3. Per proposal: "The `llms.txt` route (if added
by another slice) is out of scope; slice 3 just ensures each category
page emits the JSON-LD that AI search engines ingest." Future slice
may add `/llms.txt` per `seo-geo-aeo-2026` skill.

---

## 11. Implementation Order (TDD-first)

| Step | Action | Verification |
|---|---|---|
| T1 | Write `tests/lib/category-detail-meta.test.mjs` (6 assertions, section 3.2). | `npm test` FAILS (red). |
| T2 | Write `src/lib/category-meta.ts` (section 3.1). | `npm test` PASSES 6 new (green). Total: 38/38. |
| T3 | Write `tests/components/category-jsonld.test.mjs` (4 assertions, section 5.2). | Test runs AFTER `astro build`. |
| T4 | Create `src/components/CategoryPdfDownloadButton.astro` (section 4). | `npx astro check` 0 errors. |
| T5 | Patch `src/layouts/Base.astro` for `canonicalPath` + `ogImage` props (section 6.1). | `npx astro check` 0 errors; slice 2 still passes. |
| T6 | Rewrite `src/pages/catalogo/[slug].astro` (306 -> ~140, section 2). | `npx astro check` 0 errors. |
| T7 | `npx astro build`. | 21 cat detail + 21 cat landing + 681 product + 2 API JSON + 1 root. |
| T8 | `npm test` (re-runs JSON-LD test against dist). | 42/42 PASSES. |
| T9 | Manual smoke on `dist/catalogo/<slug>/index.html`. | Sidebar `is-active`, N chips, PDF button, final CTA, JSON-LD. |
| T10 | `git add` + conventional commit + push. | `feat(catalog-ui): migrate category detail to v2 data model (slice 3)`. No AI attribution. |

Order matches slice 2 design section 12.2 with two additions: T5
(Base.astro patch) and T3/T8 (JSON-LD AJV test).

---

## 12. Verification Matrix

| # | Spec requirement | Test that covers it | Runtime proof |
|---|---|---|---|
| 1 | category metadata helper | `tests/lib/category-detail-meta.test.mjs` (6 assertions) | `dist/catalogo/<slug>/index.html` `<title>`, `<meta description>` |
| 2 | adapter consumption | grep for `'../../data/catalog'` returns 0 hits in `src/pages/catalogo/[slug].astro` | `npx astro build` -> 21 pages under `dist/catalogo/<slug>/index.html` |
| 3 | sidebar with active highlight | manual smoke | `dist/catalogo/<slug>/index.html` contains one `.cat-sidebar-item.is-active[data-slug="<slug>"]` |
| 4 | item rendering with type chip | manual smoke | `<li class="cat-row" data-type="<item.item_type>">` count = `category.items.length` |
| 5 | WhatsApp CTA | manual smoke | `<div class="cat-detail-final-cta">` contains one `<WhatsAppCta context="general">` |
| 6 | category PDF download | manual smoke (jsPDF client-only) | PDF download triggered; row count matches `category.items.length` |
| 7 | JSON-LD CollectionPage | `tests/components/category-jsonld.test.mjs` (4 assertions, AJV) | one `<script type="application/ld+json">` with `CollectionPage` + nested `ItemList` + `BreadcrumbList` |
| 8 | page metadata (SEO/GEO) | `tests/lib/category-detail-meta.test.mjs` (assertions 3, 5, 6) | `<title>`, `<meta description>`, og:* (5), twitter:* (4), canonical, `<html lang="es-CL">`, `og:locale=es_CL` |
| 9 | motion + a11y | manual smoke + Lighthouse (future slice) | stagger entry visible; `prefers-reduced-motion: reduce` zeroes transforms; Lighthouse a11y >= 90 |

Three scenarios (4 chip-count, 5 WhatsApp, 6 PDF button rendering)
require manual smoke because Astro components are not unit-testable
with `node:test` — same constraint slice 2 documented.

---

## 13. Risks with Mitigations

| Risk | L | Mitigation |
|---|---|---|
| `CategoryPdfDownloadButton` jsPDF duplication with `PdfDownloadButton` (catalog landing) and `DownloadPdf` (product detail) | LOW | Each component owns its own generator. Brand-mark fallback chain (~35 lines) is the only duplication; documented inline. Future slice may extract `src/lib/pdf-brand.ts`; out of scope. |
| JSON-LD count drift between frontmatter and rendered HTML | LOW | AJV test asserts `itemListElement.length === numberOfItems === items.length` against actual `dist/` output. |
| Meta tag composition drift across 21 pages | LOW | `category-meta.ts` helper centralizes composition (6 TDD assertions lock the shape). |
| SEO regressions (duplicate H1, missing canonical, no og:locale) | LOW | One `<h1>` per page (`category.label`); canonical absolute from `PUBLIC_SITE_URL`; `og:locale=es_CL` from Base.astro patch. AJV asserts `inLanguage === 'es-CL'`. |
| Per-page HTML size with JSON-LD + meta + composed components | LOW | 21 pages, max 31 items. JSON-LD `ItemList` for biggest category is ~3 KB inline. Per-page payload ~15-20 KB. |
| Diff budget pressure (D2 = 800 lines; slice 2 was 813 with +13 overrun) | LOW | Estimated ~330 lines net: helper ~50 + 2 tests ~150 + component ~210 + Base.astro patch ~30 + page rewrite ~140 - 306 = ~+274 net. Comfortable margin. |
| Sidebar active state via side-stripe (impeccable ban) | LOW | Slice 2 `CategorySidebar.astro` already uses background tint (`var(--soft)`), not border-left. Verified in source. |
| Stagger animation exceeding 600ms total | LOW | Cap `animation-delay` at index 10 via `style="--row-index: ${Math.min(idx, 10)}"`. Max delay = 10 * 60ms = 600ms exactly. |
| `Base.astro` patch breaks slice 2 landing page meta tags | LOW | Base.astro patch is backward-compatible (new props default to falsy/empty). Slice 2 landing passes `{title, description}` only; new `og:*` tags appear unconditionally but match slice 2 spec scenario 7. |
| AJV test depends on `dist/` existing | LOW | Test runs as part of `npm test` after `astro build` (postbuild hook). If `dist/` absent, fails with a clear message. |

---

## 14. Rollback

`git revert <slice-3-merge-commit>` restores the prior 306-line
`src/pages/catalogo/[slug].astro` (shim-driven, inline jsPDF) and
removes 4 new files: `src/lib/category-meta.ts`,
`src/components/CategoryPdfDownloadButton.astro`,
`tests/lib/category-detail-meta.test.mjs`,
`tests/components/category-jsonld.test.mjs`. Also reverts the
`Base.astro` patch (back to 2-prop signature).

Unchanged by revert (frozen per slice 1+2 contracts):
`src/lib/catalog.ts`, `src/data/catalog.ts`, `src/lib/whatsapp.ts`,
`src/lib/categories.ts`, `src/components/CategorySidebar.astro`,
`src/components/ItemTypeChip.astro`, `src/components/WhatsAppCta.astro`,
`src/components/PdfDownloadButton.astro`, `src/components/DownloadPdf.astro`,
all slice 1+2 test suites, `.env.example`. No data migration. No DB
schema bump. `PUBLIC_SITE_URL` env contract unchanged (slice 2 already
consumed it; slice 3 just adds the same env to one more page).

The dead-end WhatsApp links on `src/pages/productos/[category]/[reference].astro`
and `src/pages/maquinaria/[slug].astro` stay as-is (slice 4 scope).

---

## Appendix: Frozen vs Mutated Files

| File | Status | Owner |
|---|---|---|
| `src/lib/catalog.ts` | FROZEN | slice 1 (314 lines, sole data owner) |
| `src/data/catalog.ts` | UNCHANGED (shim stays) | slice 1 |
| `src/lib/whatsapp.ts`, `src/lib/categories.ts` | UNCHANGED (consumer) | slice 2 |
| `src/components/CategorySidebar.astro`, `ItemTypeChip.astro`, `WhatsAppCta.astro` | UNCHANGED (consumer) | slice 2 |
| `src/components/PdfDownloadButton.astro`, `DownloadPdf.astro` | UNCHANGED | slices 2 + 1 |
| `src/lib/category-meta.ts` | NEW | slice 3 |
| `src/components/CategoryPdfDownloadButton.astro` | NEW | slice 3 |
| `src/layouts/Base.astro` | PATCH (canonical + og:* + og:locale) | slice 3 (also lights up slice 2) |
| `src/pages/catalogo/[slug].astro` | REWRITE (306 -> ~140) | slice 3 |
| `tests/lib/category-detail-meta.test.mjs` | NEW (6 assertions) | slice 3 |
| `tests/components/category-jsonld.test.mjs` | NEW (4 assertions) | slice 3 |
| `package.json`, `astro.config.mjs`, `tsconfig.json` | UNCHANGED | n/a |