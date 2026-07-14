// Pure JSON-LD builders for the institutional authority layer.
// Every builder returns a plain object ready for JSON.stringify into a
// <script type="application/ld+json"> block. The builders do not import any
// Astro runtime, so they are unit-testable from Node directly.

import type { Branch, Company, Service, TeamMember } from '../../content/institutional/types.ts';
import {
  ORG_ID,
  SCHEMA_CONTEXT,
  SITE_ID,
  SITE_LANG,
  SITE_URL,
  buildId,
  stableStringify,
} from './schema-org-ids.ts';
import { guardDepth, jsonLdCache } from './cache.ts';

export { ORG_ID, SITE_ID };

export interface OrgNode {
  '@context': string;
  '@type': string;
  '@id': string;
  name: string;
  legalName?: string;
  url: string;
  logo: string;
  email?: string;
  telephone?: string;
  address?: object;
  founder?: Array<{ '@type': string; name: string }>;
  sameAs?: string[];
  knowsAbout?: Array<{ '@type': string; name: string; description?: string }>;
  member?: Array<{ '@type': string; name: string; jobTitle?: string }>;
  areaServed?: Array<{ '@type': string; name: string }>;
  department?: Array<{ '@id': string; '@type': string; name: string; address?: object; telephone?: string }>;
}

export interface WebSiteNode {
  '@context': string;
  '@type': string;
  '@id': string;
  url: string;
  name: string;
  inLanguage: string;
  publisher: { '@id': string };
  potentialAction?: object;
}

export interface WebPageNode {
  '@context': string;
  '@type': string;
  '@id': string;
  url: string;
  name: string;
  description: string;
  inLanguage: string;
  isPartOf: { '@id': string };
  breadcrumb: { '@id': string };
}

export interface BreadcrumbNode {
  '@context': string;
  '@type': string;
  itemListElement: Array<{ '@type': string; position: number; name: string; item: string }>;
}

export interface LocalBusinessNode {
  '@context': string;
  '@type': string;
  '@id': string;
  name: string;
  url: string;
  telephone: string;
  address: object;
  openingHours?: string;
  parentOrganization: { '@id': string };
  areaServed?: string;
  hasMap?: string;
  geo?: { '@type': string; latitude: number; longitude: number };
}

function sanitizeUrl(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function buildAreaServed(branches: Branch[]): Array<{ '@type': string; name: string }> {
  const seen = new Set<string>();
  const out: Array<{ '@type': string; name: string }> = [];
  for (const branch of branches) {
    const key = `${branch.address.locality}|${branch.address.region}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ '@type': 'City', name: `${branch.address.locality}, ${branch.address.region}` });
  }
  return out;
}

function buildDepartmentNodes(_company: Company, branches: Branch[]): OrgNode['department'] {
  return branches.map((branch) => ({
    '@id': buildId('branch', branch.slug),
    '@type': 'LocalBusiness',
    name: branch.name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: branch.address.street,
      addressLocality: branch.address.locality,
      addressRegion: branch.address.region,
      addressCountry: branch.address.country,
    },
    telephone: branch.phone,
  }));
}

export function buildOrganization(input: {
  company: Company;
  branches: Branch[];
  services: Service[];
  team: TeamMember[];
}): OrgNode {
  const { company, branches, services, team } = input;
  guardDepth(0, 'Organization');

  const snapshot = stableStringify({ company, branches, services, team });
  return jsonLdCache<OrgNode>(snapshot, () => {
    const sameAs = Object.values(company.socials).filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    const node: OrgNode = {
      '@context': SCHEMA_CONTEXT,
      '@type': 'Organization',
      '@id': ORG_ID,
      name: company.brandName,
      legalName: company.legalName,
      url: sanitizeUrl(company.url),
      logo: company.logo,
      email: company.emails[0],
      telephone: company.phones[0],
      address: {
        '@type': 'PostalAddress',
        streetAddress: company.address.street,
        addressLocality: company.address.locality,
        addressRegion: company.address.region,
        addressCountry: company.address.country,
      },
      founder: company.founders.map((name) => ({ '@type': 'Person', name })),
      sameAs: sameAs.length > 0 ? sameAs : undefined,
      knowsAbout: services.map((s) => ({
        '@type': 'Service',
        name: s.name,
        description: s.description,
      })),
      member: team.map((m) => ({ '@type': 'Person', name: m.name, jobTitle: m.role })),
      areaServed: buildAreaServed(branches),
      department: buildDepartmentNodes(company, branches),
    };
    return node;
  });
}

export function buildWebSite(input: { company: Company; url: string }): WebSiteNode {
  const { company, url } = input;
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: sanitizeUrl(url),
    name: company.brandName,
    inLanguage: SITE_LANG,
    publisher: { '@id': ORG_ID },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${sanitizeUrl(url)}catalogo/?q={search_term}`,
      'query-input': 'required name=search_term',
    },
  };
}

export function buildWebPage(input: {
  url: string;
  name: string;
  description: string;
  inLanguage: typeof SITE_LANG;
  isPartOf: 'SITE';
  breadcrumb: string;
}): WebPageNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebPage',
    '@id': buildId('page', input.url),
    url: sanitizeUrl(input.url),
    name: input.name,
    description: input.description,
    inLanguage: input.inLanguage,
    isPartOf: { '@id': SITE_ID },
    breadcrumb: { '@id': input.breadcrumb },
  };
}

export function buildBreadcrumbList(input: {
  items: Array<{ name: string; item: string }>;
}): BreadcrumbNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: input.items.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: sanitizeUrl(entry.item),
    })),
  };
}

export function buildLocalBusiness(input: {
  branch: Branch;
  company: Company;
}): LocalBusinessNode {
  const { branch } = input;
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'LocalBusiness',
    '@id': buildId('branch', branch.slug),
    name: branch.name,
    url: `${SITE_URL}/sucursales/${branch.slug}/`,
    telephone: branch.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: branch.address.street,
      addressLocality: branch.address.locality,
      addressRegion: branch.address.region,
      addressCountry: branch.address.country,
    },
    openingHours: branch.hours,
    parentOrganization: { '@id': ORG_ID },
    areaServed: `${branch.address.locality}, ${branch.address.region}`,
    hasMap: branch.mapUrl,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: branch.address.geo.lat,
      longitude: branch.address.geo.lng,
    },
  };
}