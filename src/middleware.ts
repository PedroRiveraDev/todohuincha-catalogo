// src/middleware.ts
// Astro middleware. Runs before every endpoint and every page.
//
// Responsibilities (mock auth):
//  - read the `th_mock_session` cookie
//  - look up the user via the shared runtime
//  - expose `Astro.locals.user` (or null) and `Astro.locals.role`
//
// Per-request inject: `Astro.locals.user` and `Astro.locals.role` are
// always populated, even if the result is `null`. Downstream code can
// rely on the type being `AuthUser | null`.
//
// IMPORTANT: this middleware MUST NOT call `request.json()`,
// `request.text()`, or any body-consuming method on the Request — the
// request body is read exactly once by the downstream endpoint handler.
// We resolve the session from the cookie header only.
//
// IMPORTANT: middleware shares the SAME runtime singleton as the login
// and me endpoints. Previously this file created its own backing store
// which meant login and middleware looked at different token maps — that
// is exactly the bug that broke end-to-end login. Now we go through
// `getAuthRuntime()` exclusively.

import { defineMiddleware } from 'astro:middleware';
import { getAuthRuntime } from './lib/auth/runtime';

const injectAuth = defineMiddleware(async (context, next) => {
  let session = null;
  try {
    const runtime = getAuthRuntime();
    session = await runtime.resolveSession(context.request);
  } catch {
    session = null;
  }

  context.locals.user = session?.user ?? null;
  context.locals.role = session?.user?.role ?? null;
  context.locals.sessionToken = session?.token ?? null;

  return await next();
});

export const onRequest = injectAuth;
