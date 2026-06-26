// src/lib/product-detail-meta.ts
// Pure helper that composes per-item SEO/GEO metadata AND JSON-LD
// for the 681 product detail pages. Consumed by
// src/pages/productos/[category]/[reference].astro.
//
// Slice 4 of catalog-v2-ui-migration.
// Refs:
//   openspec/changes/catalog-v2-ui-migration-slice-4/spec.md
//   openspec/changes/catalog-v2-ui-migration-slice-4/design.md (section 5)

import type { CatalogItem } from '../data/catalog-client.ts';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FALLBACK_OG_IMAGE = '/logo-todohuincha.svg';

// ---------------------------------------------------------------------------
// Helpers (pure)
// ---------------------------------------------------------------------------

function deriveAvailability(
  item: CatalogItem,
): 'in-stock' | 'out-of-stock' | 'discontinued' {
  if (!item.status.is_catalog_visible) return 'discontinued';
  if (!item.status.is_active) return 'out-of-stock';
  return 'in-stock';
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mapAvailabilityToSchema(
  status: 'in-stock' | 'out-of-stock' | 'discontinued',
): string {
  return status === 'in-stock'
    ? 'https://schema.org/InStock'
    : status === 'out-of-stock'
      ? 'https://schema.org/OutOfStock'
      : 'https://schema.org/Discontinued';
}

export function getProductMeta(item: CatalogItem, imageSrc: string): ProductMeta {
  const canonicalPath = `/productos/${item.category_code.toLowerCase()}/${item.sku}`;
  const title = `${item.display_name} (${item.sku}) | Todo Huincha`;
  const descBase = shortDescriptionFor(item);
  const description =
    descBase.length > 0
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

  const product: Record<string, unknown> = {
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
