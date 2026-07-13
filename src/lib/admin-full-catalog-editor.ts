import type { AdminRule, CatalogConfigLayout, CatalogSection, CoverPageSlot, PaletteItem, RuleAction } from './admin-types';
import { validateExpression } from './admin-rules-engine';
import { readCatalogGeneration, writeCatalogGeneration } from './admin-storage';

const OUTPUT_TYPE = 'full_catalog_pdf';
const DRAFT_STRING_LIMIT = 500;
const MAX_SECTIONS = 50;
const MAX_RULES = 30;

const SECTION_BLOCKS = new Set(['title', 'description', 'category_section', 'back_cover']);
const SECTION_TYPES = new Set(['fixed', 'variable']);
const RULE_BLOCKS = new Set(['denso', 'medio', 'compacto']);

export interface FullCatalogEditorPayload {
  cover: {
    id?: string;
    enabled: boolean;
    source: string;
    title?: string;
    subtitle?: string;
    year?: string;
    alignment?: string;
    height?: string;
    opacity?: string;
    background?: string;
    font_family?: string;
    render_mode?: string;
  };
  cover_pages?: FullCatalogEditorPayload['cover'][];
  sections: Array<{
    id: string;
    type: 'fixed' | 'variable';
    block: CatalogSection['block'];
    source?: string;
    enabled: boolean;
    title?: string;
    template_rule?: string;
    alignment?: string;
    height?: string;
    background?: string;
    opacity?: string;
    category_filter?: string;
    show_prices?: boolean;
    new_page?: boolean;
  }>;
  rules: Array<{
    id: string;
    label?: string;
    when: string;
    block: 'denso' | 'medio' | 'compacto';
    note?: string;
  }>;
}

export interface FullCatalogEditorState extends FullCatalogEditorPayload {}

export interface PayloadResult {
  ok: boolean;
  payload?: FullCatalogEditorPayload;
  errors: string[];
}

export function createFullCatalogSectionFromPalette(
  kind: PaletteItem['kind'],
  existingSections: Array<{ id?: string }> = [],
  idSeed = Date.now()
): FullCatalogEditorPayload['sections'][number] | null {
  const baseId = sectionIdBase(kind);
  if (!baseId) return null;

  const existingIds = new Set(existingSections.map((section) => section.id).filter((id): id is string => Boolean(id)));
  const id = createUniqueId(`${baseId}-${idSeed}`, existingIds);

  if (kind === 'category_section') {
    return {
      id,
      type: 'variable',
      block: 'category_section',
      source: 'categories[*]',
      enabled: true,
      title: 'Productos por categoría',
      alignment: 'left',
      height: 'auto',
      background: '',
      opacity: '100',
      category_filter: 'all',
      show_prices: true,
      new_page: true,
    };
  }

  const block = kind === 'section_title' || kind === 'section_separator' ? 'title' : kind === 'section_description' ? 'description' : 'back_cover';
  const title = kind === 'section_title'
    ? 'Título de sección'
    : kind === 'section_separator'
      ? 'Separador'
    : kind === 'section_description'
      ? 'Descripción de sección'
      : 'Texto legal y contacto';

  return {
    id,
    type: 'fixed',
    block,
    enabled: true,
    title,
    alignment: kind === 'section_separator' ? 'center' : 'left',
    height: kind === 'section_separator' ? '120' : 'auto',
    background: '',
    opacity: '100',
    show_prices: true,
    new_page: kind === 'section_title' || kind === 'section_separator',
  };
}

export function createDefaultFullCatalogEditorState(
  layout: CatalogConfigLayout | null | undefined,
  rules: AdminRule[] | null | undefined
): FullCatalogEditorState {
  const sourceCoverPages = layout?.cover_pages?.length ? layout.cover_pages : [{ id: 'front-cover', source: 'asset:cover_image', enabled: true }];
  const sections: CatalogSection[] = layout?.sections?.length
    ? layout.sections
    : [
        {
          id: 'catalog-title',
          type: 'fixed' as const,
          block: 'title' as const,
          data: { enabled: true, title: 'Catálogo completo Todo Huincha' },
        },
        {
          id: 'category-products',
          type: 'variable' as const,
          block: 'category_section' as const,
          source: 'categories[*]',
          data: { enabled: true, title: 'Productos por categoría' },
        },
        {
          id: 'back-cover',
          type: 'fixed' as const,
          block: 'back_cover' as const,
          data: { enabled: true, title: 'Contacto y cierre' },
        },
      ];

  return {
    cover: mapCoverSlotToEditorCover(sourceCoverPages[0], 0),
    cover_pages: sourceCoverPages.map(mapCoverSlotToEditorCover),
    sections: sections.map((section) => {
      const data = getRecord(section.data);
      return {
        id: section.id,
        type: section.type,
        block: section.block,
        source: section.source,
        enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
        title: readString(data.title, defaultSectionTitle(section)),
        template_rule: section.template_rule,
        alignment: readString(data.alignment, 'left'),
        height: readString(data.height, section.block === 'title' ? '120' : 'auto'),
        background: readString(data.background, ''),
        opacity: readString(data.opacity, '100'),
        category_filter: readString(data.category_filter, 'all'),
        show_prices: typeof data.show_prices === 'boolean' ? data.show_prices : true,
        new_page: typeof data.new_page === 'boolean' ? data.new_page : false,
      };
    }),
    rules: (rules ?? []).map((rule) => ({
      id: rule.id,
      label: readString((rule as { label?: unknown }).label, rule.id),
      when: rule.when,
      block: readRuleBlock(rule.then),
      note: rule.note,
    })),
  };
}

export function parseFullCatalogEditorPayload(input: unknown): PayloadResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['Payload must be an object.'] };

  const coverInput = input.cover;
  if (!isRecord(coverInput)) errors.push('cover must be an object.');

  const sectionsInput = input.sections;
  if (!Array.isArray(sectionsInput)) errors.push('sections must be an array.');
  if (Array.isArray(sectionsInput) && sectionsInput.length > MAX_SECTIONS) {
    errors.push(`sections cannot contain more than ${MAX_SECTIONS} items.`);
  }

  const rulesInput = input.rules;
  if (!Array.isArray(rulesInput)) errors.push('rules must be an array.');
  if (Array.isArray(rulesInput) && rulesInput.length > MAX_RULES) {
    errors.push(`rules cannot contain more than ${MAX_RULES} items.`);
  }

  if (errors.length) return { ok: false, errors };

  const cover = parseCover(coverInput as Record<string, unknown>, errors);
  const sections = (sectionsInput as unknown[]).map((section, index) => parseSection(section, index, errors)).filter(Boolean) as FullCatalogEditorPayload['sections'];
  const rules = (rulesInput as unknown[]).map((rule, index) => parseRule(rule, index, errors)).filter(Boolean) as FullCatalogEditorPayload['rules'];

  if (errors.length) return { ok: false, errors };
  const coverPages = Array.isArray(input.cover_pages)
    ? input.cover_pages.map((item, index) => parseCover(item as Record<string, unknown>, errors, index)).filter(Boolean)
    : undefined;

  if (errors.length) return { ok: false, errors };
  return { ok: true, payload: { cover, cover_pages: coverPages, sections, rules }, errors: [] };
}

export function buildFullCatalogOutputConfig(
  existingOutput: Record<string, unknown>,
  payload: FullCatalogEditorPayload
): Record<string, unknown> {
  const existingLayout = getRecord(existingOutput.layout);
  const existingCoverPages = Array.isArray(existingLayout.cover_pages) ? existingLayout.cover_pages : [];
  const existingSections = Array.isArray(existingLayout.sections) ? existingLayout.sections : [];
  const existingRules = Array.isArray(existingOutput.rules) ? existingOutput.rules : [];

  const payloadCoverPages = payload.cover_pages?.length ? payload.cover_pages : [payload.cover];
  const coverPages = payloadCoverPages.map((coverPayload, index): CoverPageSlot => {
    const existingCover = getRecord(existingCoverPages[index]);
    const existingData = getRecord(existingCover.data);

    return {
      ...existingCover,
      id: cleanId(coverPayload.id ?? existingCover.id ?? `cover-${index + 1}`),
      enabled: coverPayload.enabled,
      source: coverPayload.source,
      data: {
        ...existingData,
        title: coverPayload.title ?? '',
        subtitle: coverPayload.subtitle ?? '',
        year: coverPayload.year ?? '',
        alignment: coverPayload.alignment ?? 'left',
        height: coverPayload.height ?? '320',
        opacity: coverPayload.opacity ?? '100',
        background: coverPayload.background ?? '',
        font_family: coverPayload.font_family ?? 'system-ui',
        render_mode: coverPayload.render_mode ?? existingData.render_mode ?? 'standard',
      },
    };
  });

  const layout: CatalogConfigLayout = {
    ...existingLayout,
    cover_pages: coverPages,
    sections: payload.sections.map((section) => mergeSection(findById(existingSections, section.id), section)),
  };

  const rules: AdminRule[] = payload.rules.map((rule) => mergeRule(findById(existingRules, rule.id), rule));

  return { ...existingOutput, layout, rules };
}

export async function writeFullCatalogEditorPayload(payload: FullCatalogEditorPayload) {
  const generation = ((await readCatalogGeneration()) ?? {}) as Record<string, unknown>;
  const outputTypes = getRecord(generation.output_types);
  const existingOutput = getRecord(outputTypes[OUTPUT_TYPE]);
  const updatedOutput = buildFullCatalogOutputConfig(existingOutput, payload);

  return await writeCatalogGeneration({
    ...generation,
    output_types: {
      ...outputTypes,
      [OUTPUT_TYPE]: updatedOutput,
    },
  });
}

function parseCover(input: Record<string, unknown>, errors: string[], index: number | null = null): FullCatalogEditorPayload['cover'] {
  const enabled = input.enabled;
  const source = cleanText(input.source);
  const path = index === null ? 'cover' : `cover_pages[${index}]`;
  if (typeof enabled !== 'boolean') errors.push(`${path}.enabled must be a boolean.`);
  if (!source) errors.push(`${path}.source is required.`);

  return {
    id: cleanText(input.id) || 'front-cover',
    enabled: enabled === true,
      source,
      title: cleanText(input.title),
      subtitle: cleanText(input.subtitle),
      year: cleanText(input.year),
      alignment: cleanText(input.alignment),
      height: cleanText(input.height),
      opacity: cleanText(input.opacity),
      background: cleanText(input.background),
      font_family: cleanText(input.font_family),
      render_mode: cleanText(input.render_mode),
  };
}

function mapCoverSlotToEditorCover(cover: CoverPageSlot | undefined, index: number): FullCatalogEditorPayload['cover'] {
  const coverData = getRecord(cover?.data);
  return {
    id: cover?.id ?? `cover-${index + 1}`,
    enabled: cover?.enabled ?? true,
    source: cover?.source ?? 'asset:cover_image',
    title: readString(coverData.title, index === 0 ? 'Catálogo Todo Huincha' : ''),
    subtitle: readString(coverData.subtitle, index === 0 ? 'Maquinaria, servicios y productos' : ''),
    year: readString(coverData.year, index === 0 ? String(new Date().getFullYear()) : ''),
    alignment: readString(coverData.alignment, 'left'),
    height: readString(coverData.height, '320'),
    opacity: readString(coverData.opacity, '100'),
    background: readString(coverData.background, ''),
    font_family: readString(coverData.font_family, 'system-ui'),
    render_mode: readString(coverData.render_mode, 'standard'),
  };
}

function parseSection(input: unknown, index: number, errors: string[]): FullCatalogEditorPayload['sections'][number] | null {
  if (!isRecord(input)) {
    errors.push(`sections[${index}] must be an object.`);
    return null;
  }

  const id = cleanId(input.id);
  const type = cleanText(input.type);
  const block = cleanText(input.block);
  const enabled = input.enabled;

  if (!id) errors.push(`sections[${index}].id is required.`);
  if (!SECTION_TYPES.has(type)) errors.push(`sections[${index}].type is invalid.`);
  if (!SECTION_BLOCKS.has(block)) errors.push(`sections[${index}].block is invalid.`);
  if (typeof enabled !== 'boolean') errors.push(`sections[${index}].enabled must be a boolean.`);

  return {
    id,
    type: type as 'fixed' | 'variable',
    block: block as CatalogSection['block'],
    source: cleanText(input.source),
    enabled: enabled === true,
    title: cleanText(input.title),
    template_rule: cleanText(input.template_rule),
    alignment: cleanText(input.alignment),
    height: cleanText(input.height),
    background: cleanText(input.background),
    opacity: cleanText(input.opacity),
    category_filter: cleanText(input.category_filter),
    show_prices: typeof input.show_prices === 'boolean' ? input.show_prices : true,
    new_page: typeof input.new_page === 'boolean' ? input.new_page : false,
  };
}

function parseRule(input: unknown, index: number, errors: string[]): FullCatalogEditorPayload['rules'][number] | null {
  if (!isRecord(input)) {
    errors.push(`rules[${index}] must be an object.`);
    return null;
  }

  const id = cleanId(input.id);
  const when = cleanText(input.when);
  const block = cleanText(input.block);
  if (!id) errors.push(`rules[${index}].id is required.`);
  if (!when) errors.push(`rules[${index}].when is required.`);
  if (when) {
    const expressionError = validateExpression(when);
    if (expressionError) errors.push(`rules[${index}].when: ${expressionError}`);
  }
  if (!RULE_BLOCKS.has(block)) errors.push(`rules[${index}].block is invalid.`);

  return {
    id,
    label: cleanText(input.label),
    when,
    block: block as 'denso' | 'medio' | 'compacto',
    note: cleanText(input.note),
  };
}

function defaultSectionTitle(section: CatalogSection): string {
  if (section.block === 'title') return 'Título de sección';
  if (section.block === 'description') return 'Descripción';
  if (section.block === 'category_section') return 'Productos por categoría';
  return 'Contraportada';
}

function readRuleBlock(action: RuleAction): 'denso' | 'medio' | 'compacto' {
  if ('block' in action && RULE_BLOCKS.has(action.block)) return action.block;
  return 'medio';
}

function mergeSection(existingSection: Record<string, unknown>, section: FullCatalogEditorPayload['sections'][number]): CatalogSection {
  const existingData = getRecord(existingSection.data);
  const merged: Record<string, unknown> = {
    ...existingSection,
    id: section.id,
    type: section.type,
    block: section.block,
    data: {
      ...existingData,
      enabled: section.enabled,
      title: section.title ?? '',
      alignment: section.alignment ?? 'left',
      height: section.height ?? 'auto',
      background: section.background ?? '',
      opacity: section.opacity ?? '100',
      category_filter: section.category_filter ?? 'all',
      show_prices: section.show_prices ?? true,
      new_page: section.new_page ?? false,
    },
  };

  if (section.source !== undefined) merged.source = section.source;
  if (section.template_rule !== undefined) merged.template_rule = section.template_rule;

  return merged as unknown as CatalogSection;
}

function mergeRule(existingRule: Record<string, unknown>, rule: FullCatalogEditorPayload['rules'][number]): AdminRule {
  const existingThen = getRecord(existingRule.then);
  return {
    ...existingRule,
    id: rule.id,
    label: rule.label,
    when: rule.when,
    then: { ...existingThen, block: rule.block },
    note: rule.note,
  } as unknown as AdminRule;
}

function findById(items: unknown[], id: string): Record<string, unknown> {
  return items.find((item) => getRecord(item).id === id) as Record<string, unknown> | undefined ?? {};
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, DRAFT_STRING_LIMIT);
}

function cleanId(value: unknown): string {
  return cleanText(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function sectionIdBase(kind: PaletteItem['kind']): string | null {
  if (kind === 'cover_page') return null;
  if (kind === 'section_title') return 'section-title';
  if (kind === 'section_separator') return 'section-separator';
  if (kind === 'section_description') return 'section-description';
  if (kind === 'category_section') return 'category-products';
  return 'legal-text';
}

function createUniqueId(baseId: string, existingIds: Set<string>): string {
  const cleanBase = cleanId(baseId) || 'section';
  if (!existingIds.has(cleanBase)) return cleanBase;

  let suffix = 2;
  while (existingIds.has(`${cleanBase}-${suffix}`)) suffix += 1;
  return `${cleanBase}-${suffix}`;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
