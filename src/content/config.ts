// Astro content collection declaration for institutional content.
// Pages typically import the JSON files directly via ESM; this file marks the directory
// so Astro recognises it as a data collection and surfaces the JSON in typegen output.
// No Zod schema: validation is enforced at runtime via src/content/institutional/validate.ts
// (see loadCompanyJson.ts), keeping the dep footprint flat.

import { defineCollection } from 'astro:content';

const institutional = defineCollection({
  type: 'data',
});

export const collections = { institutional };