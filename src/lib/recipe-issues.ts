// Pure recipe validation shared by the site (src/lib/recipe.ts) and the Drive
// sync summary (scripts/drive-sync). Recipe content never fails the build
// (build-plan R2/R3): problems become Hebrew "needs fixing" issues instead.
// Imports use explicit .ts extensions so Node can run this file directly.
import {
  MEALS,
  DISH_TYPES,
  MEAL_LABELS,
  DISH_TYPE_LABELS,
  MEAL_ALIASES,
  DISH_TYPE_ALIASES,
  type Meal,
  type DishType,
} from './labels.ts';

const norm = (s: string) => s.replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Split raw values into known keys and unknown values; accepts the English key, the Hebrew label or an alias. */
export function classify<K extends string>(
  values: string[] | undefined,
  keys: readonly K[],
  labels: Record<K, string>,
  aliases: Record<K, string[]>,
): { known: K[]; unknown: string[] } {
  const known: K[] = [];
  const unknown: string[] = [];
  for (const raw of values ?? []) {
    const v = norm(String(raw));
    if (!v) continue;
    const key = keys.find((k) => k === v || norm(labels[k]) === v || aliases[k].some((a) => norm(a) === v));
    if (key) {
      if (!known.includes(key)) known.push(key);
    } else {
      unknown.push(String(raw).trim());
    }
  }
  return { known, unknown };
}

export interface IssueInput {
  meal?: string[];
  dishType?: string[];
  ingredients?: string[];
  /** Frontmatter image path as written (undefined when none). */
  image?: string;
  /** Whether the image path resolved to a real file. */
  imageFound: boolean;
}

export interface Classified {
  meal: Meal[];
  dishType: DishType[];
  ingredients: string[];
  issues: string[];
}

export function recipeIssues(input: IssueInput): Classified {
  const meal = classify(input.meal, MEALS, MEAL_LABELS, MEAL_ALIASES);
  const dishType = classify(input.dishType, DISH_TYPES, DISH_TYPE_LABELS, DISH_TYPE_ALIASES);
  const ingredients = (input.ingredients ?? []).map((i) => String(i).trim()).filter(Boolean);

  const issues: string[] = [];
  const allowedMeals = MEALS.map((k) => MEAL_LABELS[k]).join(', ');
  const allowedDishTypes = DISH_TYPES.map((k) => DISH_TYPE_LABELS[k]).join(', ');
  for (const v of meal.unknown) issues.push(`הארוחה "${v}" לא מוכרת — יש לשנות לאחת מ: ${allowedMeals}`);
  for (const v of dishType.unknown) issues.push(`סוג המנה "${v}" לא מוכר — יש לשנות לאחד מ: ${allowedDishTypes}`);
  if (meal.known.length === 0 && meal.unknown.length === 0) issues.push(`חסרה ארוחה (${allowedMeals})`);
  if (dishType.known.length === 0 && dishType.unknown.length === 0) issues.push(`חסר סוג מנה (${allowedDishTypes})`);
  if (!input.imageFound) issues.push(input.image ? `התמונה "${input.image}" לא נמצאה` : 'חסרה תמונה');
  if (ingredients.length === 0) issues.push('חסרים מצרכים');

  return { meal: meal.known, dishType: dishType.known, ingredients, issues };
}
