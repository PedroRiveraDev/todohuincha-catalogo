// Domain types for the institutional content store.
// Plain TS — no Zod. Runtime validation lives in ./validate.ts.

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Address {
  street: string;
  locality: string;
  region: string;
  country: 'CL';
  geo: GeoPoint;
}

export interface Socials {
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  whatsapp?: string;
}

export interface Company {
  legalName: string;
  brandName: string;
  taxId: string;
  phones: string[];
  emails: string[];
  socials: Socials;
  address: Address;
  mission: string;
  vision: string;
  shortPitch: string;
  founders: string[];
  mapUrl: string;
  url: string;
  logo: string;
}

export interface Branch {
  slug: string;
  name: string;
  city: string;
  region: string;
  address: Address;
  phone: string;
  hours: string;
  mapUrl: string;
  isHeadquarters: boolean;
}

export interface TimelineMilestone {
  year: number;
  event: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
}

export interface TeamMember {
  name: string;
  role: string;
  responsibilities: string[];
  sameAs?: string[];
}

export interface Brand {
  name: string;
  logo: string;
  alt: string;
  url?: string;
}

export interface BrandFile {
  status: 'pending' | 'ready';
  brands: Brand[];
}

export type ValidationResult = { ok: boolean; errors: string[] };

// Single source of truth for the regions the catalog actually serves.
export const ALLOWED_REGIONS: readonly string[] = ['Araucanía', 'Maule', 'Los Lagos'] as const;

// Chilean display phone pattern: +56 (XX) XXX XXXX  (also tolerates leading 0 area code).
export const PHONE_PATTERN: RegExp = /^\+56\s\(\d{1,2}\)\s\d{3}\s\d{4}$/;