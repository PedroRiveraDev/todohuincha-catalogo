// src/pages/api/catalogs/[slug]/schema.json.ts
// GET /api/catalogs/{slug}/schema
// Devuelve el JSON Schema del catalogo para que el cliente lo cachee en localStorage
// y valide la respuesta de /catalog.json contra el.
//
// Headers:
//   Content-Type:        application/json
//   X-Schema-Version:    const del schema o "1.0.0"
//   Cache-Control:       public, max-age=300
//   ETag:                sha256 del contenido

import type { GetStaticPaths, APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { CATALOG_SLUG, loadSchema, loadSchemaRaw } from '../../../../lib/catalog-source';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  return [{ params: { slug: CATALOG_SLUG } }];
};

export const GET: APIRoute = async () => {
  const raw = await loadSchemaRaw();
  const schema = await loadSchema();

  const versionValue =
    typeof schema === 'object' && schema !== null && '$id' in schema
      ? String((schema as Record<string, unknown>).$id)
      : '1.0.0';

  const etag = `"sha256-${createHash('sha256').update(raw).digest('hex').slice(0, 16)}"`;

  return new Response(raw, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Schema-Version': versionValue,
      'Cache-Control': 'public, max-age=300',
      ETag: etag,
    },
  });
};
