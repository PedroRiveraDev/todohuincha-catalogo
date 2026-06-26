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
 * generic fallback (no throw) so the page is still indexable when accessed
 * via a stale URL.
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