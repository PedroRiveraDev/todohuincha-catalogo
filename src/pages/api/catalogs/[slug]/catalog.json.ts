// src/pages/api/catalogs/[slug]/catalog.json.ts
// GET /api/catalogs/{slug}/catalog.json
// Devuelve el JSON completo del catalogo.
//
// Headers:
//   Content-Type:        application/json
//   X-Schema-Version:    version del schema embebido
//   X-Items-Count:       cantidad de items
//   X-Families-Count:    cantidad de familias
//   Cache-Control:       public, max-age=300
//   ETag:                sha256 del contenido

import type { GetStaticPaths, APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { CATALOG_SLUG, loadCatalog, loadCatalogRaw } from '../../../../lib/catalog-source';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  return [{ params: { slug: CATALOG_SLUG } }];
};

interface CatalogShape {
  schema_version?: string;
  items?: unknown[];
  families?: unknown[];
  service_catalog?: unknown[];
}

export const GET: APIRoute = async () => {
  const raw = await loadCatalogRaw();
  const data = (await loadCatalog()) as CatalogShape;

  const itemsCount = Array.isArray(data?.items) ? data.items.length : 0;
  const familiesCount = Array.isArray(data?.families) ? data.families.length : 0;
  const servicesCount = Array.isArray(data?.service_catalog) ? data.service_catalog.length : 0;

  const etag = `"sha256-${createHash('sha256').update(raw).digest('hex').slice(0, 16)}"`;

  return new Response(raw, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Schema-Version': data?.schema_version ?? '1.0.0',
      'X-Items-Count': String(itemsCount),
      'X-Families-Count': String(familiesCount),
      'X-Services-Count': String(servicesCount),
      'Cache-Control': 'public, max-age=300',
      ETag: etag,
    },
  });
};
