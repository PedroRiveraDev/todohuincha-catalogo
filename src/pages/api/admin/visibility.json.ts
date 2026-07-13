// src/pages/api/admin/visibility.json.ts
// POST /api/admin/visibility.json
//
// Writes the visibility block into
//   catalog_generation.output_types.full_catalog_pdf.visibility
// through the existing writeCatalogGeneration (so AJV schema validation
// still applies). Only admins may write.
//
// Request body:
//   {
//     products: { default: { visible_to_vendor, visible_to_public },
//                 by_sku: { SKU: { visible_to_vendor, visible_to_public } } },
//     categories: { default: { visible_to_vendor, visible_to_public },
//                   by_code: { CODE: { visible_to_vendor, visible_to_public } } }
//   }

import type { APIRoute } from 'astro';
import { parseVisibilityPayload, writeOutputVisibility } from '../../../lib/admin-visibility';
import { getAuthRuntime } from '../../../lib/auth/runtime';
import { requireAdmin } from '../../../lib/auth/auth-guard';

export { parseVisibilityPayload };

export const prerender = import.meta.env?.PROD === true;

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getAuthRuntime();
  // Re-resolve from the request in case middleware state is empty
  // (handy for direct API calls during tests/smoke).
  const session = locals.user ? { user: locals.user } : await runtime.resolveSession(request);
  const guard = requireAdmin(session?.user ?? null);
  if (!guard.ok) {
    return jsonResponse({ ok: false, errors: [guard.reason ?? 'forbidden'] }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, errors: ['Request body must be valid JSON.'] }, 400);
  }

  const parsed = parseVisibilityPayload(body);
  if (!parsed.ok || !parsed.payload) {
    return jsonResponse({ ok: false, errors: parsed.errors }, 400);
  }

  const result = await writeOutputVisibility(parsed.payload);
  if (!result.ok) {
    return jsonResponse({ ok: false, errors: result.errors }, 422);
  }
  return jsonResponse({ ok: true });
};

function jsonResponse(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export { parseVisibilityPayload as _parseVisibilityPayload };
