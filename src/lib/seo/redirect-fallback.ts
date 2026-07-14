// Emits only the meta-refresh for the static fallback. Canonical + noindex are
// owned by Base.astro via the `canonical` and `noIndex` props on each legacy
// alias page, so this helper does not duplicate those signals.

export interface RedirectMetaInput {
  target: string;
  adapterActive: boolean;
}

export function buildRedirectMeta(input: RedirectMetaInput): string {
  if (input.adapterActive) return '';
  const safeTarget = /^\//.test(input.target) ? input.target : `/${input.target}`;
  return `<meta http-equiv="refresh" content="0; url=${safeTarget}">`;
}