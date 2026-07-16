import { defineConfig } from 'astro/config';

// Site-wide Astro configuration.
// `site` enables absolute URL emission in JSON-LD / sitemap. `trailingSlash: 'always'`
// keeps canonical URLs consistent with the legacy alias map (es-CL).
// No SSR adapter is wired; PR-A ships with the static meta-refresh fallback per design.
// `@astrojs/sitemap` is intentionally not added: the orchestrator constraint disallows
// installing new packages, so PR-A emits a hand-rolled sitemap endpoint at
// src/pages/sitemap.xml.ts that walks the institutional content and emits the canonical
// URL set.

export default defineConfig({
  site: 'https://todohuincha.com',
  output: 'static',
  vite: {
    optimizeDeps: {
      include: ['jspdf'],
    },
  },
});