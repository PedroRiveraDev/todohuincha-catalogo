// src/pages/api/auth/logout.json.ts
// POST /api/auth/logout.json
//
// Clears the session cookie and removes the token from the in-memory store.

import type { APIRoute } from 'astro';
import { getAuthRuntime } from '../../../lib/auth/runtime';
import { SESSION_COOKIE_NAME, parseCookieHeader } from '../../../lib/auth/session-store';

export const prerender = import.meta.env?.PROD === true;

export const POST: APIRoute = async ({ request }) => {
  const runtime = getAuthRuntime();
  const token = parseCookieHeader(request.headers.get('cookie'), SESSION_COOKIE_NAME);
  runtime.backing.liveTokens.delete(token ?? '');

  const isProduction = import.meta.env?.PROD === true;
  const clearCookie = runtime.sessionContext.buildClearCookie({ isProduction });
  const headers = new Headers();
  headers.append('set-cookie', clearCookie);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
