// src/lib/whatsapp.ts
// Pure helpers for parsing PUBLIC_WHATSAPP_NUMBERS and building wa.me URLs.
// Consumed by src/components/WhatsAppCta.astro today and by slice 3/4
// product-detail and machinery-detail pages tomorrow.
//
// Slice 2 of catalog-v2-ui-migration.
// Refs:
//   openspec/changes/catalog-v2-ui-migration-slice-2/spec.md
//   openspec/changes/catalog-v2-ui-migration-slice-2/design.md (section 2)

// ---------------------------------------------------------------------------
// parseWhatsAppNumbers
// ---------------------------------------------------------------------------

/**
 * Parse a `PUBLIC_WHATSAPP_NUMBERS` env string into a key->number Record.
 *
 * Format: `<key>:<E.164>,<key>:<E.164>,...`
 * Malformed entries (no colon, empty key) are silently dropped. Empty or
 * undefined input returns an empty record.
 */
export function parseWhatsAppNumbers(env: string | undefined): Record<string, string> {
  if (!env || env.trim().length === 0) return {};

  const result: Record<string, string> = {};
  const tokens = env.split(',');
  for (const token of tokens) {
    const colonIdx = token.indexOf(':');
    if (colonIdx === -1) continue; // malformed, drop
    const key = token.slice(0, colonIdx).trim();
    const value = token.slice(colonIdx + 1).trim();
    if (key.length === 0) continue; // empty key, drop
    result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// buildWhatsAppUrl
// ---------------------------------------------------------------------------

/**
 * Build a `https://wa.me/<number>?text=<message>` URL.
 *
 * Strips a single leading `+` from the number and URL-encodes the message.
 */
export function buildWhatsAppUrl(number: string, message: string): string {
  const stripped = number.startsWith('+') ? number.slice(1) : number;
  return `https://wa.me/${stripped}?text=${encodeURIComponent(message)}`;
}