// Random picks for "מתכון אקראי" (build-plan R5) and the meal builder (R6).
//
// Pure module: no DOM, no Astro imports. Randomness is injected (`Rng`) so the
// logic is unit-testable. Unit tests: tests/random.test.ts.

import type { Meal } from './labels';
import type { IndexEntry } from './index-schema';
import { isMeal } from './search';

/** Returns a number in [0, 1), like Math.random. */
export type Rng = () => number;

/** Random integer in [0, n). */
export function randomInt(n: number, rng: Rng = Math.random): number {
  return Math.min(n - 1, Math.max(0, Math.floor(rng() * n)));
}

/** Fisher-Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, rng);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface RandomOptions {
  /** Only recipes with this (known) meal value. */
  meal?: Meal | null;
  /** Slug to avoid (the recipe currently shown), unless it is the only choice. */
  avoid?: string | null;
}

/** Pick a random recipe within the meal filter, avoiding `avoid` when possible. Null if none. */
export function pickRandom<T extends Pick<IndexEntry, 'slug' | 'meal'>>(
  entries: readonly T[],
  { meal = null, avoid = null }: RandomOptions = {},
  rng: Rng = Math.random,
): T | null {
  const pool = meal ? entries.filter((e) => e.meal.includes(meal)) : [...entries];
  if (pool.length === 0) return null;
  const fresh = avoid ? pool.filter((e) => e.slug !== avoid) : pool;
  const from = fresh.length > 0 ? fresh : pool;
  return from[randomInt(from.length, rng)];
}

// ---------------------------------------------------------------------------
// URL parameters

export interface RandomParams {
  meal: Meal | null;
  /** Recipe to avoid (the one the user just saw). */
  not: string | null;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Read `?meal=...&not=...` for the /random/ page. Invalid values are ignored. */
export function parseRandomParams(search: string | URLSearchParams): RandomParams {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const meal = params.get('meal');
  const not = params.get('not');
  return { meal: isMeal(meal) ? meal : null, not: not && SLUG.test(not) ? not : null };
}

/** Query string for the /random/ page: '' or '?meal=..&not=..'. */
export function randomSearch({ meal, not }: Partial<RandomParams>): string {
  const params = new URLSearchParams();
  if (meal) params.set('meal', meal);
  if (not) params.set('not', not);
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Query string added to a recipe URL opened by the random button: '?random=1[&meal=..]'. */
export function randomlyOpenedSearch(meal: Meal | null): string {
  const params = new URLSearchParams({ random: '1' });
  if (meal) params.set('meal', meal);
  return `?${params}`;
}

/** On a recipe page: was it opened by the random button, and with which meal filter? */
export function parseRandomlyOpened(search: string | URLSearchParams): { random: boolean; meal: Meal | null } {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const meal = params.get('meal');
  return { random: params.get('random') === '1', meal: isMeal(meal) ? meal : null };
}
