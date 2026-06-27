// src/lib/pdf-options.ts
// Pure types and serialization helpers for the catalog PDF options popup.
//
// The dialog writes the user's choice (modo + 3 toggles + selectedSlugs +
// savedAt) to localStorage under `cat:pdf:options`. On the next visit,
// PdfDownloadButton reads the same key, deserializes it, and either skips
// the dialog or pre-fills the form.
//
// Slice pdf-catalog-v2.
// Refs:
//   openspec/changes/pdf-catalog-v2/spec.md (Requirement: pdf options popup)
//   openspec/changes/pdf-catalog-v2/design.md (section 7)

// ---------------------------------------------------------------------------
// Storage key (spec-locked: do not rename)
// ---------------------------------------------------------------------------

/**
 * localStorage key for the catalog PDF options payload.
 * Spec section 7.1: exactly `cat:pdf:options`. Renaming this constant
 * requires updating the spec first.
 */
export const PDF_OPTIONS_STORAGE_KEY = 'cat:pdf:options';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PdfModo = 'completo' | 'compacto';

export interface PdfOptions {
  modo: PdfModo;
  incluirPortada: boolean;
  incluirContraportada: boolean;
  incluirQrPorCategoria: boolean;
  /** Sidebar selection snapshot for QR deep-linking. */
  selectedSlugs: string[];
  /** ISO timestamp written on each save. */
  savedAt: string;
}

const MODO_VALUES: ReadonlyArray<PdfModo> = ['completo', 'compacto'];

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Default options used on first visit (no localStorage) and as the
 * fallback for invalid persisted payloads.
 */
export function defaultPdfOptions(): PdfOptions {
  return {
    modo: 'completo',
    incluirPortada: true,
    incluirContraportada: true,
    incluirQrPorCategoria: false,
    selectedSlugs: ['__all__'],
    savedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serialize a PdfOptions payload to a JSON string suitable for
 * localStorage. Order is stable for the audit-friendly round-trip test.
 */
export function serializePdfOptions(opts: PdfOptions): string {
  return JSON.stringify({
    modo: opts.modo,
    incluirPortada: Boolean(opts.incluirPortada),
    incluirContraportada: Boolean(opts.incluirContraportada),
    incluirQrPorCategoria: Boolean(opts.incluirQrPorCategoria),
    selectedSlugs: Array.isArray(opts.selectedSlugs) ? opts.selectedSlugs : ['__all__'],
    savedAt: opts.savedAt ?? new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Deserialization (defensive)
// ---------------------------------------------------------------------------

function isPdfModo(v: unknown): v is PdfModo {
  return typeof v === 'string' && (MODO_VALUES as ReadonlyArray<string>).includes(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

/**
 * Parse a localStorage payload (or already-parsed object) into a
 * validated PdfOptions shape.
 *
 * - null / undefined / empty / invalid JSON -> defaults
 * - invalid `modo` -> defaults (spec scenario "rejects invalid persisted
 *   mode and falls back to defaults")
 * - bool coercion: anything not exactly `true` becomes `false`
 * - extra keys are ignored (forward-compat)
 */
export function deserializePdfOptions(raw: string | null | undefined | object): PdfOptions {
  const defaults = defaultPdfOptions();

  if (raw === null || raw === undefined || raw === '') return defaults;
  if (typeof raw !== 'string') {
    // Caller passed a parsed object directly (e.g. data-* attribute
    // already consumed by the dialog). Re-serialize and recurse.
    return deserializePdfOptions(JSON.stringify(raw));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }

  if (!parsed || typeof parsed !== 'object') return defaults;
  const obj = parsed as Record<string, unknown>;

  // Spec-locked: invalid `modo` is a hard fall-back, not a silent default.
  if (!isPdfModo(obj.modo)) return defaults;

  return {
    modo: obj.modo,
    // Bool coercion per design section 7.2: `Boolean(...)` so any
    // truthy value (true, 1, "true", "on", "yes") becomes `true` and
    // any falsy value (false, 0, "", null, undefined) becomes `false`.
    // NB: HTML form serialization via FormData yields literal booleans
    // for checkbox states, so the round-trip is unaffected.
    incluirPortada: Boolean(obj.incluirPortada),
    incluirContraportada: Boolean(obj.incluirContraportada),
    incluirQrPorCategoria: Boolean(obj.incluirQrPorCategoria),
    selectedSlugs: isStringArray(obj.selectedSlugs) ? obj.selectedSlugs : ['__all__'],
    savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : defaults.savedAt,
  };
}