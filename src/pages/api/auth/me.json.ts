// src/pages/api/auth/me.json.ts
// GET /api/auth/me.json
//
// Returns the resolved user for the current session, or 401 when there is
// none. Prerendered admin/vendor pages call this endpoint on load to
// decide whether to render protected UI.

import type { APIRoute } from 'astro';
import { getAuthRuntime } from '../../../lib/auth/runtime';
import { projectUserForClient } from '../../../lib/auth/login-flow';

export const prerender = import.meta.env?.PROD === true;

export const GET: APIRoute = async ({ request, locals }) => {
  const runtime = getAuthRuntime();
  const session = await runtime.resolveSession(request);
  if (!session || !session.user) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthenticated' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const headers = new Headers();
  headers.set('content-type', 'application/json; charset=utf-8');
  if (locals.user && locals.user.active) {
    headers.set('x-auth-role', locals.user.role);
  }
  return new Response(
    JSON.stringify({
      ok: true,
      user: projectUserForClient(session.user),
    }),
    { status: 200, headers }
  );
};
