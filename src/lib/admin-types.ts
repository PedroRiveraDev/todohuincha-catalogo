// src/lib/admin-types.ts
// Shared types for the admin module. Kept in a separate file so the
// rules engine, storage, and components can all import without circular
// dependencies.

export type OutputTypeKey =
  | 'full_catalog_pdf'
  | 'machinery_technical_sheet_pdf'
  | 'service_sheet_pdf'
  | 'simple_product_card_pdf'
  | 'category_catalog_pdf';

export const ALL_OUTPUT_TYPES: OutputTypeKey[] = [
  'full_catalog_pdf',
  'machinery_technical_sheet_pdf',
  'service_sheet_pdf',
  'simple_product_card_pdf',
  'category_catalog_pdf',
];

export interface CoverPageSlot {
  id: string;
  source: string; // e.g. "asset:cover_image_1" or a path
  enabled: boolean;
  data?: Record<string, unknown>;
}

export type SectionBlock =
  | 'title'
  | 'description'
  | 'category_section'
  | 'back_cover';

export type SectionType = 'fixed' | 'variable';

export interface CatalogSection {
  id: string;
  type: SectionType;
  block: SectionBlock;
  source?: string; // for variable sections, e.g. "categories[*]"
  data?: Record<string, unknown>;
  template_rule?: string; // rule id from rules[] that decides the template
}

export interface CatalogConfigLayout {
  cover_pages?: CoverPageSlot[];
  sections?: CatalogSection[];
}

// ---------------------------------------------------------------------------
// Rules DSL
// ---------------------------------------------------------------------------

export type RuleAction =
  | { block: 'denso' | 'medio' | 'compacto' }
  | { show_badge: string }
  | { hide: true }
  | { set_field: Record<string, unknown> };

export interface AdminRule {
  id: string;
  /** JavaScript-like expression evaluated per item with `item` as context */
  when: string;
  then: RuleAction;
  /** Optional editor-facing label */
  label?: string;
  /** Optional human-readable note */
  note?: string;
}

// ---------------------------------------------------------------------------
// Data field tokens (inserted into text elements)
// ---------------------------------------------------------------------------

export interface DataFieldDef {
  token: string;
  label: string;
  description: string;
  /** Path inside the item object (e.g. "item.pricing.sale_amount") */
  path: string;
  /** Optional formatter: 'clp' shows currency with thousand separators */
  format?: 'clp' | 'date' | 'text' | 'bullet';
}

export const DATA_FIELDS: DataFieldDef[] = [
  { token: '{{item.sku}}', label: 'SKU', description: 'Codigo del producto', path: 'item.sku' },
  { token: '{{item.display_name}}', label: 'Nombre', description: 'Nombre mostrado del producto', path: 'item.display_name' },
  { token: '{{item.category_label}}', label: 'Categoria', description: 'Etiqueta de la categoria', path: 'item.category_label' },
  { token: '{{item.pricing.sale_amount}}', label: 'Precio', description: 'Precio formateado como CLP', path: 'item.pricing.sale_amount', format: 'clp' },
  { token: '{{item.pricing.formatted}}', label: 'Precio (formato original)', description: 'String formateado tal como viene del JSON', path: 'item.pricing.formatted' },
  { token: '{{item.machinery_profile.brand}}', label: 'Marca', description: 'Marca de la maquinaria', path: 'item.machinery_profile.brand' },
  { token: '{{item.machinery_profile.model}}', label: 'Modelo', description: 'Modelo de la maquinaria', path: 'item.machinery_profile.model' },
  { token: '{{item.machinery_profile.features | bullet}}', label: 'Caracteristicas', description: 'Lista de features como bullets', path: 'item.machinery_profile.features', format: 'bullet' },
  { token: '{{count}}', label: 'Contador', description: 'Numero de fila dentro de la iteracion', path: 'count' },
  { token: '{{now}}', label: 'Fecha actual', description: 'Fecha de generacion del PDF', path: 'now' },
];

// ---------------------------------------------------------------------------
// Palette (drag source) - elements that can be inserted into the canvas
// ---------------------------------------------------------------------------

export type PaletteItem =
  | { kind: 'cover_page'; label: 'Portada'; icon: 'image' }
  | { kind: 'section_title'; label: 'Titulo'; icon: 'text' }
  | { kind: 'section_separator'; label: 'Separador'; icon: 'text' }
  | { kind: 'section_description'; label: 'Texto'; icon: 'text' }
  | { kind: 'category_section'; label: 'Tabla/Grid Productos'; icon: 'list' }
  | { kind: 'legal_text'; label: 'Texto Legal'; icon: 'text' };

export const PALETTE: PaletteItem[] = [
  { kind: 'cover_page', label: 'Portada', icon: 'image' },
  { kind: 'section_title', label: 'Titulo', icon: 'text' },
  { kind: 'section_separator', label: 'Separador', icon: 'text' },
  { kind: 'section_description', label: 'Texto', icon: 'text' },
  { kind: 'category_section', label: 'Tabla/Grid Productos', icon: 'list' },
  { kind: 'legal_text', label: 'Texto Legal', icon: 'text' },
];
