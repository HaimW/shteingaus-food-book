// Browser helper: fetch the shared recipe index once per page (build-plan R4).
// Used by search, random recipe and the meal builder.

import { INDEX_VERSION, type IndexEntry, type RecipeIndex } from './index-schema';

const cache = new Map<string, Promise<IndexEntry[]>>();

/** Load and version-check the index at `url` (use withBase(INDEX_PATH) in a data attribute). */
export function loadIndex(url: string): Promise<IndexEntry[]> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`recipe index: HTTP ${res.status}`);
      const index = (await res.json()) as RecipeIndex;
      if (index.version !== INDEX_VERSION) throw new Error('recipe index: unexpected version');
      return index.recipes;
    })();
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}
