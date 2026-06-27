// tests/lib/pdf-image-fallback.test.mjs
// Tests for src/lib/pdf-image-fallback.ts (slice pdf-catalog-v2).
// Refs:
//   openspec/changes/pdf-catalog-v2/spec.md (Requirement: image fallback chain)
//   openspec/changes/pdf-catalog-v2/design.md (section 5)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePdfImageSrc,
  resetPdfImageFallbackCache,
  VECTOR_SENTINEL,
} from '../../src/lib/pdf-image-fallback.ts';

// Reset the module-scope cache between tests so cache-hit assertions
// are deterministic.
function withCleanCache(fn) {
  return async () => {
    resetPdfImageFallbackCache();
    try {
      await fn();
    } finally {
      resetPdfImageFallbackCache();
    }
  };
}

// ---------------------------------------------------------------------------
// VECTOR_SENTINEL export
// ---------------------------------------------------------------------------

test('VECTOR_SENTINEL: exported as "__vector__"', () => {
  assert.equal(VECTOR_SENTINEL, '__vector__');
});

// ---------------------------------------------------------------------------
// Step 1: item.assets.main_image.data_base64 wins verbatim
// ---------------------------------------------------------------------------

test(
  'resolvePdfImageSrc: returns data_base64 verbatim when present',
  withCleanCache(async () => {
    const out = await resolvePdfImageSrc(
      { assets: { main_image: { data_base64: 'XYZ', url: '/should-be-ignored.jpg' } } },
      null,
      null,
      null
    );
    assert.equal(out, 'data:image/png;base64,XYZ');
  })
);

test(
  'resolvePdfImageSrc: data_base64 missing the prefix gets the prefix added',
  withCleanCache(async () => {
    const out = await resolvePdfImageSrc(
      { assets: { main_image: { data_base64: 'AAAA' } } },
      null,
      null,
      null
    );
    assert.equal(out, 'data:image/png;base64,AAAA');
  })
);

// ---------------------------------------------------------------------------
// Step 2-5: URL fallback chain (with mocked fetch)
// ---------------------------------------------------------------------------

/** Build a fake Response that behaves like a successful image fetch. */
function fakeImageResponse(b64 = 'FETCHED') {
  return {
    ok: true,
    status: 200,
    blob: async () => ({
      // size hint not strictly required but mimics Blob shape.
      size: b64.length,
    }),
  };
}

test(
  'resolvePdfImageSrc: falls back to item.assets.main_image.url when data_base64 null',
  withCleanCache(async () => {
    const fetchImpl = async (url) => {
      assert.equal(url, '/img/item.jpg');
      return fakeImageResponse();
    };
    const out = await resolvePdfImageSrc(
      { assets: { main_image: { data_base64: null, url: '/img/item.jpg' } } },
      null,
      null,
      null,
      { fetchImpl }
    );
    assert.ok(out.startsWith('data:image/'));
  })
);

test(
  'resolvePdfImageSrc: falls back to family.assets.main_image.url',
  withCleanCache(async () => {
    const fetchImpl = async (url) => {
      assert.equal(url, '/img/family.jpg');
      return fakeImageResponse();
    };
    const out = await resolvePdfImageSrc(
      { assets: null },
      null,
      { assets: { main_image: { url: '/img/family.jpg' } } },
      null,
      { fetchImpl }
    );
    assert.ok(out.startsWith('data:image/'));
  })
);

test(
  'resolvePdfImageSrc: falls back to category.assets.banner.url',
  withCleanCache(async () => {
    const fetchImpl = async (url) => {
      assert.equal(url, '/img/cat.jpg');
      return fakeImageResponse();
    };
    const out = await resolvePdfImageSrc(
      { assets: null },
      { assets: { banner: { url: '/img/cat.jpg' } } },
      null,
      null,
      { fetchImpl }
    );
    assert.ok(out.startsWith('data:image/'));
  })
);

test(
  'resolvePdfImageSrc: falls back to catalogAssets.placeholder_image.url',
  withCleanCache(async () => {
    const fetchImpl = async (url) => {
      assert.equal(url, '/img/placeholder.jpg');
      return fakeImageResponse();
    };
    const out = await resolvePdfImageSrc(
      { assets: null },
      null,
      null,
      { placeholder_image: { url: '/img/placeholder.jpg' } },
      { fetchImpl }
    );
    assert.ok(out.startsWith('data:image/'));
  })
);

// ---------------------------------------------------------------------------
// Total miss -> VECTOR_SENTINEL
// ---------------------------------------------------------------------------

test(
  'resolvePdfImageSrc: total miss returns "__vector__" sentinel',
  withCleanCache(async () => {
    const out = await resolvePdfImageSrc(
      { assets: null },
      null,
      null,
      null,
      { fetchImpl: async () => ({ ok: false, status: 404, blob: async () => ({}) }) }
    );
    assert.equal(out, VECTOR_SENTINEL);
  })
);

test(
  'resolvePdfImageSrc: every level failing returns "__vector__"',
  withCleanCache(async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, blob: async () => ({}) });
    const out = await resolvePdfImageSrc(
      {
        assets: { main_image: { url: '/broken1.jpg' } },
      },
      { assets: { banner: { url: '/broken2.jpg' } } },
      { assets: { main_image: { url: '/broken3.jpg' } } },
      { placeholder_image: { url: '/broken4.jpg' } },
      { fetchImpl }
    );
    assert.equal(out, VECTOR_SENTINEL);
  })
);

// ---------------------------------------------------------------------------
// Cache (spec scenario: "same URL is cached")
// ---------------------------------------------------------------------------

test(
  'resolvePdfImageSrc: same URL is cached (single fetch per run)',
  withCleanCache(async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return fakeImageResponse();
    };
    const item = { assets: { main_image: { url: '/img/cached.jpg' } } };
    const a = await resolvePdfImageSrc(item, null, null, null, { fetchImpl });
    const b = await resolvePdfImageSrc(item, null, null, null, { fetchImpl });
    // Both calls return data: URIs (not the same URL string — canvas
    // re-encoding can vary), but the underlying fetch runs exactly once.
    assert.ok(a.startsWith('data:image/'));
    assert.ok(b.startsWith('data:image/'));
    assert.equal(calls, 1, 'fetch should be invoked exactly once for cached URL');
  })
);

// ---------------------------------------------------------------------------
// Null safety
// ---------------------------------------------------------------------------

test(
  'resolvePdfImageSrc: null assets does not throw, returns vector',
  withCleanCache(async () => {
    const out = await resolvePdfImageSrc(
      { assets: null },
      null,
      null,
      null,
      { fetchImpl: async () => ({ ok: false, status: 404, blob: async () => ({}) }) }
    );
    assert.equal(out, VECTOR_SENTINEL);
  })
);

test(
  'resolvePdfImageSrc: missing family does not throw',
  withCleanCache(async () => {
    const out = await resolvePdfImageSrc(
      { assets: null },
      null,
      undefined,
      null,
      { fetchImpl: async () => ({ ok: false, status: 404, blob: async () => ({}) }) }
    );
    assert.equal(out, VECTOR_SENTINEL);
  })
);

// ---------------------------------------------------------------------------
// Static fallbacks
// ---------------------------------------------------------------------------

test(
  'resolvePdfImageSrc: chain ends at static /hero/taller-maquinaria.jpg',
  withCleanCache(async () => {
    let lastUrl = '';
    const fetchImpl = async (url) => {
      lastUrl = url;
      // Make the static fallback succeed so we can observe it.
      return fakeImageResponse();
    };
    const out = await resolvePdfImageSrc(
      { assets: null },
      null,
      null,
      null,
      { fetchImpl }
    );
    // No prior step matched -> the chain should reach the static path
    // and resolve it via fetch.
    assert.ok(out.startsWith('data:image/'));
    assert.ok(
      lastUrl === '/hero/taller-maquinaria.jpg' || lastUrl === '/hero/taller.jpg',
      `unexpected fallback URL: ${lastUrl}`
    );
  })
);

test(
  'resolvePdfImageSrc: when all static fallbacks also fail -> vector',
  withCleanCache(async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, blob: async () => ({}) });
    const out = await resolvePdfImageSrc(
      { assets: null },
      null,
      null,
      null,
      { fetchImpl }
    );
    assert.equal(out, VECTOR_SENTINEL);
  })
);