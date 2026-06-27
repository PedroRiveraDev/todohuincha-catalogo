// src/lib/pdf-brand.ts
// Brand-mark and cover-image helpers extracted from the duplicated
// getLogoBase64 chains inside PdfDownloadButton.astro and
// CategoryPdfDownloadButton.astro (slice 2 + slice 3).
//
// In the browser the helpers use the DOM + canvas API. In Node tests
// we accept an injected `fetchImpl` and `createCanvas` so the chain
// can be exercised without a real DOM.
//
// Slice pdf-catalog-v2.
// Refs:
//   openspec/changes/pdf-catalog-v2/spec.md (Requirement: logo extraction helper)
//   openspec/changes/pdf-catalog-v2/design.md (section 2.2)

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

interface LogoImgLike {
  complete?: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
}

interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: '2d'): { drawImage(img: LogoImgLike, x: number, y: number): void } | null;
  toDataURL(mime?: string): string;
}

interface FetchLike {
  (input: string, init?: RequestInit): Promise<{ ok: boolean; status: number }>;
}

export interface BrandOptions {
  fetchImpl?: FetchLike;
  queryLogoImg?: () => LogoImgLike | null;
  createCanvas?: () => CanvasLike;
}

// ---------------------------------------------------------------------------
// Fetch cache (de-dupes repeated /logo-todohuincha.svg lookups)
// ---------------------------------------------------------------------------

const fetchCache = new Map<string, Promise<{ ok: boolean; status: number }>>();

export function resetPdfBrandFetchCache(): void {
  fetchCache.clear();
}

// ---------------------------------------------------------------------------
// Default dependencies (browser)
// ---------------------------------------------------------------------------

const defaultFetch: FetchLike = (input, init) =>
  fetch(input as RequestInfo | URL, init);

function defaultQueryLogoImg(): LogoImgLike | null {
  if (typeof document === 'undefined') return null;
  const img = document.querySelector<HTMLImageElement>('.brand img');
  return img ?? null;
}

function defaultCreateCanvas(): CanvasLike {
  const canvas = document.createElement('canvas');
  // Re-narrow the DOM canvas to CanvasLike. document.createElement
  // returns HTMLCanvasElement which already has all the fields we
  // touch (width, height, getContext, toDataURL).
  return canvas as unknown as CanvasLike;
}

// ---------------------------------------------------------------------------
// getLogoBase64
// ---------------------------------------------------------------------------

/**
 * Resolve the brand logo to a base64 data URI (or null on failure).
 *
 * Order:
 *  1. DOM img `<img class="brand img">` -> canvas -> base64
 *  2. fetch /logo-todohuincha.svg -> img -> canvas -> base64
 *  3. null (caller falls back to its own vector outline)
 *
 * Each fetch is cached for the session so multiple items in the same
 * PDF run do not trigger redundant network requests.
 */
export async function getLogoBase64(options: BrandOptions = {}): Promise<string | null> {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const queryLogoImg = options.queryLogoImg ?? defaultQueryLogoImg;
  const createCanvas = options.createCanvas ?? defaultCreateCanvas;

  // Step 1: DOM image already loaded.
  const img = queryLogoImg();
  if (img && img.complete && (img.naturalWidth ?? 0) > 0) {
    try {
      const canvas = createCanvas();
      canvas.width = img.naturalWidth ?? 100;
      canvas.height = img.naturalHeight ?? 100;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
      }
    } catch {
      // fall through to fetch
    }
  }

  // Step 2: fetch the SVG and re-encode via canvas.
  try {
    const url = '/logo-todohuincha.svg';
    let resPromise = fetchCache.get(url);
    if (!resPromise) {
      resPromise = fetchImpl(url);
      fetchCache.set(url, resPromise);
    }
    const res = await resPromise;
    if (!res.ok) return null;

    // In the browser we have an Image constructor and can decode the
    // SVG via a canvas. In Node / tests we synthesize a base64 stub
    // using the URL itself (the caller can still hit the data: prefix
    // for branching).
    if (typeof Image === 'undefined') {
      return `data:image/svg+xml;base64,${Buffer.from(url).toString('base64')}`;
    }

    return await new Promise<string | null>((resolve) => {
      const fetchImg = new Image();
      fetchImg.crossOrigin = 'anonymous';
      fetchImg.src = url;
      fetchImg.onload = () => {
        try {
          const canvas = createCanvas();
          canvas.width = fetchImg.naturalWidth || 324;
          canvas.height = fetchImg.naturalHeight || 92;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(fetchImg, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };
      fetchImg.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// getCoverImageBase64
// ---------------------------------------------------------------------------

interface CatalogAssetsLike {
  cover_image?: { url?: string | null } | null;
}

export interface CoverOptions extends BrandOptions {
  catalogAssets?: CatalogAssetsLike | null;
}

const COVER_FALLBACKS: readonly string[] = [
  '/hero/taller-maquinaria.jpg',
  '/hero/taller.jpg',
];

/**
 * Resolve the catalog cover image. Order:
 *  1. catalogAssets.cover_image.url (currently always null per spec)
 *  2. /hero/taller-maquinaria.jpg
 *  3. /hero/taller.jpg
 *
 * Returns null on total miss so the caller can render an orange rect.
 */
export async function getCoverImageBase64(
  options: CoverOptions = {}
): Promise<string | null> {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const createCanvas = options.createCanvas ?? defaultCreateCanvas;

  const explicit = options.catalogAssets?.cover_image?.url;
  const candidates: string[] = [];
  if (typeof explicit === 'string' && explicit.length > 0) {
    candidates.push(explicit);
  }
  for (const fb of COVER_FALLBACKS) {
    if (!candidates.includes(fb)) candidates.push(fb);
  }

  for (const url of candidates) {
    try {
      const res = await fetchImpl(url);
      if (!res.ok) continue;

      if (typeof Image === 'undefined') {
        return `data:image/jpeg;base64,${Buffer.from(url).toString('base64')}`;
      }

      const encoded = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        img.onload = () => {
          try {
            const canvas = createCanvas();
            canvas.width = img.naturalWidth || 800;
            canvas.height = img.naturalHeight || 600;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              resolve(canvas.toDataURL('image/png'));
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
      });

      if (encoded) return encoded;
    } catch {
      // try next
    }
  }

  return null;
}