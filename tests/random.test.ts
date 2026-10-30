import { describe, expect, it } from 'vitest';
import {
  parseRandomParams,
  parseRandomlyOpened,
  pickRandom,
  randomInt,
  randomSearch,
  randomlyOpenedSearch,
  shuffle,
} from '../src/lib/random';
import { seeded } from './helpers';
import type { Meal } from '../src/lib/labels';

const r = (slug: string, meal: Meal[]) => ({ slug, meal });
const recipes = [r('a', ['breakfast']), r('b', ['dinner']), r('c', ['dinner', 'lunch']), r('d', ['dessert'])];

describe('randomInt / shuffle', () => {
  it('stays in range even for rng() edge values', () => {
    expect(randomInt(3, () => 0)).toBe(0);
    expect(randomInt(3, () => 0.999999)).toBe(2);
    expect(randomInt(3, () => 1)).toBe(2);
  });

  it('shuffle keeps every item and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, seeded(1));
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('pickRandom', () => {
  it('picks from all recipes without a filter', () => {
    const seen = new Set<string>();
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) seen.add(pickRandom(recipes, {}, rng)!.slug);
    expect([...seen].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('stays within the meal filter', () => {
    const rng = seeded(3);
    for (let i = 0; i < 100; i++) expect(['b', 'c']).toContain(pickRandom(recipes, { meal: 'dinner' }, rng)!.slug);
  });

  it('avoids the current recipe when another one is available', () => {
    const rng = seeded(11);
    for (let i = 0; i < 100; i++) expect(pickRandom(recipes, { meal: 'dinner', avoid: 'b' }, rng)!.slug).toBe('c');
    for (let i = 0; i < 100; i++) expect(pickRandom(recipes, { avoid: 'a' }, rng)!.slug).not.toBe('a');
  });

  it('returns the current recipe when it is the only choice', () => {
    expect(pickRandom(recipes, { meal: 'breakfast', avoid: 'a' }, seeded(1))!.slug).toBe('a');
  });

  it('returns null when nothing matches', () => {
    expect(pickRandom([], {})).toBeNull();
    expect(pickRandom([r('x', [])], { meal: 'dinner' })).toBeNull();
  });
});

describe('random URL params', () => {
  it('round-trips meal and not', () => {
    const s = randomSearch({ meal: 'dinner', not: 'roast-chicken' });
    expect(s).toBe('?meal=dinner&not=roast-chicken');
    expect(parseRandomParams(s)).toEqual({ meal: 'dinner', not: 'roast-chicken' });
    expect(randomSearch({})).toBe('');
  });

  it('ignores invalid values', () => {
    expect(parseRandomParams('?meal=brunch&not=<script>')).toEqual({ meal: null, not: null });
  });

  it('marks recipe pages opened at random', () => {
    expect(randomlyOpenedSearch('lunch')).toBe('?random=1&meal=lunch');
    expect(parseRandomlyOpened('?random=1&meal=lunch')).toEqual({ random: true, meal: 'lunch' });
    expect(parseRandomlyOpened(randomlyOpenedSearch(null))).toEqual({ random: true, meal: null });
    expect(parseRandomlyOpened('')).toEqual({ random: false, meal: null });
  });
});
