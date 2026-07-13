import type { APIRoute, GetStaticPaths } from 'astro';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DOC_COVER_FILES = new Set(['page_1', 'page_2']);
const root = fileURLToPath(new URL('../../../../', import.meta.url));

export const getStaticPaths: GetStaticPaths = () => [...DOC_COVER_FILES].map((file) => ({ params: { file } }));

export const GET: APIRoute = async ({ params }) => {
  const file = params.file ?? '';
  if (!DOC_COVER_FILES.has(file)) return new Response('Not found', { status: 404 });

  const bytes = await readFile(`${root}docs/${file}.png`);
  return new Response(bytes, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=3600',
    },
  });
};
