import { adapter, type CategorySummary } from './catalog';
import type { FullCatalogEditorState } from './admin-full-catalog-editor';
import catalogDocument from '../../docs/catalogo_productos_robusto_completo_corregido.json';

export const ADMIN_PREVIEW_PRODUCT_ROWS_PER_PAGE = 20;
const CATEGORY_SECTION_CHROME_ROW_COST = 5;
const FIXED_SECTION_ROW_COST = 4;

export interface AdminPreviewProductRow {
  sku: string;
  displayName: string;
  categoryCode: string;
  categoryLabel: string;
  price: number;
  formattedPrice: string;
  itemType: string;
  density: string;
}

export interface AdminPreviewCategory {
  code: string;
  label: string;
  slug: string;
  group: string;
  description: string;
  bannerUrl: string;
  backgroundUrl: string;
  productsCount: number;
  products: AdminPreviewProductRow[];
}

export interface AdminPreviewCategoryDraft {
  code: string;
  description?: string | null;
  bannerUrl?: string | null;
  backgroundUrl?: string | null;
}

export interface AdminPreviewSectionChunk {
  id: string;
  block: string;
  title: string;
  alignment: string;
  background: string;
  opacity: string;
  showPrices: boolean;
  newPage: boolean;
  category?: AdminPreviewCategory;
  products: AdminPreviewProductRow[];
  continuation: boolean;
  totalProducts: number;
}

export interface AdminPreviewPage {
  number: number;
  kind: 'cover' | 'content';
  label: string;
  sections: AdminPreviewSectionChunk[];
  usedRows: number;
  coverIndex?: number;
}

export interface AdminPreviewData {
  cover: FullCatalogEditorState['cover'];
  coverPages: NonNullable<FullCatalogEditorState['cover_pages']>;
  categories: AdminPreviewCategory[];
  pages: AdminPreviewPage[];
  counts: {
    categoriesRendered: number;
    productRowsRendered: number;
    pages: number;
  };
}

export interface BuildAdminPreviewDataOptions {
  state: FullCatalogEditorState;
  categoryDrafts?: AdminPreviewCategoryDraft[] | null;
  categories?: AdminPreviewCategory[];
  rowsPerPage?: number;
}

export function getAdminPreviewCatalogCategories(
  categoryDrafts: AdminPreviewCategoryDraft[] | null = null
): AdminPreviewCategory[] {
  const draftByCode = new Map((categoryDrafts ?? []).map((draft) => [draft.code, draft]));
  return adapter.categories.map((category) => mapCategory(category, draftByCode.get(category.code)));
}

export function buildAdminPreviewData({
  state,
  categoryDrafts = null,
  categories = getAdminPreviewCatalogCategories(categoryDrafts),
  rowsPerPage = ADMIN_PREVIEW_PRODUCT_ROWS_PER_PAGE,
}: BuildAdminPreviewDataOptions): AdminPreviewData {
  const coverPages = state.cover_pages?.length ? state.cover_pages : [state.cover];
  const pages: AdminPreviewPage[] = coverPages.map((_, index) => ({ number: index + 1, kind: 'cover', label: `Portada ${index + 1}`, sections: [], usedRows: 0, coverIndex: index }));
  const renderedCategoryCodes = new Set<string>();
  let productRowsRendered = 0;
  let currentPage: AdminPreviewPage | null = null;

  const startContentPage = (label = 'Contenido'): AdminPreviewPage => {
    const page = { number: pages.length + 1, kind: 'content' as const, label, sections: [], usedRows: 0 };
    pages.push(page);
    currentPage = page;
    return page;
  };

  const ensurePage = (requiredRows: number, forceNew = false): AdminPreviewPage => {
    if (!currentPage || forceNew || currentPage.usedRows + requiredRows > rowsPerPage) {
      return startContentPage();
    }
    return currentPage;
  };

  const enabledSections = (state.sections ?? []).filter((section) => section.enabled !== false);
  for (const section of enabledSections) {
    if (section.block !== 'category_section') {
      const page = ensurePage(FIXED_SECTION_ROW_COST, section.new_page === true);
      page.sections.push({
        id: section.id,
        block: section.block,
        title: section.title || section.block,
        alignment: section.alignment || 'left',
        background: section.background || '',
        opacity: section.opacity || '100',
        showPrices: section.show_prices !== false,
        newPage: section.new_page === true,
        products: [],
        continuation: false,
        totalProducts: 0,
      });
      page.usedRows += FIXED_SECTION_ROW_COST;
      continue;
    }

    if (section.new_page === true || !currentPage) startContentPage('Productos');
    const selectedCategories = section.category_filter && section.category_filter !== 'all'
      ? categories.filter((category) => category.code === section.category_filter)
      : categories;

    for (const category of selectedCategories) {
      renderedCategoryCodes.add(category.code);
      const productRowsPerCategoryPage = Math.max(1, rowsPerPage - CATEGORY_SECTION_CHROME_ROW_COST);
      const chunks = chunkProducts(category.products, productRowsPerCategoryPage);
      if (!chunks.length) chunks.push([]);

      chunks.forEach((products, index) => {
        const requiredRows = CATEGORY_SECTION_CHROME_ROW_COST + Math.max(1, products.length);
        const page = ensurePage(requiredRows, index > 0);
        page.sections.push({
          id: section.id,
          block: section.block,
          title: section.title || 'Productos por categoría',
          alignment: section.alignment || 'left',
          background: section.background || category.backgroundUrl || '',
          opacity: section.opacity || '100',
          showPrices: section.show_prices !== false,
          newPage: section.new_page === true,
          category,
          products,
          continuation: index > 0,
          totalProducts: category.products.length,
        });
        page.usedRows += requiredRows;
        productRowsRendered += products.length;
      });
    }
  }

  if (pages.length === 1) startContentPage('Contenido vacío');

  return {
    cover: state.cover,
    coverPages,
    categories,
    pages,
    counts: {
      categoriesRendered: renderedCategoryCodes.size,
      productRowsRendered,
      pages: pages.length,
    },
  };
}

function mapCategory(category: CategorySummary, draft?: AdminPreviewCategoryDraft): AdminPreviewCategory {
  return {
    code: category.code,
    label: category.label,
    slug: category.slug,
    group: category.group,
    description: cleanDraftValue(draft?.description) ?? readCategoryDescription(category.code),
    bannerUrl: cleanDraftValue(draft?.bannerUrl) ?? readCategoryAsset(category.code, 'banner'),
    backgroundUrl: cleanDraftValue(draft?.backgroundUrl) ?? readCategoryAsset(category.code, 'background'),
    productsCount: category.items.length,
    products: category.items.map((item) => ({
      sku: item.sku,
      displayName: item.display_name,
      categoryCode: category.code,
      categoryLabel: category.label,
      price: item.pricing?.sale_amount ?? 0,
      formattedPrice: item.pricing?.formatted || formatClp(item.pricing?.sale_amount ?? 0),
      itemType: item.item_type,
      density: item.technical_profile_level,
    })),
  };
}

function chunkProducts(products: AdminPreviewProductRow[], size: number): AdminPreviewProductRow[][] {
  const chunks: AdminPreviewProductRow[][] = [];
  for (let index = 0; index < products.length; index += size) {
    chunks.push(products.slice(index, index + size));
  }
  return chunks;
}

function readCategoryDescription(code: string): string {
  const category = readDictionaryCategory(code);
  return readString(category.description, 'Sin descripción disponible.');
}

function readCategoryAsset(code: string, key: 'banner' | 'background'): string {
  const category = readDictionaryCategory(code);
  const assets = isRecord(category.assets) ? category.assets : {};
  const asset = isRecord(assets[key]) ? assets[key] : {};
  return readString(asset.url, '');
}

function readDictionaryCategory(code: string): Record<string, unknown> {
  const dictionaries: Record<string, unknown> = isRecord(catalogDocument.dictionaries) ? catalogDocument.dictionaries : {};
  const categories: Record<string, unknown> = isRecord(dictionaries.category_dictionary) ? dictionaries.category_dictionary : {};
  const category = categories[code];
  return isRecord(category) ? category : {};
}

function cleanDraftValue(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatClp(value: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
}
