// Thin wrapper that validates company.json and returns it typed.
// Pages import this instead of company.json directly so a bad edit fails the build loudly.

import companyJson from '../../content/institutional/company.json';
import branchesJson from '../../content/institutional/branches.json';
import timelineJson from '../../content/institutional/timeline.json';
import servicesJson from '../../content/institutional/services.json';
import teamJson from '../../content/institutional/team.json';
import marcasPendingJson from '../../content/institutional/marcas-pending.json';
import {
  validateCompany,
  validateBranches,
  validateTimeline,
  validateBrandFile,
} from '../../content/institutional/validate.ts';
import type {
  BrandFile,
  Branch,
  Company,
  Service,
  TeamMember,
  TimelineMilestone,
} from '../../content/institutional/types.ts';

function freeze<T>(value: T): T {
  return Object.freeze(value) as T;
}

let companyCache: Company | undefined;
let branchesCache: Branch[] | undefined;
let timelineCache: TimelineMilestone[] | undefined;
let servicesCache: Service[] | undefined;
let teamCache: TeamMember[] | undefined;
let brandsCache: BrandFile | undefined;

export function loadCompanyJson(): Company {
  if (companyCache) return companyCache;
  const result = validateCompany(companyJson);
  if (!result.ok) {
    throw new Error(`Invalid company.json: ${result.errors.join('; ')}`);
  }
  companyCache = freeze(companyJson as Company);
  return companyCache;
}

export function loadBranchesJson(): Branch[] {
  if (branchesCache) return branchesCache;
  const result = validateBranches(branchesJson);
  if (!result.ok) {
    throw new Error(`Invalid branches.json: ${result.errors.join('; ')}`);
  }
  branchesCache = freeze(branchesJson as Branch[]);
  return branchesCache;
}

export function loadTimelineJson(): TimelineMilestone[] {
  if (timelineCache) return timelineCache;
  const result = validateTimeline(timelineJson);
  if (!result.ok) {
    throw new Error(`Invalid timeline.json: ${result.errors.join('; ')}`);
  }
  timelineCache = freeze(timelineJson as TimelineMilestone[]);
  return timelineCache;
}

export function loadServicesJson(): Service[] {
  if (servicesCache) return servicesCache;
  servicesCache = freeze(servicesJson as Service[]);
  return servicesCache;
}

export function loadTeamJson(): TeamMember[] {
  if (teamCache) return teamCache;
  teamCache = freeze(teamJson as TeamMember[]);
  return teamCache;
}

export function loadMarcasPendingJson(): BrandFile {
  if (brandsCache) return brandsCache;
  const result = validateBrandFile(marcasPendingJson);
  if (!result.ok) {
    throw new Error(`Invalid marcas-pending.json: ${result.errors.join('; ')}`);
  }
  if (marcasPendingJson.status === 'pending') {
    // eslint-disable-next-line no-console
    console.warn('[institutional] marcas-pending.json status is "pending" — /marcas renders the skeleton until the brand list is approved.');
  }
  brandsCache = freeze(marcasPendingJson as BrandFile);
  return brandsCache;
}