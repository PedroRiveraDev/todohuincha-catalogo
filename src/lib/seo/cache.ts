// Tiny JSON-LD dedup cache keyed on canonical JSON snapshot.
// Astro emits many pages per build; each page renders its own slice through the same
// helpers. We cache the resolved object so repeated calls with the same payload do not
// produce duplicate @ids or drift the in-memory graph state.

const store = new Map<string, unknown>();

export function jsonLdCache<T>(snapshot: string, build: () => T): T {
  const hit = store.get(snapshot);
  if (hit !== undefined) return hit as T;
  const value = build();
  store.set(snapshot, value);
  return value;
}

export function clearJsonLdCache(): void {
  store.clear();
}

// Cycle + depth guard for nested Organization references. We cap nested depth at 12
// which is well above any realistic schema but stops accidental infinite graphs.
const MAX_DEPTH = 12;

export function guardDepth(depth: number, label: string): void {
  if (depth > MAX_DEPTH) {
    throw new Error(`jsonld cycle guard tripped at depth ${depth} (${label})`);
  }
}