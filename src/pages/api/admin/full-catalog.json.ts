import type { APIRoute } from 'astro';
import {
  parseFullCatalogEditorPayload,
  writeFullCatalogEditorPayload,
} from '../../../lib/admin-full-catalog-editor';

export const prerender = import.meta.env?.PROD === true;

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await parseFullCatalogJsonRequest(request);
  } catch {
    return json({ ok: false, errors: ['Request body must be valid JSON.'] }, 400);
  }

  const parsed = parseFullCatalogEditorPayload(body);
  if (!parsed.ok || !parsed.payload) {
    return json({ ok: false, errors: parsed.errors }, 400);
  }

  const result = await writeFullCatalogEditorPayload(parsed.payload);
  if (!result.ok) {
    return json({ ok: false, errors: result.errors }, 422);
  }

  return json({ ok: true });
};

export async function parseFullCatalogJsonRequest(request: Request): Promise<unknown> {
  return await request.json();
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
