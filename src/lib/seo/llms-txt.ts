// llms.txt builders.
// Format: https://llmstxt.org/ — Markdown document with brand heading, summary,
// and per-section URL lists. We produce both the short (buildLlmsTxt) and full
// (buildLlmsFullTxt) variants from the same data source.

export interface LlmsSection {
  title: string;
  summary: string;
  urls: Array<{ name: string; url: string }>;
}

export interface LlmsTxtInput {
  brand: string;
  sections: LlmsSection[];
}

export interface LlmsFullInput {
  brand: string;
  company: {
    brandName: string;
    legalName: string;
    mission: string;
    vision: string;
    phones: string[];
    emails: string[];
    address: { street: string; locality: string; region: string };
  };
  branches: Array<{
    name: string;
    city: string;
    region: string;
    phone: string;
    hours: string;
    address: { street: string; locality: string; region: string };
    mapUrl: string;
  }>;
  brandsPending: boolean;
}

export function buildLlmsTxt(input: LlmsTxtInput): string {
  const lines: string[] = [];
  lines.push(`# ${input.brand}`);
  lines.push('');
  lines.push(
    '> Comercializadora Todo Huincha Ltda. provee maquinaria, consumibles y servicio tecnico para industria, agricultura y faenas forestales en Chile.',
  );
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  for (const section of input.sections) {
    lines.push(`- ${section.title}: ${section.summary}`);
  }
  lines.push('');
  for (const section of input.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(section.summary);
    lines.push('');
    for (const entry of section.urls) {
      lines.push(`- [${entry.name}](${entry.url})`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

export function buildLlmsFullTxt(input: LlmsFullInput): string {
  const lines: string[] = [];
  lines.push(`# ${input.brand} (full)`);
  lines.push('');
  lines.push(`Razon social: ${input.company.legalName}`);
  lines.push('');
  lines.push('## Mision');
  lines.push('');
  lines.push(input.company.mission);
  lines.push('');
  lines.push('## Vision');
  lines.push('');
  lines.push(input.company.vision);
  lines.push('');
  lines.push('## Sucursales');
  lines.push('');
  for (const branch of input.branches) {
    lines.push(`### ${branch.name}`);
    lines.push('');
    lines.push(`- Ciudad: ${branch.city}, ${branch.region}`);
    lines.push(`- Direccion: ${branch.address.street}, ${branch.address.locality}`);
    lines.push(`- Telefono: ${branch.phone}`);
    lines.push(`- Horario: ${branch.hours}`);
    lines.push(`- Mapa: ${branch.mapUrl}`);
    lines.push('');
  }
  if (!input.brandsPending) {
    lines.push('## Marcas');
    lines.push('');
    lines.push('(Marcas representadas — agregado cuando el listado sea aprobado.)');
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}