import type { ImageMetadata } from 'astro';
import type { CollectionEntry } from 'astro:content';
import {
  MEALS,
  DISH_TYPES,
  MEAL_LABELS,
  DISH_TYPE_LABELS,
  type Meal,
  type DishType,
} from './labels';

// Recipe content never fails the build (build-plan R2/R3): unknown categories
// and missing photos are surfaced as issues on the page instead.

type Recipe = CollectionEntry<'recipes'>;

const images = import.meta.glob<ImageMetadata>('/src/content/recipes/**/*.{jpg,jpeg,png,webp,avif,gif,svg}', {
  eager: true,
  import: 'default',
});

/** Resolve a frontmatter image path (relative to src/content/recipes/) to an imported image. */
function resolveImage(path: string | undefined): ImageMetadata | undefined {
  if (!path) return undefined;
  const clean = path.trim().replace(/^\.\//, '').replace(/^\/+/, '');
  return images[`/src/content/recipes/${clean}`];
}

/** Split raw values into known keys and unknown values; accepts the English key or the Hebrew label. */
function classify<K extends string>(
  values: string[] | undefined,
  keys: readonly K[],
  labels: Record<K, string>,
): { known: K[]; unknown: string[] } {
  const known: K[] = [];
  const unknown: string[] = [];
  for (const raw of values ?? []) {
    const v = raw.trim();
    if (!v) continue;
    const key = keys.find((k) => k === v.toLowerCase() || labels[k] === v);
    if (key) {
      if (!known.includes(key)) known.push(key);
    } else {
      unknown.push(v);
    }
  }
  return { known, unknown };
}

export interface RecipeView {
  meal: Meal[];
  dishType: DishType[];
  ingredients: string[];
  image?: ImageMetadata;
  /** Hebrew, human-readable problems to fix in the source doc. */
  issues: string[];
  missingImage: boolean;
}

export function recipeView(recipe: Recipe): RecipeView {
  const d = recipe.data;
  const meal = classify(d.meal, MEALS, MEAL_LABELS);
  const dishType = classify(d.dishType, DISH_TYPES, DISH_TYPE_LABELS);
  const ingredients = (d.ingredients ?? []).map((i) => i.trim()).filter(Boolean);
  const image = resolveImage(d.image);
  const missingImage = !image;

  const issues: string[] = [];
  const allowedMeals = MEALS.map((k) => MEAL_LABELS[k]).join(', ');
  const allowedDishTypes = DISH_TYPES.map((k) => DISH_TYPE_LABELS[k]).join(', ');
  for (const v of meal.unknown) issues.push(`הארוחה "${v}" לא מוכרת — יש לשנות לאחת מ: ${allowedMeals}`);
  for (const v of dishType.unknown) issues.push(`סוג המנה "${v}" לא מוכר — יש לשנות לאחד מ: ${allowedDishTypes}`);
  if (meal.known.length === 0 && meal.unknown.length === 0) issues.push(`חסרה ארוחה (${allowedMeals})`);
  if (dishType.known.length === 0 && dishType.unknown.length === 0) issues.push(`חסר סוג מנה (${allowedDishTypes})`);
  if (missingImage) issues.push(d.image ? `התמונה "${d.image}" לא נמצאה` : 'חסרה תמונה');
  if (ingredients.length === 0) issues.push('חסרים מצרכים');

  return { meal: meal.known, dishType: dishType.known, ingredients, image, issues, missingImage };
}
