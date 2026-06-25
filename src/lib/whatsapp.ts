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
 * Formats accepted:
 *   - `<key>:<E.164>,<key>:<E.164>,...`  (canonical)
 *   - `<number>` or `+<number>`           (single bare number treated as `general`)
 *   - mixed: `<key>:<E.164>,<number>`     (mixed pairs)
 *
 * Malformed entries (no colon, empty key) are silently dropped. Empty
 * or undefined input returns an empty record.
 *
 * Single bare number tolerance is for the common quick-start case where
 * the operator pastes only one phone number without the key:value wrapping;
 * it is treated as `{ general: <number> }` so the WhatsApp CTA still works.
 */
export function parseWhatsAppNumbers(env: string | undefined): Record<string, string> {
  if (!env || env.trim().length === 0) return {};

  const result: Record<string, string> = {};
  const tokens = env
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  // Count bare-number tokens (no colon). If the env is ALL bare numbers,
  // treat the LAST one as the `general` fallback. If the env is mixed
  // (some bare, some key:value), the bare ones are treated as typos and
  // dropped to avoid silent misconfiguration.
  const bareTokens: string[] = [];
  let hasKeyedToken = false;

  for (const token of tokens) {
    const colonIdx = token.indexOf(':');
    if (colonIdx === -1) {
      bareTokens.push(token);
    } else {
      hasKeyedToken = true;
    }
  }

  for (const token of tokens) {
    const colonIdx = token.indexOf(':');
    if (colonIdx === -1) {
      // Bare number handling: only when there are NO keyed tokens.
      if (!hasKeyedToken && token === bareTokens[bareTokens.length - 1]) {
        result.general = token;
      }
      continue;
    }

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