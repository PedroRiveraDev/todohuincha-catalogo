// src/lib/pdf-types.ts
// Per-type template dispatcher. Pure routing helpers that split items into
// machinery / compact row / service card sub-renderers downstream.
//
// Slice pdf-catalog-v2.
// Refs:
//   openspec/changes/pdf-catalog-v2/spec.md (Requirement: per-type template dispatcher)
//   openspec/changes/pdf-catalog-v2/design.md (sections 2.2, 4.4)

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PdfItemKind = 'machinery' | 'compact_row' | 'service_card';

/** Loose catalog item shape: only the fields the dispatcher reads. */
export interface PdfItemLike {
  item_type?: string;
  machinery_profile?: unknown;
  service_profile?: unknown;
  specifications?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isMachinerySheet(item: PdfItemLike): boolean {
  return item?.item_type === 'machinery';
}

export function isCompactRow(item: PdfItemLike): boolean {
  return (
    item?.item_type === 'simple_product' || item?.item_type === 'spare_part'
  );
}

export function isServiceCard(item: PdfItemLike): boolean {
  return item?.item_type === 'service';
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Routes an item to one of three sub-renderers by `item.item_type`.
 *
 * - `machinery` -> `renderMachinerySheet` (full technical sheet)
 * - `simple_product` / `spare_part` -> `renderCompactRow`
 * - `service` -> `renderServiceCard`
 *
 * Defensive: missing/unknown `item_type` falls back to `compact_row`
 * (the safe default — same flat-row layout used in the legacy
 * PdfDownloadButton). `null` / `undefined` items throw because the
 * caller has a broken invariant and silent fallback would mask bugs.
 */
export function dispatchItemKind(item: PdfItemLike | null | undefined): PdfItemKind {
  if (item === null || item === undefined) {
    throw new Error('dispatchItemKind: item is required');
  }
  switch (item.item_type) {
    case 'machinery':
      return 'machinery';
    case 'service':
      return 'service_card';
    case 'simple_product':
    case 'spare_part':
      return 'compact_row';
    default:
      // Unknown / missing item_type: route to compact_row so the legacy
      // flat table still renders. This matches the slice 2 behaviour.
      return 'compact_row';
  }
}