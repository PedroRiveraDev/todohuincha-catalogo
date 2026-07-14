// /llms-full.txt — long-form content dump for LLM ingestion.
import type { APIRoute } from 'astro';
import { buildLlmsFullTxt } from '../lib/seo/llms-txt.ts';
import {
  loadBranchesJson,
  loadCompanyJson,
  loadMarcasPendingJson,
} from '../lib/seo/loadCompanyJson.ts';

export const GET: APIRoute = () => {
  const company = loadCompanyJson();
  const branches = loadBranchesJson();
  const marcas = loadMarcasPendingJson();
  const body = buildLlmsFullTxt({
    brand: company.brandName,
    company: {
      brandName: company.brandName,
      legalName: company.legalName,
      mission: company.mission,
      vision: company.vision,
      phones: company.phones,
      emails: company.emails,
      address: company.address,
    },
    branches: branches.map((b) => ({
      name: b.name,
      city: b.city,
      region: b.region,
      phone: b.phone,
      hours: b.hours,
      address: b.address,
      mapUrl: b.mapUrl,
    })),
    brandsPending: marcas.status === 'pending',
  });
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};