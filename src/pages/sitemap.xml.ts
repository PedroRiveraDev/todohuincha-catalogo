// Hand-rolled sitemap.xml.ts endpoint.
// Emits only the institutional authority URLs plus the public catalog and maquinaria
// routes — admin, API, login, vendor, and validation-dashboard paths are excluded.
// Mirrors the filter that @astrojs/sitemap would apply if it were wired in.

import type { APIRoute } from 'astro';
import { loadBranchesJson } from '../lib/seo/loadCompanyJson.ts';

const EXCLUDE_PATTERN = /^\/(admin|api\/admin|api\/auth|login|vendor|validation-dashboard)/;

interface SitemapEntry {
  loc: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: number;
  lastmod?: string;
}

const BASE = 'https://todohuincha.com';
const TODAY = new Date().toISOString().slice(0, 10);

function url(path: string, opts: Partial<SitemapEntry> = {}): SitemapEntry {
  return {
    loc: `${BASE}${path}`,
    changefreq: opts.changefreq ?? 'monthly',
    priority: opts.priority ?? 0.5,
    lastmod: opts.lastmod ?? TODAY,
  };
}

function buildEntries(): SitemapEntry[] {
  const branches = loadBranchesJson();
  const entries: SitemapEntry[] = [
    url('/', { changefreq: 'weekly', priority: 1.0 }),
    url('/empresa/', { priority: 0.9 }),
    url('/empresa/historia/', { priority: 0.7 }),
    url('/empresa/mision-vision/', { priority: 0.7 }),
    url('/sucursales/', { priority: 0.9 }),
    ...branches.map((branch) => url(`/sucursales/${branch.slug}/`, { priority: 0.8 })),
    url('/marcas/', { priority: 0.5 }),
    url('/contacto/', { priority: 0.8 }),
    url('/catalogo', { changefreq: 'weekly', priority: 0.9 }),
    url('/maquinaria', { changefreq: 'weekly', priority: 0.9 }),
    url('/llms.txt', { changefreq: 'monthly', priority: 0.3 }),
    url('/llms-full.txt', { changefreq: 'monthly', priority: 0.3 }),
  ];
  return entries.filter((entry) => !EXCLUDE_PATTERN.test(new URL(entry.loc).pathname));
}

function renderXml(entries: SitemapEntry[]): string {
  const body = entries
    .map((entry) => {
      const lastmod = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : '';
      return `  <url>
    <loc>${entry.loc}</loc>${lastmod}
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority.toFixed(1)}</priority>
  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export const GET: APIRoute = () => {
  const body = renderXml(buildEntries());
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};