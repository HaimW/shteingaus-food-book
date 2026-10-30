import type { APIRoute } from 'astro';
import { buildRecipeIndex } from '../lib/recipe-index';

// Shared recipe index (build-plan R4), generated at build time:
// <base>/recipe-index.json. Shape: src/lib/index-schema.ts.
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await buildRecipeIndex()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
