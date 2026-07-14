// /llms.txt — short LLM-readable summary of the Todo Huincha site.
// See https://llmstxt.org/ for the format spec.
import type { APIRoute } from 'astro';
import { buildLlmsTxt } from '../lib/seo/llms-txt.ts';
import { loadCompanyJson } from '../lib/seo/loadCompanyJson.ts';
import { loadMarcasPendingJson } from '../lib/seo/loadCompanyJson.ts';

export const GET: APIRoute = () => {
  const company = loadCompanyJson();
  const marcas = loadMarcasPendingJson();
  const sections = [
    {
      title: 'Empresa',
      summary: company.shortPitch,
      urls: [
        { name: 'Sobre nosotros', url: 'https://todohuincha.com/empresa/' },
        { name: 'Historia', url: 'https://todohuincha.com/empresa/historia/' },
        { name: 'Mision y vision', url: 'https://todohuincha.com/empresa/mision-vision/' },
      ],
    },
    {
      title: 'Sucursales',
      summary: 'Atencion comercial en Temuco, Constitucion y Puerto Montt.',
      urls: [
        { name: 'Listado de sucursales', url: 'https://todohuincha.com/sucursales/' },
        { name: 'Temuco', url: 'https://todohuincha.com/sucursales/temuco/' },
        { name: 'Constitucion', url: 'https://todohuincha.com/sucursales/constitucion/' },
        { name: 'Puerto Montt', url: 'https://todohuincha.com/sucursales/puerto-montt/' },
      ],
    },
  ];
  if (marcas.status === 'ready') {
    sections.push({
      title: 'Marcas',
      summary: 'Marcas representadas vigentes.',
      urls: [{ name: 'Marcas representadas', url: 'https://todohuincha.com/marcas/' }],
    });
  } else {
    sections.push({
      title: 'Marcas',
      summary: 'Marcas pendientes de aprobacion. Proximamente publicaremos la lista vigente.',
      urls: [{ name: 'Marcas (proximamente)', url: 'https://todohuincha.com/marcas/' }],
    });
  }
  sections.push({
    title: 'Contacto',
    summary: 'Cotizacion por producto, telefono, correo y WhatsApp.',
    urls: [
      { name: 'Formulario de contacto', url: 'https://todohuincha.com/contacto/' },
      { name: 'Catalogo de productos', url: 'https://todohuincha.com/catalogo' },
      { name: 'Maquinaria', url: 'https://todohuincha.com/maquinaria' },
    ],
  });
  const body = buildLlmsTxt({ brand: company.brandName, sections });
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};