// Organization graph assembly. Combines Organization + WebSite into a single @graph
// payload that Base.astro emits exactly once per page. Page-level slices (WebPage,
// BreadcrumbList, LocalBusiness) are passed alongside and emitted separately to keep
// the contract clear: Base owns the global graph, pages own their slice.

import type { Company, Branch, Service, TeamMember } from '../../content/institutional/types.ts';
import { buildOrganization, buildWebSite, type OrgNode, type WebSiteNode } from './jsonld.ts';

export interface GraphInput {
  company: Company;
  branches: Branch[];
  services: Service[];
  team: TeamMember[];
  siteUrl: string;
}

export interface OrganizationGraph {
  '@context': string;
  '@graph': Array<OrgNode | WebSiteNode>;
}

export function buildOrganizationGraph(input: GraphInput): OrganizationGraph {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildOrganization(input),
      buildWebSite({ company: input.company, url: input.siteUrl }),
    ],
  };
}