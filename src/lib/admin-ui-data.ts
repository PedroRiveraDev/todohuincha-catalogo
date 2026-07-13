import catalogDocument from '../../docs/catalogo_productos_robusto_completo_corregido.json';
import { ALL_OUTPUT_TYPES, DATA_FIELDS, PALETTE } from './admin-types';
import type { AdminRule, CatalogConfigLayout, OutputTypeKey } from './admin-types';
import { adapter } from './catalog';

type CatalogDocument = typeof catalogDocument;
type SourceOutputConfig = {
  enabled?: boolean;
  template_key?: string;
  layout?: CatalogConfigLayout | null;
  rules?: AdminRule[];
  output_storage_key?: string;
  output_storage_key_pattern?: string;
  source?: string;
};

export interface AdminOutputSummary {
  key: OutputTypeKey;
  label: string;
  description: string;
  enabled: boolean;
  templateKey: string;
  layoutStatus: 'Configurado' | 'Pendiente';
  ruleCount: number;
}

export interface AdminCategorySummary {
  code: string;
  label: string;
  slug: string;
  group: string;
  productsCount: number;
  description: string;
  bannerUrl: string | null;
  backgroundUrl: string | null;
  bannerStatus: string;
}

export const catalog = catalogDocument as CatalogDocument;

export interface AdminCatalogMetrics {
  categories: number;
  products: number;
  families: number;
}

const outputLabels: Record<OutputTypeKey, { label: string; description: string }> = {
  full_catalog_pdf: {
    label: 'Catálogo completo',
    description: 'PDF principal con portada, secciones por categoría y contraportada.',
  },
  machinery_technical_sheet_pdf: {
    label: 'Ficha técnica de maquinaria',
    description: 'Salida individual para equipos con especificaciones y fotografías.',
  },
  service_sheet_pdf: {
    label: 'Ficha de servicio',
    description: 'Documento comercial para servicios de afilado, soldadura y mantención.',
  },
  simple_product_card_pdf: {
    label: 'Tarjeta de producto simple',
    description: 'Ficha breve para productos sin ficha técnica extendida.',
  },
  category_catalog_pdf: {
    label: 'Sección por categoría',
    description: 'PDF acotado a una categoría o familia específica.',
  },
};

const outputFallbacks: Record<OutputTypeKey, { templateKey: string; enabled: boolean }> = {
  full_catalog_pdf: { templateKey: 'generated/catalog/catalogo-completo.pdf', enabled: true },
  machinery_technical_sheet_pdf: { templateKey: 'generated/catalog/machinery/{sku}/ficha-tecnica.pdf', enabled: true },
  service_sheet_pdf: { templateKey: 'generated/catalog/services/{service_code}/ficha-servicio.pdf', enabled: true },
  simple_product_card_pdf: { templateKey: 'Derivado desde datos de producto', enabled: false },
  category_catalog_pdf: { templateKey: 'Derivado desde categoría', enabled: false },
};

function getTemplateKey(output: SourceOutputConfig, fallback: string) {
  return output.template_key ?? output.output_storage_key ?? output.output_storage_key_pattern ?? output.source ?? fallback;
}

function getOutputConfig(key: OutputTypeKey): SourceOutputConfig {
  const outputTypes = catalog.catalog_generation.output_types as Record<string, SourceOutputConfig | undefined>;

  return outputTypes[key] ?? {};
}

export function getCatalogMetrics(): AdminCatalogMetrics {
  return {
    categories: adapter.categories.length,
    products: adapter.items.length,
    families: adapter.families.length,
  };
}

export function getRawCatalogMetrics(): AdminCatalogMetrics {
  return catalog.catalog.totals;
}

export function getOutputSummaries(): AdminOutputSummary[] {
  return ALL_OUTPUT_TYPES.map((key) => {
    const output = getOutputConfig(key);
    const fallback = outputFallbacks[key];
    const layout = output.layout;
    const rules = output.rules ?? [];

    return {
      key,
      label: outputLabels[key].label,
      description: outputLabels[key].description,
      enabled: output.enabled ?? fallback.enabled,
      templateKey: getTemplateKey(output, fallback.templateKey),
      layoutStatus: layout ? 'Configurado' : 'Pendiente',
      ruleCount: rules.length,
    };
  });
}

export function getFullCatalogLayout(): CatalogConfigLayout {
  return getOutputConfig('full_catalog_pdf').layout ?? {};
}

export function getFullCatalogRules(): AdminRule[] {
  return getOutputConfig('full_catalog_pdf').rules ?? [];
}

export function getCategorySummaries(): AdminCategorySummary[] {
  const categories = catalog.dictionaries.category_dictionary as Record<string, any>;

  return adapter.categories.map((category) => ({
    code: category.code,
    label: category.label,
    slug: category.slug,
    group: category.group,
    productsCount: category.products_count,
    description: categories[category.code]?.description ?? 'Sin descripción disponible.',
    bannerUrl: categories[category.code]?.assets?.banner?.url ?? null,
    backgroundUrl: categories[category.code]?.assets?.background?.url ?? null,
    bannerStatus: categories[category.code]?.assets?.banner?.source_status ?? 'sin_estado',
  }));
}

export function getRawCategorySummaries(): AdminCategorySummary[] {
  const categories = catalog.dictionaries.category_dictionary as Record<string, any>;

  return Object.entries(categories).map(([code, category]) => ({
    code,
    label: category.label,
    slug: category.slug,
    group: category.group,
    productsCount: category.products_count,
    description: category.description ?? 'Sin descripción disponible.',
    bannerUrl: category.assets?.banner?.url ?? null,
    backgroundUrl: category.assets?.background?.url ?? null,
    bannerStatus: category.assets?.banner?.source_status ?? 'sin_estado',
  }));
}

export function getEditorPalette() {
  return PALETTE;
}

export function getEditorDataFields() {
  return DATA_FIELDS;
}
