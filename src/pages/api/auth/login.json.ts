// src/pages/api/auth/login.json.ts
// POST /api/auth/login.json
//
// Request body:
//   { email: string, password: string }
//
// On success: 200 + Set-Cookie th_mock_session=<opaque>; HttpOnly; SameSite=Strict.
// On failure: 401 with a structured reason. Errors are always JSON.

import type { APIRoute } from 'astro';
import { getAuthRuntime } from '../../../lib/auth/runtime';
import { projectUserForClient } from '../../../lib/auth/login-flow';

export const prerender = import.meta.env?.PROD === true;

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export const POST: APIRoute = async ({ request }) => {
  let body: LoginBody;
  try {
    // Read the raw text first so the body stream is consumed exactly once.
    const raw = await request.text();
    if (!raw) {
      return jsonResponse({ ok: false, error: 'empty_body' }, 400);
    }
    body = JSON.parse(raw) as LoginBody;
  } catch (error) {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const runtime = getAuthRuntime();
  const result = await runtime.loginFlow.authenticate({ email, password });
  if (!result.ok || !result.session) {
    const status = result.reason === 'bad_password' || result.reason === 'unknown_user' ? 401 : 400;
    return jsonResponse({ ok: false, error: result.reason ?? 'unknown' }, status);
  }

  const isProduction = import.meta.env?.PROD === true;
  const setCookie = runtime.sessionContext.buildSetCookie(result.session, { isProduction });

  const headers = new Headers();
  headers.append('set-cookie', setCookie);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(
    JSON.stringify({ ok: true, user: projectUserForClient(result.session.user) }),
    { status: 200, headers }
  );
};

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
