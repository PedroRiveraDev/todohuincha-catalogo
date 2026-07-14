// Adapter detection for redirect behavior.
// We probe astro.config.mjs at module load time and look for an SSR adapter line.
// When none is found, we serve the static fallback (meta-refresh + canonical + noindex).
// When an SSR adapter IS configured, we switch to a true Astro.redirect(target, 308) at
// the page frontmatter level.
//
// We deliberately do NOT introduce env keys for this — the config file is the source of
// truth and we read it directly. If astro.config.mjs cannot be read (e.g. fresh checkout
// without a build), we fall back to "no adapter" which is the conservative choice.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: boolean | undefined;

export function detectAdapter(): boolean {
  if (cached !== undefined) return cached;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // Walk up from src/lib/seo/ to repo root looking for astro.config.mjs.
    const candidates = [resolve(here, '..', '..', '..', 'astro.config.mjs')];
    for (const path of candidates) {
      try {
        const source = readFileSync(path, 'utf8');
        const hasAdapterImport = /from\s+['"]@astrojs\/(node|vercel|netlify|cloudflare)['"]/.test(source);
        const hasAdapterKey = /adapter\s*:\s*[a-zA-Z_]/.test(source);
        cached = hasAdapterImport && hasAdapterKey;
        return cached;
      } catch {
        // try next
      }
    }
  } catch {
    // ignore
  }
  cached = false;
  return cached;
}