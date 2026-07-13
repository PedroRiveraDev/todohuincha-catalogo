import type { APIRoute } from 'astro';
import { parseCategoryEditorPayload, writeCategoryEditorPayload } from '../../../lib/admin-categories-editor';

export const prerender = import.meta.env?.PROD === true;

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, errors: ['Request body must be valid JSON.'] }, 400);
  }

  const parsed = parseCategoryEditorPayload(body);
  if (!parsed.ok || !parsed.payload) {
    return json({ ok: false, errors: parsed.errors }, 400);
  }

  const result = await writeCategoryEditorPayload(parsed.payload);
  if (!result.ok) {
    return json({ ok: false, errors: result.errors }, 422);
  }

  return json({ ok: true });
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
