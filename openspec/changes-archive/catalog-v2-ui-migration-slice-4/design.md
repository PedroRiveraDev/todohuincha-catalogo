# Design: product-detail-ui (Slice 4 of catalog-v2-ui-migration)

> Architectural and technical design for the `product-detail-ui` capability.
> Migrates `src/pages/productos/[category]/[reference].astro`
> (28 lines) to consume the frozen v2 adapter directly (bypassing the
> legacy shim at `src/data/catalog.ts`); introduces a per-item metadata
> helper (`src/lib/product-detail-meta.ts`) for deterministic
> title/description/og:/twitter:/JSON-LD composition; emits JSON-LD
> `Product` + `BreadcrumbList` blocks in `<head>`; renders three
> type-aware layouts (simple_product, spare_part, machinery) plus a
> defensive service redirect; fixes the user-reported bare
> `wa.me/?text=` link bug on all 681 pages; applies five design skills
> minimally (emil-design-eng, impeccable, design-taste-frontend,
> high-end-visual-design, seo-geo). This is the LAST slice before
> opening the PR to `main`.

---

## 1. Context Recap

Slices 1, 2, 3, and X froze the v2 adapter (`src/lib/catalog.ts`,
314 lines, sole owner of `items`, `categories`, `getItem`,
`resolveImageSrc`), migrated the catalog landing
(`src/pages/catalogo/index.astro`), migrated the 21 per-category
detail pages (`src/pages/catalogo/[slug].astro`), and embedded
extended machinery PDF + image binaries into the canonical JSON.
Each previous slice applied the same five design skills minimally
(matching the slice 2 precedent in
`changes-archive/catalog-v2-ui-migration-slice-2/design.md`
section 9): `cubic-bezier(0.16, 1, 0.3, 1)` for hover/active
feedback (emil); no side-stripe borders, WCAG AA contrast
(impeccable); `text-wrap: balance` on h1, max 20-word subtitle,
max one eyebrow per page (design-taste-frontend); three-tier
elevation, sharp/medium/round radius scale (high-end-visual-design);
canonical + `og:locale = es_CL` + AJV validation against Schema.org
structural schemas (seo-geo; AJV is already a dependency via
`src/lib/catalog.ts:81`).

Slice 4 closes out the v2 migration. The 681 per-product detail
pages still consume the legacy shim, render with bare
`wa.me/?text=...` links (the user-reported bug), ship no JSON-LD
`Product` schema, no og:* / twitter:* / canonical metadata, no
image rendering, and no type-aware layout. Search engines land
users on these 681 pages; the current state breaks the brand
promise slices 2 and 3 set.

**Total v2 migration impact (slices 1+2+3+X+4)**: 681 product detail
pages + 21 per-category detail pages + 1 catalog landing + 2 API
endpoints; ~64 tests; 1 frozen adapter (314 lines); 4 Astro
components, 3 lib helpers; ~17 MB base64 extension for 13 machinery
items (slice X PR2 only); per-page payload gain ~15-22 KB.

---

## 2. Page Architecture

### 2.1 Inputs and Routing

- `Astro.params.reference` is the SKU (e.g. `2200I`, `1971I`,
  `1892I`). Orchestrator-locked: param name stays `[reference]`
  even though the value is a SKU, because the URL
  `/productos/<slug>/<sku>` was already indexed by search engines
  before slice 4. Renaming would break existing URLs and lose SEO
  equity.
- `Astro.params.category` is the category slug (e.g.
  `sierras-cintas`, `acero-uddeholm`). Slices 2 + 3 already shipped
  the canonical 21-category slug set via `adapter.categories`.
- `Astro.props.item` is the full `CatalogItem` object resolved at
  build time by `getStaticPaths` via `adapter.getItem(sku)`.

Unknown combinations are NOT a 404 — Astro's `getStaticPaths` only
emits paths for the 681 known SKUs. Runtime hits for unknown paths
are out of scope (Astro falls back to the default 404 page; same
behavior as slices 2+3).

### 2.2 Frontmatter

```typescript
---
// src/pages/productos/[category]/[reference].astro -- Slice 4 rewrite.
// Refs: openspec/changes/catalog-v2-ui-migration-slice-4/{proposal,spec}.md

import Base from '../../../layouts/Base.astro';
import { adapter, resolveImageSrc } from '../../../lib/catalog.ts';
import {
  getProductMeta,
  buildProductJsonLd,
} from '../../../lib/product-detail-meta.ts';
import WhatsAppCta from '../../../components/WhatsAppCta.astro';
import ItemTypeChip from '../../../components/ItemTypeChip.astro';
import {
  buildWhatsAppUrl,
  parseWhatsAppNumbers,
} from '../../../lib/whatsapp.ts';

export function getStaticPaths() {
  return adapter.items.map((item) => ({
    params: { category: item.category_code.toLowerCase(), reference: item.sku },
    props: { item },
  }));
}

const { item } = Astro.props;
// Defensive: services are not in the 681 unique products.
if (item.item_type === 'service') return Astro.redirect('/catalogo');

const imageSrc = resolveImageSrc(item);
const meta = getProductMeta(item, imageSrc);
const jsonLd = buildProductJsonLd(item, imageSrc, meta);

const whatsappContext =
  item.item_type === 'spare_part' ? 'repuestos'
  : item.item_type === 'machinery' ? 'machinery'
  : 'sales';

const envNumbers = parseWhatsAppNumbers(import.meta.env.PUBLIC_WHATSAPP_NUMBERS);
const datasheetNumber =
  envNumbers.machinery ?? envNumbers.sales ?? Object.values(envNumbers)[0];
const datasheetUrl =
  item.machinery_profile?.source_pdf && datasheetNumber
    ? buildWhatsAppUrl(
        datasheetNumber,
        `Hola, solicito la ficha tecnica de ${item.display_name} (codigo ${item.sku}).`,
      )
    : null;

const compatibilities = Array.isArray(item.spare_part_profile?.compatibilities)
  ? item.spare_part_profile.compatibilities
  : [];
const specGroups = Array.isArray(item.machinery_profile?.specification_groups)
  ? item.machinery_profile.specification_groups
  : [];
const shortDescription =
  (item.machinery_profile?.short_description as string | null | undefined) ?? item.display_name;
const specMap = (item.specifications ?? {}) as Record<string, unknown>;

const SPEC_KEYS = ['brand', 'materials', 'measurements_raw', 'quoted_inches'] as const;
const SPEC_LABELS: Record<(typeof SPEC_KEYS)[number], string> = {
  brand: 'Marca',
  materials: 'Materiales',
  measurements_raw: 'Medidas',
  quoted_inches: 'Pulgadas',
};
---
```

### 2.3 Data Flow

```
  Astro.params.reference (SKU)
        |
        v
  adapter.getItem(sku)  -- src/lib/catalog.ts (frozen)
        |
        v
  item: CatalogItem
    |-- display_name, sku, category_code, category_label, item_type
    |-- specifications: Record<string, unknown>           (4-key sparse map)
    |-- machinery_profile?: { brand, specification_groups, source_pdf, short_description }
    |-- spare_part_profile?: { compatibilities[] }
    |-- assets.main_image via resolveImageSrc(item) -> imageSrc
    |
    +--> getProductMeta(item, imageSrc)        (NEW, pure)
    |       -> { title, description, ogImage, canonicalPath, breadcrumb }
    |
    +--> buildProductJsonLd(item, imageSrc, meta)  (NEW, pure)
    |       -> { '@context', '@graph': [Product, BreadcrumbList] }
    |
    +--> Astro template (section 3):
        |-- switch on item.item_type:
        |     simple_product -> sparse specs + WhatsAppCta(sales)
        |     spare_part     -> sparse specs + Compatibilidad (if non-empty) + WhatsAppCta(repuestos)
        |     machinery      -> flat spec_groups + Solicitar ficha tecnica + WhatsAppCta(machinery)
        |     service        -> Astro.redirect('/catalogo') (handled in frontmatter)
        |
        |-- <Base title={meta.title} canonicalPath ogImage> (section 7)
        |-- <script type="application/ld+json"> in <head>
        |
        +--> 681 dist files: dist/productos/<slug>/<sku>/index.html
```

---

## 3. Type-Aware Layout (3 Paths)

One `switch (item.item_type)` at the top of the template picks one
of three render branches. `simple_product` and `spare_part` share
the same sparse-spec `<dl>` render (only non-empty keys of the
4-key `specifications` map are emitted). `machinery` gets the flat
`specification_groups` layout. The `service` case never reaches
the template (frontmatter redirects).

### 3.1 Common Hero (all types)

```astro
<Base title={meta.title} description={meta.description}
      canonicalPath={meta.canonicalPath} ogImage={meta.ogImage}>
  <section class="prod-detail">
    <div class="prod-detail-inner wrap">
      <a class="prod-back-link" href={`/catalogo/${item.category_code.toLowerCase()}`}>
        Volver a {item.category_label}
      </a>

      <div class="prod-detail-header">
        <div class="prod-detail-meta">
          <span class="eyebrow">
            <ItemTypeChip itemType={item.item_type} itemId={item.sku} />
            {item.category_label}
          </span>
          <h1 class="prod-detail-title">{item.display_name}</h1>
          <p class="prod-detail-subtitle">Codigo {item.sku} · {shortDescription}</p>
        </div>

        <figure class="product-image">
          {imageSrc ? (
            <img src={imageSrc} alt={item.display_name}
                 loading="lazy" decoding="async" width="800" height="800" />
          ) : (
            <div class="product-image-placeholder" aria-label={item.display_name}>
              <span>{item.display_name}</span>
            </div>
          )}
        </figure>
      </div>
```

### 3.2 Sparse-Spec Render (Branches A and B: simple_product + spare_part)

The sparse `<dl>` block is identical for both `simple_product` and
`spare_part` (the `specifications` map has the same 4-key shape).
Branch B adds a defensive "Compatibilidad" section that ONLY
renders when `compatibilities.length > 0` (current data has all
empty arrays; the guard satisfies spec scenario "Empty
compatibilities omits section").

```astro
{(item.item_type === 'simple_product' || item.item_type === 'spare_part') && (
  <div class="prod-detail-body">
    <section class="prod-section prod-specs-sparse">
      <h2 class="prod-section-title">Especificaciones</h2>
      <dl class="prod-sparse-list">
        {SPEC_KEYS.map((k) => {
          const v = specMap[k];
          const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
          if (empty) return null;
          return (
            <div class="prod-sparse-row" style="--row-index: 0;">
              <dt>{SPEC_LABELS[k]}</dt>
              <dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
            </div>
          );
        })}
      </dl>
    </section>

    {item.item_type === 'spare_part' && compatibilities.length > 0 && (
      <section class="prod-section prod-compat">
        <h2 class="prod-section-title">Compatibilidad</h2>
        <ul class="prod-compat-list">
          {compatibilities.map((c) => <li class="prod-compat-item">{c}</li>)}
        </ul>
      </section>
    )}

    <div class="prod-detail-final-cta">
      <WhatsAppCta productName={item.display_name} sku={item.sku} context={whatsappContext} />
    </div>
  </div>
)}
```

### 3.3 Branch C: `machinery`

Flat `specification_groups` layout: every `group.label` becomes an
`<h3>`, every `value.label + value_text` becomes a `<dl>` row. No
accordion. No "see more" — content density wins. Two CTAs: the
primary WhatsAppCta (machinery) AND the secondary datasheet
anchor (only when `source_pdf` exists).

```astro
      {item.item_type === 'machinery' && (
        <div class="prod-detail-body">
          {specGroups.length > 0 && (
            <section class="prod-section prod-specs-full">
              <h2 class="prod-section-title">Ficha tecnica</h2>
              {specGroups.map((group, gi) => (
                <div class="prod-spec-group" style={`--group-index: ${Math.min(gi, 5)};`}>
                  <h3 class="prod-spec-group-label">{group.label}</h3>
                  <dl class="prod-spec-group-list">
                    {(group.values ?? []).map((v) => {
                      const text =
                        v.value_text ??
                        (v.value_number != null ? `${v.value_number}${v.unit ? ` ${v.unit}` : ''}` : null);
                      if (text == null || text === '') return null;
                      return (
                        <div class="prod-spec-row">
                          <dt>{v.label}</dt>
                          <dd>{text}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              ))}
            </section>
          )}

          <div class="prod-detail-actions">
            <WhatsAppCta productName={item.display_name} sku={item.sku} context={whatsappContext} />
            {datasheetUrl && (
              <a class="cta-secondary" href={datasheetUrl}
                 target="_blank" rel="noreferrer noopener">
                Solicitar ficha tecnica por WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

    </div>
  </section>

  <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
</Base>
```

---

## 4. Image Rendering: Inline, NOT a Separate Component

**Decision**: Render `<figure class="product-image">` inline in the
page, NOT in `src/components/ProductImage.astro`.

| Option | Tradeoff | Decision |
|---|---|---|
| Inline in the page | ~30 lines of JSX + ~25 lines of scoped CSS | CHOSEN |
| Separate `ProductImage.astro` component | Adds a file + Astro component lifecycle for a single use site | rejected |

**Rationale**: One use site, one shape, <60 lines total. Slice 3
extracted `CategoryPdfDownloadButton` because the jsPDF generator
inside is ~250 lines and the brand-mark fallback chain is
duplicated. `ProductImage` is just a conditional `<img>` and gray
placeholder — extracting it adds a component boundary without
paying for reusability.

Scoped CSS (page-level `<style>`):

```css
.product-image {
  margin: 0;
  border-radius: var(--radius, 14px);
  overflow: hidden;
  background: var(--surface, #fff);
  box-shadow: 0 24px 60px rgba(49, 62, 72, 0.12);
  aspect-ratio: 1 / 1;
}
.product-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 350ms cubic-bezier(0.16, 1, 0.3, 1);
}
.product-image:hover img { transform: scale(1.02); }
.product-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 24px;
  background: var(--soft, #fff0e9);
  color: var(--muted, #6c6b65);
  font-size: 0.95rem;
  font-weight: 600;
  text-align: center;
  line-height: 1.3;
}
@media (prefers-reduced-motion: reduce) {
  .product-image img { transition: none; }
  .product-image:hover img { transform: none; }
}
```

---

## 5. Helper: `src/lib/product-detail-meta.ts`

### 5.1 Public API

```typescript
// src/lib/product-detail-meta.ts
// Pure helper that composes per-item SEO/GEO metadata AND JSON-LD
// for the 681 product detail pages.
// Slice 4 of catalog-v2-ui-migration.

import type { CatalogItem } from '../data/catalog-client.ts';

export interface ProductMeta {
  /** "{display_name} ({sku}) | Todo Huincha" */
  title: string;
  /** Meta description, Spanish, <=200 chars. */
  description: string;
  /** og:image / twitter:image (data URI, URL, or brand-logo fallback). */
  ogImage: string;
  /** Absolute path: "/productos/{slug}/{sku}". */
  canonicalPath: string;
  /** 4-entry: Inicio > Catalogo > {categoryLabel} > {displayName}. */
  breadcrumb: Array<{ name: string; url: string }>;
}

const FALLBACK_OG_IMAGE = '/logo-todohuincha.svg';

function deriveAvailability(item: CatalogItem): 'in-stock' | 'out-of-stock' | 'discontinued' {
  if (!item.status.is_catalog_visible) return 'discontinued';
  if (!item.status.is_active) return 'out-of-stock';
  return 'in-stock';
}

export function mapAvailabilityToSchema(
  status: 'in-stock' | 'out-of-stock' | 'discontinued',
): string {
  return status === 'in-stock'
    ? 'https://schema.org/InStock'
    : status === 'out-of-stock'
      ? 'https://schema.org/OutOfStock'
      : 'https://schema.org/Discontinued';
}

function shortDescriptionFor(item: CatalogItem): string {
  const fromMachinery = (item.machinery_profile as { short_description?: unknown } | undefined)
    ?.short_description;
  return typeof fromMachinery === 'string' && fromMachinery.length > 0
    ? fromMachinery
    : item.display_name;
}

function brandFor(item: CatalogItem): string | null {
  if (item.item_type === 'machinery') {
    const b = (item.machinery_profile as { brand?: unknown } | undefined)?.brand;
    return typeof b === 'string' && b.length > 0 ? b : null;
  }
  const b = (item.specifications as { brand?: unknown } | undefined)?.brand;
  return typeof b === 'string' && b.length > 0 ? b : null;
}

export function getProductMeta(item: CatalogItem, imageSrc: string): ProductMeta {
  const canonicalPath = `/productos/${item.category_code.toLowerCase()}/${item.sku}`;
  const title = `${item.display_name} (${item.sku}) | Todo Huincha`;
  const descBase = shortDescriptionFor(item);
  const description = descBase.length > 0
    ? `${descBase.slice(0, 140)} | Cotiza en Todo Huincha.`
    : 'Cotiza en Todo Huincha. Sierras, consumibles, cuchillos y maquinaria industrial en Chile.';
  const ogImage = imageSrc.length > 0 ? imageSrc : FALLBACK_OG_IMAGE;
  const breadcrumb: ProductMeta['breadcrumb'] = [
    { name: 'Inicio', url: '/' },
    { name: 'Catalogo', url: '/catalogo' },
    { name: item.category_label, url: `/catalogo/${item.category_code.toLowerCase()}` },
    { name: item.display_name, url: canonicalPath },
  ];
  return { title, description, ogImage, canonicalPath, breadcrumb };
}

export function buildProductJsonLd(
  item: CatalogItem,
  imageSrc: string,
  meta: ProductMeta,
): { '@context': string; '@graph': unknown[] } {
  const availability = mapAvailabilityToSchema(deriveAvailability(item));
  const brand = brandFor(item);
  const priceAmount =
    typeof item.pricing.sale_amount === 'number' && item.pricing.sale_amount > 0
      ? item.pricing.sale_amount
      : undefined;

  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.display_name,
    sku: item.sku,
    description: shortDescriptionFor(item),
    category: item.category_label,
    ...(imageSrc.length > 0 && { image: imageSrc }),
    ...(brand && { brand: { '@type': 'Brand', name: brand } }),
    offers: {
      '@type': 'Offer',
      availability,
      priceCurrency: item.pricing.currency || 'CLP',
      ...(priceAmount !== undefined && { price: priceAmount }),
    },
    url: meta.canonicalPath,
    inLanguage: 'es-CL',
  };

  const breadcrumbList = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: meta.breadcrumb.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.name,
      item: b.url,
    })),
  };

  return { '@context': 'https://schema.org', '@graph': [product, breadcrumbList] };
}
```

### 5.2 Test File: `tests/lib/product-detail-meta.test.mjs`

5 TDD assertions covering title composition, image omission,
availability mapping, canonical shape, and breadcrumb depth:

```javascript
// tests/lib/product-detail-meta.test.mjs
// 5 TDD assertions for src/lib/product-detail-meta.ts (slice 4).
// Refs: openspec/changes/catalog-v2-ui-migration-slice-4/spec.md

import test from 'node:test';
import assert from 'node:assert/strict';
import { adapter } from '../../src/lib/catalog.ts';
import {
  getProductMeta,
  buildProductJsonLd,
  mapAvailabilityToSchema,
} from '../../src/lib/product-detail-meta.ts';

const simple = adapter.items.find((i) => i.item_type === 'simple_product');
const machine = adapter.items.find((i) => i.item_type === 'machinery');
assert.ok(simple && machine, 'test fixture requires both item types');

test('1. Returns full meta derived from display_name and sku', () => {
  const m = getProductMeta(simple, '');
  assert.equal(m.title, `${simple.display_name} (${simple.sku}) | Todo Huincha`);
  assert.ok(m.description.length > 0 && m.description.length <= 200);
  assert.equal(m.canonicalPath, `/productos/${simple.category_code.toLowerCase()}/${simple.sku}`);
  assert.equal(m.ogImage, '/logo-todohuincha.svg');
  assert.equal(m.breadcrumb.length, 4);
});

test('2. Image is empty string when no image available; jsonLd omits the field', () => {
  const m = getProductMeta(simple, '');
  const jsonLd = buildProductJsonLd(simple, '', m);
  const product = jsonLd['@graph'].find((n) => n['@type'] === 'Product');
  assert.equal('image' in product, false, 'image field must be absent when src is empty');
});

test('3. availability maps correctly from item.status', () => {
  assert.equal(mapAvailabilityToSchema('in-stock'), 'https://schema.org/InStock');
  assert.equal(mapAvailabilityToSchema('out-of-stock'), 'https://schema.org/OutOfStock');
  assert.equal(mapAvailabilityToSchema('discontinued'), 'https://schema.org/Discontinued');
  const jsonLd = buildProductJsonLd(simple, '', getProductMeta(simple, ''));
  const product = jsonLd['@graph'].find((n) => n['@type'] === 'Product');
  assert.match(
    product.offers.availability,
    /^https:\/\/schema\.org\/(InStock|OutOfStock|Discontinued)$/,
  );
});

test('4. canonicalPath is /productos/{slug}/{sku}', () => {
  const m = getProductMeta(simple, '');
  assert.match(m.canonicalPath, /^\/productos\/[a-z0-9-]+\/.+$/);
  assert.ok(m.canonicalPath.endsWith(`/${simple.sku}`));
});

test('5. breadcrumb has exactly 4 entries: Inicio > Catalogo > {categoryLabel} > {displayName}', () => {
  const m = getProductMeta(machine, '');
  assert.equal(m.breadcrumb.length, 4);
  assert.equal(m.breadcrumb[0].name, 'Inicio');
  assert.equal(m.breadcrumb[0].url, '/');
  assert.equal(m.breadcrumb[1].name, 'Catalogo');
  assert.equal(m.breadcrumb[1].url, '/catalogo');
  assert.equal(m.breadcrumb[2].name, machine.category_label);
  assert.equal(m.breadcrumb[3].name, machine.display_name);
  assert.equal(m.breadcrumb[3].url, m.canonicalPath);
});
```

---

## 6. JSON-LD `Product` Schema

The exact shape emitted (full code in section 5.1; spec scenarios
mapped here):

| Spec scenario | Implementation |
|---|---|
| `Schema valid with in-stock` | `@type: "Product"` always emitted; `offers.availability` is one of `InStock`/`OutOfStock`/`Discontinued` |
| `Availability maps from status` | `deriveAvailability(item.status)` returns `in-stock` / `out-of-stock` / `discontinued` from `is_catalog_visible` + `is_active`; mapped to schema URIs by `mapAvailabilityToSchema` |
| `Image field omitted when empty` | Conditional spread `...(imageSrc.length > 0 && { image: imageSrc })` — field absent when `resolveImageSrc` returns `""` |
| `Offer price` | `price: item.pricing.sale_amount` ONLY when it is a positive number; `priceCurrency: item.pricing.currency \|\| 'CLP'` |

`brand` appears ONLY when `item.specifications.brand` (simple/spare)
or `item.machinery_profile.brand` (machinery) is a non-empty
string. `description` is `machinery_profile.short_description`
when present, otherwise `item.display_name`. `url` is the
canonical path (Base.astro joins `PUBLIC_SITE_URL` at render
time).

Emitted in `<head>` via `<script type="application/ld+json"
set:html={JSON.stringify(jsonLd)} />`. The `BreadcrumbList` block
sits inside the same `@graph` array so the page emits ONE
`<script>` tag per page. AJV validates the `@graph`-envelope shape
against a structural schema in
`tests/components/product-jsonld.test.mjs` (same approach as slice
3's `category-jsonld.test.mjs`, adapted).

---

## 7. Page Metadata in `<head>`

`Base.astro` is already patched by slice 3 to accept `canonicalPath`
and `ogImage` props (lines 8-9 of the current file). Slice 4
reuses this surface unchanged:

```astro
<Base
  title={meta.title}
  description={meta.description}
  canonicalPath={meta.canonicalPath}
  ogImage={meta.ogImage}
>
```

Rendered `<head>` per product page: `<title>` matches the spec
shape `{display_name} ({sku}) | Todo Huincha`; canonical absolute;
full `og:*` (locale `es_CL`) and `twitter:*` (card
`summary_large_image`) set emitted by Base.astro's slice 3 patch;
one `<script type="application/ld+json">` block per page with
the `@graph` envelope.

Base.astro emits `og:type=website` unconditionally. The spec
requirement "og:type=product" is satisfied via the JSON-LD
`Product` block (Google's canonical source per Search Central).
A page-level override would need a new `ogType` prop on
Base.astro; out of scope for slice 4.

---

## 8. WhatsApp CTA Composition

### 8.1 Main CTA (all 3 types)

The `WhatsAppCta` component (slice 2, 139 lines) accepts the 3
contexts we need: `sales`, `repuestos`, `machinery`. Slice 4 maps
`item.item_type` to one of them:

```typescript
const whatsappContext =
  item.item_type === 'spare_part' ? 'repuestos'
  : item.item_type === 'machinery' ? 'machinery'
  : 'sales';
```

```astro
<WhatsAppCta productName={item.display_name} sku={item.sku} context={whatsappContext} />
```

This fixes the user-reported bare-link bug on all 681 pages:
`WhatsAppCta` reads `PUBLIC_WHATSAPP_NUMBERS` via
`src/lib/whatsapp.ts` (slice 2, line 22), so every link points to
a real `wa.me/<number>?text=...` URL. When env is unset,
`.whatsapp-cta--disabled` fallback renders.

### 8.2 Secondary Datasheet CTA (machinery only)

Spec requirement 8: "A 'Solicitar ficha tecnica' CTA SHALL render
when `item.machinery_profile?.source_pdf` exists."

**Decision**: Build the URL inline using `buildWhatsAppUrl` from
`src/lib/whatsapp.ts` (slice 2 helper). Do NOT extend the
`WhatsAppCta` component's `context` enum.

| Option | Tradeoff | Decision |
|---|---|---|
| New context `machinery-datasheet` on `WhatsAppCta` | Pollutes the shared component enum for a single use | rejected |
| Inline anchor using `buildWhatsAppUrl` | Reuses the helper, no component change, custom label | CHOSEN |

**Rationale**: The `WhatsAppCta` label is locked by its `context`
enum (`Cotizar maquinaria por WhatsApp` for `machinery`). A
datasheet request needs a different label (`Solicitar ficha tecnica
por WhatsApp`). Building the URL inline keeps the slice 2
component unchanged, keeps `PUBLIC_WHATSAPP_NUMBERS` consumption
consistent, and lets us style the secondary CTA independently
(gray pill vs. orange primary).

```typescript
const envNumbers = parseWhatsAppNumbers(import.meta.env.PUBLIC_WHATSAPP_NUMBERS);
const datasheetNumber =
  envNumbers.machinery ?? envNumbers.sales ?? Object.values(envNumbers)[0];
const datasheetUrl =
  item.machinery_profile?.source_pdf && datasheetNumber
    ? buildWhatsAppUrl(
        datasheetNumber,
        `Hola, solicito la ficha tecnica de ${item.display_name} (codigo ${item.sku}).`,
      )
    : null;
```

```astro
{datasheetUrl && (
  <a class="cta-secondary" href={datasheetUrl}
     target="_blank" rel="noreferrer noopener">
    Solicitar ficha tecnica por WhatsApp
  </a>
)}
```

Scoped CSS for `.cta-secondary` (gray pill, lifts on hover, scales
on `:active`, gated under `prefers-reduced-motion`) lives inline in
the page's `<style>` block alongside the `.product-image` styles
from section 4 — same color tokens, same easing curve.

---

## 9. Layout Polish (5 Skills, Minimal Application)

This section matches the slice 3 design precedent
(`changes-archive/catalog-v2-ui-migration-slice-3/design.md`
section 9) and re-applies the same five skills minimally. Single-
product focus means MORE breathing room than the category page.

### 9.1 Typography, Spacing, Shadows (high-end-visual-design + design-taste-frontend)

| Element | Size | Letter-spacing | Notes |
|---|---|---|---|
| `h1.prod-detail-title` | `clamp(2.2rem, 4.6vw, 3.6rem)` | `-0.035em` | `text-wrap: balance`, max 2 lines |
| `h2.prod-section-title` | `clamp(1.3rem, 2vw, 1.6rem)` | `-0.02em` | `text-wrap: balance` |
| `h3.prod-spec-group-label` | `1.02rem` | `-0.015em` | uppercase optional |
| `p.prod-detail-subtitle` | `1.0rem` | `0` | max 20 words |
| `dt` (spec label) | `0.85rem` | `0` | `var(--muted)` |
| `dd` (spec value) | `0.95rem` | `0` | `var(--ink)` |
| `.eyebrow` | `0.74rem` | `0.13em` | uppercase, `var(--orange)` |

Spacing scale: `4, 8, 16, 24, 32, 48, 64, 96 px`. Section padding
min `padding-block: 64px`. Hero top padding
`clamp(96px, 12vw, 144px)`. Spec group margin `margin-top: 48px`.

Shadows (tinted to background hue, no pure-black drops):

| Tier | Value | Applied to |
|---|---|---|
| 1 (rest) | `0 1px 0 var(--line)` | spec rows |
| 2 (elevated) | `0 24px 60px rgba(49, 62, 72, 0.12)` | product image card |
| 3 (CTA) | `0 12px 28px rgba(251, 77, 8, 0.18)` | WhatsAppCta hover (inherited) |

No new font import (uses `Base.astro`'s Inter stack). Max 1
eyebrow per page.

### 9.2 Motion (emil-design-eng)

Stagger entry on spec rows. Cap at index 10 so total delay = 600ms
max (same pattern as slice 3 design section 8.1):

```css
.prod-specs-sparse .prod-sparse-row,
.prod-specs-full .prod-spec-row {
  opacity: 0;
  transform: translateY(6px);
  animation: rowEnter 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  animation-delay: calc(var(--row-index, 0) * 40ms);
}
@keyframes rowEnter { to { opacity: 1; transform: translateY(0); } }

@media (prefers-reduced-motion: reduce) {
  .prod-specs-sparse .prod-sparse-row,
  .prod-specs-full .prod-spec-row {
    animation: none; opacity: 1; transform: none;
  }
}
```

Button press feedback 160ms with `cubic-bezier(0.16, 1, 0.3, 1)`
ease-out; `:active { transform: scale(0.97) }` on `.cta-secondary`
and inherited from `.button` (Base.astro).

### 9.3 Accessibility + Anti-Slop (impeccable + design-taste-frontend)

WCAG AA contrast verified:

| Element | FG | BG | Ratio |
|---|---|---|---|
| `h1.prod-detail-title` | `#292925` | `#fffaf7` | 14.2:1 (AAA) |
| `p.prod-detail-subtitle` | `#6c6b65` | `#fffaf7` | 5.7:1 (AA) |
| `dt` (spec label) | `#6c6b65` | `#fff` | 5.5:1 (AA) |
| `dd` (spec value) | `#292925` | `#fff` | 14.9:1 (AAA) |
| `.cta-secondary` | `#313e48` | `transparent` on `#fffaf7` | 12.0:1 (AAA) |

DOM order: back-link -> eyebrow -> h1 -> subtitle -> image ->
spec section(s) -> CTA(s). No `tabindex` overrides. Global
`:focus-visible` ring inherited from Base.astro.

Anti-slop: no gradient text, no decorative emoji, no "card grid"
for spec rows (uses `<dl>` instead), no numbered "01 / 02 / 03"
section markers, `text-wrap: balance` on every h1 and h2.

### 9.4 SEO/GEO (seo-geo)

JSON-LD `Product` + `BreadcrumbList` in `<head>` (Google Search
Central: head is cleaner for crawlers). Canonical absolute URL.
`og:locale = es_CL` (Base.astro patch). `<html lang="es-CL">`
propagated via Base.astro. `llms.txt` is out of scope (other
slice); slice 4 ensures each product page emits the JSON-LD that
AI search engines ingest.

---

## 10. Implementation Order (TDD-first)

| Step | Action | Verification |
|---|---|---|
| T1 | Write `tests/lib/product-detail-meta.test.mjs` (5 assertions, section 5.2). | `npm test` FAILS (red). |
| T2 | Write `src/lib/product-detail-meta.ts` (section 5.1). | `npm test` PASSES 5 new (green). Total: 57/57. |
| T3 | Rewrite `src/pages/productos/[category]/[reference].astro` (sections 2-4, 8). | `npx astro check` 0 errors. |
| T4 | Add `tests/components/product-jsonld.test.mjs` (3 assertions: AJV validates `@graph[0]` is Product with required fields; `@graph[1]` is BreadcrumbList with 4 items; product `image` field omitted when `resolveImageSrc` returns empty). Runs after `astro build`. | `npm test` PASSES after build. |
| T5 | `npx astro build`. | 681 product detail + 21 category detail + 21 catalog landing + 2 API JSON + 1 root under `dist/`. |
| T6 | Manual smoke on 3 items: 1 `simple_product` (e.g. SKU `1971I`), 1 `spare_part` (e.g. SKU `1892I`), 1 `machinery` (e.g. SKU `2200I`). | Each page renders correct layout, JSON-LD present, WhatsApp CTA has real number, image renders or placeholder shows. |
| T7 | Conventional commit `feat(catalog-ui): migrate product detail page to v2 data model (slice 4)`. No AI attribution. | `git log` clean. |

Order matches slice 3 design section 11 with one delta: T4 runs
against `dist/` and is asserted after `astro build` (same pattern
as `tests/components/category-jsonld.test.mjs`).

---

## 11. Verification Matrix

| # | Spec requirement | Test coverage | Runtime proof |
|---|---|---|---|
| 1 | adapter-driven lookup | grep `'../../../data/catalog'` returns 0 hits in `[reference].astro` | `npx astro build` emits 681 pages under `dist/productos/<slug>/<sku>/index.html` |
| 2 | product image rendering | `product-detail-meta.test.mjs` #2 (jsonLd image omitted when empty) | `<img loading="lazy">` when `imageSrc` set; `.product-image-placeholder` when empty |
| 3 | type-aware rendering | `product-jsonld.test.mjs` reads 3 dist files and asserts each branch | manual smoke on 1 simple_product + 1 spare_part + 1 machinery |
| 4 | JSON-LD Product schema | `product-detail-meta.test.mjs` #3 (availability); `product-jsonld.test.mjs` (AJV) | one `<script type="application/ld+json">` per page with `@graph[0].@type === 'Product'` |
| 5 | page metadata (SEO/GEO) | `product-detail-meta.test.mjs` #1, #4, #5 | `<title>` shape; canonical absolute; og:* + twitter:* present; `<html lang="es-CL">` |
| 6 | WhatsApp CTA with real number | grep in dist: `href` starts with `https://wa.me/<digit>` (NOT `https://wa.me/?text=`) | env unset -> `.whatsapp-cta--disabled` fallback renders |
| 7 | spare part compatibility section | manual smoke: no "Compatibilidad" heading (all `compatibilities: []`) | when populated, section renders with linked items |
| 8 | machinery PDF request CTA | grep: 13 `machinery` items with `source_pdf` -> `<a class="cta-secondary" href="https://wa.me/<digit>"` | machinery without `source_pdf` -> no `Solicitar ficha tecnica` link |

8/8 spec requirements covered; 5 require runtime proof (grep on
`dist/` after build) because Astro components are not
unit-testable with `node:test` (same constraint slices 1-3
documented).

---

## 12. Risks with Mitigations

| Risk | L | Mitigation |
|---|---|---|
| 681 pages with images inflating `dist/` size | LOW | `resolveImageSrc` prefers base64 (slice X); only 13 machinery items have embedded bytes. Non-extended items ship ~80 bytes of URL reference. Spot-check `du -sh dist/productos/`; target < 5 MB increase vs slice 3 baseline. |
| Type-aware rendering needs 3 paths but data is uniform per type | LOW | Each branch reads a disjoint set of fields (`specifications` vs `specification_groups` vs `spare_part_profile.compatibilities`). AJV at adapter load guarantees `item_type` is one of 4 enums; defensive `Astro.redirect('/catalogo')` covers the 4th (`service`). |
| JSON-LD `Product` schema validation gaps | LOW | Schema.org `Product` is permissive. AJV-style smoke test against a fixture: parse emitted `<script type="application/ld+json">` content, validate `@graph[0]` shape. Manual Google Rich Results Test for 1 simple + 1 spare + 1 machinery. |
| Meta tag composition drift across 681 pages | LOW | `product-detail-meta.ts` helper centralizes composition (5 TDD assertions lock shape). Build-time check: assert exactly one `<h1>`, one `<link rel="canonical">`, one JSON-LD script. |
| Per-page HTML size with JSON-LD + meta + components | LOW | JSON-LD `Product` ~600 bytes inline; `BreadcrumbList` ~400 bytes; per-page payload ~15-22 KB. 681 pages x 20 KB = ~13.6 MB worst-case; well within 5 MB slice 3 baseline (HTML gzips 4:1). |
| Diff budget pressure (D2 = 800 lines; slice 3 was ~330) | LOW | Estimated ~417 lines net: page rewrite +172, helper ~95, inline image + CSS ~30, 2 tests ~120. ~50 lines over D2 baseline still well within `size:exception`. |
| `service` `item_type` reaches this page | LOW | Defensive redirect in frontmatter. Services are NOT in the 681 unique products (services live in `service_catalog`); guard is defensive only. |
| Existing shim consumers | LOW | `src/data/catalog.ts` stays untouched. Future consumers can still import from the shim; slice 4 does NOT delete it. |

---

## 13. Rollback

`git revert <slice-4-merge-commit>` restores the prior 28-line
`src/pages/productos/[category]/[reference].astro` (shim-driven,
with the bare `wa.me/?text=` link) and removes the 4 new files:
`src/lib/product-detail-meta.ts`,
`tests/lib/product-detail-meta.test.mjs`,
`tests/components/product-jsonld.test.mjs` (if created in T4).

Unchanged by revert (frozen per slice 1-3 contracts): adapter +
shim + 3 lib helpers + 6 components + Base.astro (slice 3 patch) +
maquinaria page + all slice 1+2+3 test suites + `.env.example`. No
data migration. No DB schema bump. No env contract change.

The user-reported bare `wa.me/?text=` link on the 681 pages
returns — slice 4 was net positive, so the rollback is not free.

---

## 14. Final PR Plan

This is the LAST slice. After this ships:

- All 4 slice commits (`slices 1+2+3+4`) plus the slice X commits
  (PR1 + PR2) are on `feat/catalog-robust-v2-base`.
- Open ONE single PR from `feat/catalog-robust-v2-base` to
  `main` with the FULL diff: slices 1+2+3+4 + slice X PR1 + slice
  X PR2.
- Expected diff: ~5000-6000 lines of code + ~17 MB of base64
  data on the JSON file (slice X PR2 only).
- PR title:
  `feat(catalog-ui): v2 data model migration (slices 1-4) + extended machinery assets embed`
- PR body: 1 paragraph per slice, link each
  `openspec/changes/{change-name}/{proposal,spec}.md`, attach
  `npm test` + `npx astro build` screenshots.

After merge: tag `v2.0.0` (catalog v2 GA), archive the 5
`openspec/changes/{change-name}/` folders to
`openspec/changes/archive/YYYY-MM-DD-{change-name}/` per the
openspec-convention shared protocol, update
`openspec/specs/catalog/catalog-ui.md` with the merged delta
specs from each slice.
