import type { ImageMetadata } from 'astro';
import type { CollectionEntry } from 'astro:content';
import type { Meal, DishType } from './labels';
import { recipeIssues } from './recipe-issues';

// Recipe content never fails the build (build-plan R2/R3): unknown categories
// and missing photos are surfaced as issues on the page instead.

type Recipe = CollectionEntry<'recipes'>;

const RECIPES_DIR = '/src/content/recipes';
const images = import.meta.glob<ImageMetadata>('/src/content/recipes/**/*.{jpg,jpeg,png,webp,avif,gif,svg}', {
  eager: true,
  import: 'default',
});

/** Join and normalize "a/b/../c" style paths (POSIX, no filesystem access). */
function joinPath(dir: string, rel: string): string {
  const parts: string[] = [];
  for (const p of `${dir}/${rel}`.split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..') parts.pop();
    else parts.push(p);
  }
  return `/${parts.join('/')}`;
}

/**
 * Resolve a frontmatter image path to an imported image. Paths are relative to the
 * recipe's own folder (Drive-synced recipes live in src/content/recipes/<slug>/ next to
 * their photos); for compatibility they may also be relative to src/content/recipes/.
 */
function resolveImage(path: string | undefined, filePath: string | undefined): ImageMetadata | undefined {
  if (!path) return undefined;
  const clean = path.trim();
  if (/^[a-z]+:/i.test(clean)) return undefined; // remote URLs are not supported
  const fileDir = filePath ? `/${filePath.replace(/^\/+/, '').replace(/\/[^/]*$/, '')}` : RECIPES_DIR;
  return images[joinPath(fileDir, clean)] ?? images[joinPath(RECIPES_DIR, clean.replace(/^\/+/, ''))];
}

export interface RecipeView {
  meal: Meal[];
  dishType: DishType[];
  ingredients: string[];
  image?: ImageMetadata;
  /** Hebrew, human-readable problems to fix in the source doc. */
  issues: string[];
  missingImage: boolean;
  /** Link to the source Google Doc, for Drive-synced recipes. */
  docUrl?: string;
}

export function googleDocUrl(driveId: string | undefined): string | undefined {
  return driveId ? `https://docs.google.com/document/d/${encodeURIComponent(driveId)}/edit` : undefined;
}

export function recipeView(recipe: Recipe): RecipeView {
  const d = recipe.data;
  const image = resolveImage(d.image, recipe.filePath);
  const { meal, dishType, ingredients, issues } = recipeIssues({
    meal: d.meal,
    dishType: d.dishType,
    ingredients: d.ingredients,
    image: d.image,
    imageFound: Boolean(image),
  });
  return { meal, dishType, ingredients, image, issues, missingImage: !image, docUrl: googleDocUrl(d.driveId) };
}
