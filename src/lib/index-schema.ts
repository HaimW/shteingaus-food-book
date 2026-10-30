// Shape of the shared build-time recipe index (build-plan R4: one index powers
// search, meal filters, random recipe and the meal builder).
// Built by src/lib/recipe-index.ts, served at <base>/recipe-index.json.
// Pure types: safe to import from browser code and tests.

import type { Meal, DishType } from './labels';

export const INDEX_VERSION = 1;
/** Path relative to the site base; use withBase(INDEX_PATH) for the URL. */
export const INDEX_PATH = 'recipe-index.json';

export interface IndexEntry {
  slug: string;
  title: string;
  /** Base-path-safe recipe page URL, e.g. /shteingaus-food-book/recipes/majadra/ */
  url: string;
  /** Only known values; unknown ones are surfaced as issues instead (R2). */
  meal: Meal[];
  dishType: DishType[];
  ingredients: string[];
  author: string | null;
  /** Base-path-safe thumbnail URL (~400px wide), or null when the photo is missing. */
  image: string | null;
  /** Number of "צריך לתקן" issues on the recipe page. */
  issues: number;
  /** Normalized searchable text (see normalize() in search.ts). */
  text: {
    title: string;
    ingredients: string;
    /** steps, notes, author, tags */
    body: string;
  };
}

export interface RecipeIndex {
  version: typeof INDEX_VERSION;
  recipes: IndexEntry[];
}
