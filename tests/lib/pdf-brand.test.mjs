// tests/lib/pdf-brand.test.mjs
// Tests for src/lib/pdf-brand.ts (slice pdf-catalog-v2).
// Refs:
//   openspec/changes/pdf-catalog-v2/spec.md (Requirement: logo extraction helper)
//   openspec/changes/pdf-catalog-v2/design.md (section 2.2)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLogoBase64,
  getCoverImageBase64,
  resetPdfBrandFetchCache,
} from '../../src/lib/pdf-brand.ts';

function withCleanCache(fn) {
  return async () => {
    resetPdfBrandFetchCache();
    try {
      await fn();
    } finally {
      resetPdfBrandFetchCache();
    }
  };
}

// ---------------------------------------------------------------------------
// getLogoBase64
// ---------------------------------------------------------------------------

test(
  'getLogoBase64: returns null when DOM img missing AND fetch fails',
  withCleanCache(async () => {
    const fetchImpl = async () => ({ ok: false, status: 404 });
    const out = await getLogoBase64({
      fetchImpl,
      // document query returns null -> fall through to fetch
      queryLogoImg: () => null,
    });
    assert.equal(out, null);
  })
);

test(
  'getLogoBase64: returns base64 starting with data:image/ when DOM img present',
  withCleanCache(async () => {
    // Fake a fully-loaded DOM image (canvas drawImage path).
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => undefined,
      }),
      toDataURL: () => 'data:image/png;base64,FAKE',
    };
    const out = await getLogoBase64({
      queryLogoImg: () => ({
        complete: true,
        naturalWidth: 100,
        naturalHeight: 30,
      }),
      createCanvas: () => fakeCanvas,
    });
    assert.ok(out !== null);
    assert.ok(out.startsWith('data:image/'));
  })
);

test(
  'getLogoBase64: falls back to fetch when DOM img throws',
  withCleanCache(async () => {
    const fetchImpl = async (url) => {
      assert.equal(url, '/logo-todohuincha.svg');
      return { ok: true, status: 200 };
    };
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toDataURL: () => 'data:image/png;base64,FAKE_FROM_FETCH',
    };
    const out = await getLogoBase64({
      fetchImpl,
      queryLogoImg: () => {
        // Simulate a complete=false / not-yet-loaded image so the
        // fetch branch runs.
        return { complete: false, naturalWidth: 0, naturalHeight: 0 };
      },
      createCanvas: () => fakeCanvas,
    });
    assert.ok(out !== null);
    assert.ok(out.startsWith('data:image/'));
  })
);

test(
  'getLogoBase64: returns null when fetch returns non-OK and DOM img missing',
  withCleanCache(async () => {
    const out = await getLogoBase64({
      fetchImpl: async () => ({ ok: false, status: 500 }),
      queryLogoImg: () => null,
    });
    assert.equal(out, null);
  })
);

// ---------------------------------------------------------------------------
// getCoverImageBase64
// ---------------------------------------------------------------------------

test(
  'getCoverImageBase64: resolves /hero/taller-maquinaria.jpg first',
  withCleanCache(async () => {
    let requestedUrl = '';
    const fetchImpl = async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200 };
    };
    const out = await getCoverImageBase64({
      fetchImpl,
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined }),
        toDataURL: () => 'data:image/png;base64,COVER',
      }),
      catalogAssets: { cover_image: { url: null } },
    });
    assert.ok(out !== null);
    assert.ok(out.startsWith('data:image/'));
    assert.equal(requestedUrl, '/hero/taller-maquinaria.jpg');
  })
);

test(
  'getCoverImageBase64: falls back to /hero/taller.jpg when taller-maquinaria fails',
  withCleanCache(async () => {
    const tried = [];
    const fetchImpl = async (url) => {
      tried.push(url);
      if (url === '/hero/taller-maquinaria.jpg') {
        return { ok: false, status: 404 };
      }
      return { ok: true, status: 200 };
    };
    const out = await getCoverImageBase64({
      fetchImpl,
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined }),
        toDataURL: () => 'data:image/png;base64,COVER2',
      }),
    });
    assert.ok(out !== null);
    assert.ok(out.startsWith('data:image/'));
    assert.deepEqual(tried, ['/hero/taller-maquinaria.jpg', '/hero/taller.jpg']);
  })
);

test(
  'getCoverImageBase64: returns null when both hero fallbacks fail',
  withCleanCache(async () => {
    const fetchImpl = async () => ({ ok: false, status: 500 });
    const out = await getCoverImageBase64({
      fetchImpl,
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined }),
        toDataURL: () => 'data:image/png;base64,NEVER',
      }),
    });
    assert.equal(out, null);
  })
);

test(
  'getCoverImageBase64: prefers catalogAssets.cover_image.url when present',
  withCleanCache(async () => {
    let requestedUrl = '';
    const fetchImpl = async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200 };
    };
    const out = await getCoverImageBase64({
      fetchImpl,
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined }),
        toDataURL: () => 'data:image/png;base64,CAT_COVER',
      }),
      catalogAssets: { cover_image: { url: '/catalog-cover.jpg' } },
    });
    assert.ok(out !== null);
    assert.equal(requestedUrl, '/catalog-cover.jpg');
  })
);