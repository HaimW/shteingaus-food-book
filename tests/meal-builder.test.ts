import { describe, expect, it } from 'vitest';
import {
  announce,
  emptyMessage,
  emptyPlan,
  fillMeal,
  parsePlan,
  planToSearch,
  rerollAll,
  rerollCourse,
  setCourse,
  toggleLock,
  type Candidate,
  type Course,
  type MealPlan,
} from '../src/lib/meal-builder';
import type { DishType, Meal } from '../src/lib/labels';
import { seeded } from './helpers';

const r = (slug: string, dishType: DishType[], meal: Meal[] = ['lunch', 'dinner']): Candidate & { title: string } => ({
  slug,
  dishType,
  meal,
  title: slug.toUpperCase(),
});

// Mirrors the tight spots of the sample recipes: one side+salad recipe, one main+side recipe.
const recipes = [
  r('chicken', ['main'], ['dinner']),
  r('shakshuka', ['main'], ['breakfast', 'lunch']),
  r('majadra', ['side', 'main']),
  r('israeli', ['salad', 'side'], ['breakfast', 'lunch', 'dinner']),
  r('cabbage', ['salad']),
  r('rice', ['side']),
  r('cheesecake', ['dessert'], ['dessert']),
  r('cookies', ['dessert'], ['dessert']),
  r('tahini', ['other']),
];
const bySlug = new Map(recipes.map((x) => [x.slug, x]));

function expectValid(plan: MealPlan, entries = recipes) {
  const map = new Map(entries.map((x) => [x.slug, x]));
  const slugs = Object.values(plan.picks);
  expect(new Set(slugs).size).toBe(slugs.length); // no duplicates
  for (const c of plan.courses) {
    const slug = plan.picks[c];
    if (slug) expect(map.get(slug)?.dishType).toContain(c);
  }
}

describe('fillMeal', () => {
  it('fills the default main + side + salad', () => {
    const { plan, empty } = fillMeal(recipes, emptyPlan(), seeded(1));
    expect(plan.courses).toEqual(['main', 'side', 'salad']);
    expect(empty).toEqual([]);
    expect(Object.keys(plan.picks).sort()).toEqual(['main', 'salad', 'side']);
    expectValid(plan);
  });

  it('adds dessert when requested', () => {
    const { plan } = fillMeal(recipes, emptyPlan(['main', 'salad', 'dessert']), seeded(2));
    expect(plan.courses).toEqual(['main', 'salad', 'dessert']);
    expect(['cheesecake', 'cookies']).toContain(plan.picks.dessert);
  });

  it('never uses a recipe twice, across many seeds (multi dish-type recipes)', () => {
    for (let seed = 0; seed < 300; seed++) {
      const { plan, empty } = fillMeal(recipes, emptyPlan(['main', 'side', 'salad', 'dessert']), seeded(seed));
      expect(empty).toEqual([]);
      expectValid(plan);
    }
  });

  it('a side+salad recipe fills either course, never both, and does not starve the other', () => {
    // Only "israeli" can be a salad; side must then be the other option.
    const tight = [r('israeli', ['salad', 'side']), r('majadra', ['side', 'main']), r('chicken', ['main'])];
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const { plan, empty } = fillMeal(tight, emptyPlan(), seeded(seed));
      expect(empty).toEqual([]);
      expect(plan.picks).toEqual({ main: 'chicken', side: 'majadra', salad: 'israeli' });
      seen.add(plan.picks.side!);
    }
    // The same recipe can fill either course in different meals.
    const both = [r('israeli', ['salad', 'side']), r('cabbage', ['salad']), r('rice', ['side'])];
    const sides = new Set<string>();
    const salads = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const { plan } = fillMeal(both, emptyPlan(['side', 'salad']), seeded(seed));
      expectValid(plan, both);
      sides.add(plan.picks.side!);
      salads.add(plan.picks.salad!);
    }
    expect(sides).toContain('israeli');
    expect(salads).toContain('israeli');
  });

  it('skips a course with no recipes', () => {
    const noSalad = recipes.filter((x) => !x.dishType.includes('salad'));
    const res = fillMeal(noSalad, emptyPlan(), seeded(1));
    expect(res.empty).toEqual(['salad']);
    expect(res.plan.picks.salad).toBeUndefined();
    expect(res.plan.picks.main).toBeDefined();
    expect(emptyMessage(noSalad, res.plan, 'salad')).toBe('עדיין אין מתכון מסוג סלט, אז דילגנו על המנה הזו.');
  });

  it('skips a course whose only recipes are used by other courses', () => {
    const only = [r('israeli', ['salad', 'side']), r('chicken', ['main'])];
    const res = fillMeal(only, emptyPlan(), seeded(1));
    expect(res.empty).toHaveLength(1);
    expectValid(res.plan, only);
    expect(emptyMessage(only, res.plan, res.empty[0])).toMatch(/המתכון היחיד .* כבר נמצא בארוחה/);
    const two = [r('israeli', ['salad', 'side']), r('slaw', ['salad', 'side']), r('chicken', ['main'])];
    const plan = { ...emptyPlan(['main', 'side', 'salad', 'dessert']), picks: { side: 'israeli', salad: 'slaw' } };
    expect(emptyMessage(two, plan, 'side')).toMatch(/כל המתכונים מסוג תוספת כבר נמצאים בארוחה/);
  });

  it('applies the meal filter to every course except dessert', () => {
    for (let seed = 0; seed < 100; seed++) {
      const { plan, empty } = fillMeal(recipes, emptyPlan(['main', 'side', 'salad', 'dessert'], 'breakfast'), seeded(seed));
      expect(plan.picks.main).toBe('shakshuka');
      // "israeli" is the only breakfast side and the only breakfast salad: it fills one, the other is skipped.
      expect(empty).toHaveLength(1);
      expect(plan.picks.side ?? plan.picks.salad).toBe('israeli');
      expect(['cheesecake', 'cookies']).toContain(plan.picks.dessert);
    }
    const res = fillMeal(recipes, emptyPlan(['main', 'side'], 'dinner'), seeded(5));
    for (const slug of Object.values(res.plan.picks)) expect(bySlug.get(slug)!.meal).toContain('dinner');
  });

  it('includes recipes with issues (no meal) when no meal filter is set, but not for a filter', () => {
    const noMeal = [r('mystery', ['main'], []), r('israeli', ['salad'], []), r('rice', ['side'], [])];
    expect(fillMeal(noMeal, emptyPlan(), seeded(1)).plan.picks.main).toBe('mystery');
    expect(fillMeal(noMeal, emptyPlan(['main', 'side'], 'dinner'), seeded(1)).empty).toEqual(['main', 'side']);
  });

  it('keeps valid picks and re-picks unknown / removed / wrong-type slugs', () => {
    const plan: MealPlan = {
      courses: ['main', 'side', 'salad'],
      meal: null,
      picks: { main: 'chicken', side: 'deleted-recipe', salad: 'chicken' },
      locked: [],
    };
    const res = fillMeal(recipes, plan, seeded(4));
    expect(res.plan.picks.main).toBe('chicken');
    expect(res.plan.picks.side).not.toBe('deleted-recipe');
    expect(res.plan.picks.salad).not.toBe('chicken');
    expect(res.changed.sort()).toEqual(['salad', 'side']);
    expectValid(res.plan);
  });
});

describe('re-roll and lock', () => {
  const start = () => fillMeal(recipes, emptyPlan(['main', 'side', 'salad', 'dessert']), seeded(9)).plan;

  it('re-rolling one course changes only that course, to a different recipe when possible', () => {
    const plan = start();
    for (let seed = 0; seed < 50; seed++) {
      const res = rerollCourse(recipes, plan, 'dessert', seeded(seed));
      expect(res.plan.picks.dessert).not.toBe(plan.picks.dessert);
      expect(res.changed).toEqual(['dessert']);
      for (const c of ['main', 'side', 'salad'] as Course[]) expect(res.plan.picks[c]).toBe(plan.picks[c]);
      expectValid(res.plan);
    }
  });

  it('re-rolling a course with a single option keeps it and says so', () => {
    const one = [r('chicken', ['main']), r('rice', ['side'])];
    const res0 = fillMeal(one, emptyPlan(['main', 'side']), seeded(1));
    const res = rerollCourse(one, res0.plan, 'main', seeded(2));
    expect(res.plan.picks.main).toBe('chicken');
    expect(res.changed).toEqual([]);
    expect(announce(one, res, 'main')).toBe('אין אפשרות אחרת למנה עיקרית. נשאר: CHICKEN.');
  });

  it('locked courses survive re-rolling the whole meal', () => {
    const plan = toggleLock(start(), 'main');
    expect(plan.locked).toEqual(['main']);
    for (let seed = 0; seed < 50; seed++) {
      const res = rerollAll(recipes, plan, seeded(seed));
      expect(res.plan.picks.main).toBe(plan.picks.main);
      expect(res.plan.locked).toEqual(['main']);
      expect(res.changed).not.toContain('main');
      expectValid(res.plan);
    }
  });

  it('re-rolling a locked course is a no-op; unlocking works', () => {
    const plan = toggleLock(start(), 'salad');
    expect(rerollCourse(recipes, plan, 'salad', seeded(1)).plan.picks).toEqual(plan.picks);
    expect(toggleLock(plan, 'salad').locked).toEqual([]);
  });

  it('a locked recipe that no longer matches the meal filter is kept', () => {
    const plan: MealPlan = { courses: ['main', 'side'], meal: 'breakfast', picks: { main: 'chicken' }, locked: ['main'] };
    const res = fillMeal(recipes, plan, seeded(1));
    expect(res.plan.picks.main).toBe('chicken');
    expect(res.plan.locked).toEqual(['main']);
  });

  it('a lock on a removed recipe is dropped and the course re-picked', () => {
    const plan: MealPlan = { courses: ['main', 'side'], meal: null, picks: { main: 'gone' }, locked: ['main'] };
    const res = fillMeal(recipes, plan, seeded(1));
    expect(res.plan.locked).toEqual([]);
    expect(res.plan.picks.main).toBeDefined();
    expect(res.plan.picks.main).not.toBe('gone');
  });

  it('cannot lock an empty course', () => {
    expect(toggleLock(emptyPlan(), 'main').locked).toEqual([]);
  });

  it('re-roll all avoids the previous recipes when possible', () => {
    const many = Array.from({ length: 6 }, (_, i) => [r(`m${i}`, ['main']), r(`s${i}`, ['side'])]).flat();
    const plan = fillMeal(many, emptyPlan(['main', 'side']), seeded(1)).plan;
    for (let seed = 0; seed < 50; seed++) {
      const res = rerollAll(many, plan, seeded(seed));
      expect(res.plan.picks.main).not.toBe(plan.picks.main);
      expect(res.plan.picks.side).not.toBe(plan.picks.side);
    }
  });
});

describe('courses', () => {
  it('adds and removes courses, keeping canonical order and at least 2', () => {
    let plan = start3();
    plan = setCourse(plan, 'dessert', true);
    expect(plan.courses).toEqual(['main', 'side', 'salad', 'dessert']);
    plan = setCourse(setCourse(plan, 'side', false), 'main', false);
    expect(plan.courses).toEqual(['salad', 'dessert']);
    expect(plan.picks.main).toBeUndefined();
    expect(setCourse(plan, 'salad', false)).toBe(plan); // would leave 1 course
  });

  function start3() {
    return toggleLock(fillMeal(recipes, emptyPlan(), seeded(3)).plan, 'main');
  }

  it('removing a locked course drops its lock', () => {
    expect(setCourse(start3(), 'main', false).locked).toEqual([]);
  });
});

describe('shareable URL', () => {
  it('round-trips courses, meal, picks and locks', () => {
    const plan: MealPlan = {
      courses: ['main', 'salad', 'dessert'],
      meal: 'dinner',
      picks: { main: 'chicken', salad: 'israeli', dessert: 'cheesecake' },
      locked: ['salad'],
    };
    const search = planToSearch(plan);
    expect(search).toBe('?c=main,salad,dessert&meal=dinner&main=chicken&salad=israeli&dessert=cheesecake&lock=salad');
    expect(parsePlan(search)).toEqual(plan);
    // Also after the browser percent-encodes the commas.
    expect(parsePlan(search.replaceAll(',', '%2C'))).toEqual(plan);
  });

  it('a restored plan keeps its recipes', () => {
    const plan = fillMeal(recipes, emptyPlan(['main', 'side', 'salad', 'dessert'], 'dinner'), seeded(8)).plan;
    const restored = fillMeal(recipes, parsePlan(planToSearch(plan)), seeded(99));
    expect(restored.plan).toEqual(plan);
    expect(restored.changed).toEqual([]);
  });

  it('defaults and ignores junk', () => {
    expect(parsePlan('')).toEqual(emptyPlan());
    expect(parsePlan('?c=main&main=chicken')).toEqual({ ...emptyPlan(), picks: { main: 'chicken' } }); // < 2 courses
    const p = parsePlan('?c=salad,bogus,main,main&meal=dessert&main=Bad Slug&salad=ok-1&lock=main,salad,side');
    expect(p).toEqual({ courses: ['main', 'salad'], meal: null, picks: { salad: 'ok-1' }, locked: ['salad'] });
  });

  it('unknown slugs from a shared link are re-picked', () => {
    const res = fillMeal(recipes, parsePlan('?c=main,side&main=no-such-recipe&side=rice&lock=main'), seeded(1));
    expect(res.plan.picks.side).toBe('rice');
    expect(res.plan.picks.main).toBeDefined();
    expect(res.plan.picks.main).not.toBe('no-such-recipe');
    expect(res.plan.locked).toEqual([]);
  });
});

describe('announce', () => {
  it('lists the meal and skipped courses', () => {
    const one = [r('chicken', ['main']), r('rice', ['side'])];
    const res = fillMeal(one, emptyPlan(), seeded(1));
    expect(announce(one, res)).toBe('הארוחה מוכנה. מנה עיקרית: CHICKEN. תוספת: RICE. דילגנו על: סלט.');
  });

  it('announces a replaced course', () => {
    const two = [r('chicken', ['main']), r('fish', ['main']), r('rice', ['side'])];
    const plan = { ...emptyPlan(['main', 'side']), picks: { main: 'chicken', side: 'rice' } };
    expect(announce(two, rerollCourse(two, plan, 'main', seeded(1)), 'main')).toBe('החלפנו את המנה העיקרית: FISH.');
  });
});
