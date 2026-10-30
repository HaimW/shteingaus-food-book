// "בנה לי ארוחה" meal builder (build-plan R6).
//
// Pure module: no DOM, no Astro imports. Randomness is injected (`Rng`) so the
// logic is unit-testable. Unit tests: tests/meal-builder.test.ts.
//
// Rules:
// - courses are dish types (main, side, salad, dessert), one recipe each;
// - a recipe fills at most one course per meal, even if it has several dish
//   types (side + salad). Courses are filled with a randomized maximum
//   matching, so such a recipe never starves another course needlessly;
// - the optional meal filter (breakfast / lunch / dinner) applies to every
//   course except dessert (desserts are tagged meal=dessert);
// - locked courses keep their recipe; re-rolled courses avoid their previous
//   recipe when another one is available;
// - a course with no available recipe is left empty (the UI skips it);
// - no kosher rules; recipes with "צריך לתקן" issues are eligible as long as
//   they have the dish type.

import { DISH_TYPE_LABELS, MEAL_LABELS, type DishType, type Meal } from './labels';
import type { IndexEntry } from './index-schema';
import { shuffle, type Rng } from './random';

export const COURSES = ['main', 'side', 'salad', 'dessert'] as const satisfies readonly DishType[];
export type Course = (typeof COURSES)[number];
export const DEFAULT_COURSES: readonly Course[] = ['main', 'side', 'salad'];
export const MIN_COURSES = 2;

/** Meal filters offered by the builder ("dessert" is a course, not a meal here). */
export const BUILDER_MEALS = ['breakfast', 'lunch', 'dinner'] as const satisfies readonly Meal[];
export type BuilderMeal = (typeof BUILDER_MEALS)[number];

export const COURSE_LABELS: Record<Course, string> = {
  main: DISH_TYPE_LABELS.main,
  side: DISH_TYPE_LABELS.side,
  salad: DISH_TYPE_LABELS.salad,
  dessert: DISH_TYPE_LABELS.dessert,
};

/** Definite form, e.g. "החלפנו את הסלט". */
export const COURSE_LABELS_DEFINITE: Record<Course, string> = {
  main: 'המנה העיקרית',
  side: 'התוספת',
  salad: 'הסלט',
  dessert: 'הקינוח',
};

export type Candidate = Pick<IndexEntry, 'slug' | 'meal' | 'dishType'>;

export interface MealPlan {
  /** Courses in the meal, canonical order (COURSES). */
  courses: Course[];
  meal: BuilderMeal | null;
  /** Chosen recipe slug per course; missing = empty / not yet picked. */
  picks: Partial<Record<Course, string>>;
  /** Courses whose recipe is kept when re-rolling. */
  locked: Course[];
}

export interface FillResult {
  plan: MealPlan;
  /** Courses that could not be filled (skipped with a message). */
  empty: Course[];
  /** Courses that got a new recipe. */
  changed: Course[];
}

export function isCourse(value: unknown): value is Course {
  return typeof value === 'string' && (COURSES as readonly string[]).includes(value);
}

export function isBuilderMeal(value: unknown): value is BuilderMeal {
  return typeof value === 'string' && (BUILDER_MEALS as readonly string[]).includes(value);
}

/** De-duplicate, drop unknown values, sort into canonical order. */
export function normalizeCourses(values: readonly unknown[]): Course[] {
  return COURSES.filter((c) => values.includes(c));
}

/** Can this recipe fill this course under the meal filter? */
export function isEligible(entry: Candidate, course: Course, meal: BuilderMeal | null): boolean {
  if (!entry.dishType.includes(course)) return false;
  if (course === 'dessert' || !meal) return true;
  return entry.meal.includes(meal);
}

export function emptyPlan(courses: readonly Course[] = DEFAULT_COURSES, meal: BuilderMeal | null = null): MealPlan {
  return { courses: normalizeCourses(courses), meal, picks: {}, locked: [] };
}

/**
 * Fill the plan's courses.
 * - Locked courses keep their recipe if it still exists and has the dish type
 *   (the meal filter is not re-checked: the user chose it); otherwise the lock
 *   is dropped and the course is re-picked.
 * - Courses in `reroll` (and not locked) get a new recipe, avoiding their
 *   previous one when possible.
 * - Every other course keeps its recipe if it is still eligible and not used
 *   by another course; otherwise it is re-picked.
 */
export function fillMeal<T extends Candidate>(
  entries: readonly T[],
  plan: MealPlan,
  rng: Rng = Math.random,
  reroll: readonly Course[] = [],
): FillResult {
  const courses = normalizeCourses(plan.courses);
  const meal = isBuilderMeal(plan.meal) ? plan.meal : null;
  const locked = new Set(plan.locked.filter((c) => courses.includes(c)));
  const bySlug = new Map(entries.map((e) => [e.slug, e]));
  const picks: Partial<Record<Course, string>> = {};
  const used = new Set<string>();

  const keep = (course: Course, valid: (e: T) => boolean): boolean => {
    const slug = plan.picks[course];
    const entry = slug ? bySlug.get(slug) : undefined;
    if (!slug || !entry || used.has(slug) || !valid(entry)) return false;
    picks[course] = slug;
    used.add(slug);
    return true;
  };

  // Locked first, so a locked recipe wins over an unlocked duplicate.
  for (const c of courses) {
    if (locked.has(c) && !keep(c, (e) => e.dishType.includes(c))) locked.delete(c);
  }
  for (const c of courses) {
    if (!locked.has(c) && !reroll.includes(c)) keep(c, (e) => isEligible(e, c, meal));
  }

  const toFill = courses.filter((c) => !picks[c]);
  const candidates = new Map<Course, string[]>();
  for (const c of toFill) {
    const avoid = reroll.includes(c) ? plan.picks[c] : undefined;
    const pool = shuffle(
      entries.filter((e) => !used.has(e.slug) && isEligible(e, c, meal)).map((e) => e.slug),
      rng,
    );
    // The previous recipe of a re-rolled course is tried last.
    candidates.set(c, [...pool.filter((s) => s !== avoid), ...pool.filter((s) => s === avoid)]);
  }

  // Randomized maximum bipartite matching (Kuhn): courses x recipes.
  const owner = new Map<string, Course>();
  const assigned = new Map<Course, string>();
  const tryAssign = (c: Course, seen: Set<string>): boolean => {
    for (const slug of candidates.get(c) ?? []) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      const other = owner.get(slug);
      if (other === undefined || tryAssign(other, seen)) {
        owner.set(slug, c);
        assigned.set(c, slug);
        return true;
      }
    }
    return false;
  };
  for (const c of shuffle(toFill, rng)) tryAssign(c, new Set());

  const empty: Course[] = [];
  const changed: Course[] = [];
  for (const c of toFill) {
    const slug = assigned.get(c);
    if (slug) {
      picks[c] = slug;
      if (slug !== plan.picks[c]) changed.push(c);
    } else {
      empty.push(c);
    }
  }

  return { plan: { courses, meal, picks, locked: courses.filter((c) => locked.has(c)) }, empty, changed };
}

/** Re-roll every unlocked course. */
export function rerollAll<T extends Candidate>(entries: readonly T[], plan: MealPlan, rng: Rng = Math.random): FillResult {
  return fillMeal(entries, plan, rng, plan.courses.filter((c) => !plan.locked.includes(c)));
}

/** Re-roll one course (no-op for a locked course). */
export function rerollCourse<T extends Candidate>(
  entries: readonly T[],
  plan: MealPlan,
  course: Course,
  rng: Rng = Math.random,
): FillResult {
  return fillMeal(entries, plan, rng, plan.locked.includes(course) ? [] : [course]);
}

export function toggleLock(plan: MealPlan, course: Course): MealPlan {
  const locked = plan.locked.includes(course)
    ? plan.locked.filter((c) => c !== course)
    : plan.picks[course]
      ? normalizeCourses([...plan.locked, course])
      : plan.locked;
  return { ...plan, locked };
}

/** Add or remove a course. Removing is refused below MIN_COURSES. Call fillMeal afterwards. */
export function setCourse(plan: MealPlan, course: Course, on: boolean): MealPlan {
  if (on) return { ...plan, courses: normalizeCourses([...plan.courses, course]) };
  const courses = plan.courses.filter((c) => c !== course);
  if (courses.length < MIN_COURSES) return plan;
  const picks = { ...plan.picks };
  delete picks[course];
  return { ...plan, courses, picks, locked: plan.locked.filter((c) => c !== course) };
}

// ---------------------------------------------------------------------------
// Shareable URL: ?c=main,side,salad&meal=dinner&main=<slug>&side=<slug>&salad=<slug>&lock=main

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Read a plan from the URL. Unknown values are ignored; slugs are validated later by fillMeal. */
export function parsePlan(search: string | URLSearchParams): MealPlan {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const listed = normalizeCourses((params.get('c') ?? '').split(','));
  const courses = listed.length >= MIN_COURSES ? listed : [...DEFAULT_COURSES];
  const meal = params.get('meal');
  const picks: Partial<Record<Course, string>> = {};
  for (const c of courses) {
    const slug = params.get(c)?.trim();
    if (slug && SLUG.test(slug)) picks[c] = slug;
  }
  const locked = normalizeCourses((params.get('lock') ?? '').split(',')).filter((c) => picks[c]);
  return { courses, meal: isBuilderMeal(meal) ? meal : null, picks, locked };
}

/** Query string for a plan (inverse of parsePlan). Slugs and keys are URL-safe. */
export function planToSearch(plan: MealPlan): string {
  const courses = normalizeCourses(plan.courses);
  const parts = [`c=${courses.join(',')}`];
  if (plan.meal) parts.push(`meal=${plan.meal}`);
  for (const c of courses) {
    const slug = plan.picks[c];
    if (slug && SLUG.test(slug)) parts.push(`${c}=${slug}`);
  }
  const locked = normalizeCourses(plan.locked).filter((c) => courses.includes(c) && plan.picks[c]);
  if (locked.length > 0) parts.push(`lock=${locked.join(',')}`);
  return `?${parts.join('&')}`;
}

// ---------------------------------------------------------------------------
// UI text (Hebrew)

/** Friendly message for a course that was skipped. */
export function emptyMessage(entries: readonly Candidate[], plan: MealPlan, course: Course): string {
  const label = COURSE_LABELS[course];
  const forMeal = plan.meal && course !== 'dessert' ? ` ל${MEAL_LABELS[plan.meal]}` : '';
  const count = entries.filter((e) => isEligible(e, course, plan.meal)).length;
  if (count === 0) return `עדיין אין מתכון מסוג ${label}${forMeal}, אז דילגנו על המנה הזו.`;
  if (count === 1) return `המתכון היחיד מסוג ${label}${forMeal} כבר נמצא בארוחה במנה אחרת, אז דילגנו על המנה הזו.`;
  return `כל המתכונים מסוג ${label}${forMeal} כבר נמצאים בארוחה, אז דילגנו על המנה הזו.`;
}

/** Live-region announcement for a (re)built meal. */
export function announce(
  entries: readonly Pick<IndexEntry, 'slug' | 'title'>[],
  result: FillResult,
  scope: 'meal' | Course = 'meal',
): string {
  const title = (slug: string | undefined) => entries.find((e) => e.slug === slug)?.title ?? '';
  const { plan, empty, changed } = result;
  if (scope !== 'meal') {
    const slug = plan.picks[scope];
    if (!slug) return `לא מצאנו אפשרות ל${COURSE_LABELS[scope]}, אז דילגנו על המנה הזו.`;
    return changed.includes(scope)
      ? `החלפנו את ${COURSE_LABELS_DEFINITE[scope]}: ${title(slug)}.`
      : `אין אפשרות אחרת ל${COURSE_LABELS[scope]}. נשאר: ${title(slug)}.`;
  }
  const parts = plan.courses.filter((c) => plan.picks[c]).map((c) => `${COURSE_LABELS[c]}: ${title(plan.picks[c])}`);
  let text = parts.length > 0 ? `הארוחה מוכנה. ${parts.join('. ')}.` : 'לא מצאנו מתכונים לארוחה.';
  if (empty.length > 0) text += ` דילגנו על: ${empty.map((c) => COURSE_LABELS[c]).join(', ')}.`;
  return text;
}
