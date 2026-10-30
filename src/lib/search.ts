// Hebrew-aware client-side search (build-plan R4).
//
// Pure module: no DOM, no Astro imports. Used at build time (to normalize the
// text stored in the recipe index) and in the browser (to match and rank).
// Unit tests: tests/search.test.ts.

import { MEALS, type Meal } from './labels';
import type { IndexEntry } from './index-schema';

// ---------------------------------------------------------------------------
// Normalization

/** Hebrew punctuation marks inside the niqqud block that separate words. */
const HEBREW_PUNCT = /[־׀׃׆]/g; // maqaf, paseq, sof pasuq, nun hafukha
/** Niqqud and cantillation marks (removed, they never separate words). */
const NIQQUD = /[֑-ׇ]/g;
/** Apostrophes / geresh / gershayim join a word: מג'דרה -> מגדרה, צה"ל -> צהל. */
const JOINERS = /['"`׳״‘’“”]/g;
/** Bidi / zero-width control characters. */
const CONTROLS = /[​-‏‪-‮⁦-⁩﻿]/g;

const FINAL_LETTERS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/**
 * Normalize text for matching: strip niqqud, punctuation and control chars,
 * map final letters to their regular form, lowercase Latin, collapse spaces.
 * Returns space-separated words.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(CONTROLS, '')
    .replace(HEBREW_PUNCT, ' ')
    .replace(NIQQUD, '')
    .replace(JOINERS, '')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (c) => FINAL_LETTERS[c])
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(' ') : [];
}

// ---------------------------------------------------------------------------
// Attached prefixes (ו, ה, ב, ל, מ, ש, כ and combinations: וה, וב, שב, ...)

export const PREFIX_LETTERS = 'והבלמשכ';
const MAX_PREFIX = 3;
const MIN_STEM = 3;

/**
 * The word itself plus every form left after stripping 1..3 leading prefix
 * letters, as long as at least 3 letters remain (2-letter stems caused false
 * hits such as חם -> לחם).
 *   והבצל -> [והבצל, הבצל, בצל]
 */
export function variants(word: string): string[] {
  const out = [word];
  for (let i = 0; i < MAX_PREFIX && i < word.length; i++) {
    if (!PREFIX_LETTERS.includes(word[i])) break;
    const rest = word.slice(i + 1);
    if (rest.length < MIN_STEM) break;
    out.push(rest);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matching and ranking

export const FIELDS = ['title', 'ingredients', 'body'] as const;
export type Field = (typeof FIELDS)[number];

/** title > ingredients > body. Weights are far apart so a weaker match in a
 *  higher field still outranks a stronger match in a lower one. */
export const FIELD_WEIGHT: Record<Field, number> = { title: 100, ingredients: 10, body: 1 };

/** How well a query word matched a document word. */
export const STRENGTH = {
  exact: 1, //        בצל  ~ בצל / הבצל / ובצל
  prefix: 0.6, //     בצל  ~ בצלים / ובצלים   (still typing, plural, ...)
  queryPrefix: 0.5, // הבצל ~ בצל              (prefix typed in the query)
} as const;

const MIN_TERM = 2;

export interface PreparedField {
  /** Every variant of every word in the field. */
  forms: Set<string>;
  formList: string[];
}

export interface Prepared<T extends Pick<IndexEntry, 'text' | 'meal'> = IndexEntry> {
  entry: T;
  fields: Record<Field, PreparedField>;
}

function prepareField(normalized: string): PreparedField {
  const forms = new Set<string>();
  for (const word of normalized ? normalized.split(' ') : []) {
    for (const v of variants(word)) forms.add(v);
  }
  return { forms, formList: [...forms] };
}

/** Precompute word forms for each entry (do once after loading the index). */
export function prepare<T extends Pick<IndexEntry, 'text' | 'meal'>>(entries: T[]): Prepared<T>[] {
  return entries.map((entry) => ({
    entry,
    fields: {
      title: prepareField(normalize(entry.text.title)),
      ingredients: prepareField(normalize(entry.text.ingredients)),
      body: prepareField(normalize(entry.text.body)),
    },
  }));
}

/** Query words to match (normalized, de-duplicated, 1-letter words dropped). */
export function queryTerms(query: string): string[] {
  return [...new Set(tokenize(query))].filter((t) => t.length >= MIN_TERM);
}

/** Strength (0..1) of the best match of one query term in one field. */
export function matchField(field: PreparedField, term: string): number {
  if (field.forms.has(term)) return STRENGTH.exact;
  for (const form of field.formList) {
    if (form.startsWith(term)) return STRENGTH.prefix;
  }
  // The user typed a prefix (הבצל): try the query's own stems (3+ letters).
  const stems = variants(term).slice(1);
  for (const stem of stems) {
    if (field.forms.has(stem)) return STRENGTH.queryPrefix;
  }
  for (const stem of stems) {
    for (const form of field.formList) {
      if (form.startsWith(stem)) return STRENGTH.queryPrefix * STRENGTH.prefix;
    }
  }
  return 0;
}

/**
 * Score an entry against query terms. Every term must match somewhere (AND);
 * returns 0 if any term is missing. Each term contributes its best
 * field weight x match strength.
 */
export function scoreEntry(p: Prepared<Pick<IndexEntry, 'text' | 'meal'>>, terms: string[]): number {
  let total = 0;
  for (const term of terms) {
    let best = 0;
    for (const f of FIELDS) {
      const s = matchField(p.fields[f], term);
      if (s) best = Math.max(best, FIELD_WEIGHT[f] * s);
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Search state (query + meal filter), shared with the URL

export interface SearchState {
  q: string;
  meal: Meal | null;
}

export function isMeal(value: unknown): value is Meal {
  return typeof value === 'string' && (MEALS as readonly string[]).includes(value);
}

/** Read `?q=...&meal=...`. Unknown meals are ignored. */
export function parseState(search: string | URLSearchParams): SearchState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const meal = params.get('meal');
  return { q: (params.get('q') ?? '').trim(), meal: isMeal(meal) ? meal : null };
}

/** Build the query string for a state: '' when nothing is active, else '?q=..&meal=..'. */
export function stateToSearch(state: SearchState): string {
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q) params.set('q', q);
  if (state.meal) params.set('meal', state.meal);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function isActive(state: SearchState): boolean {
  return queryTerms(state.q).length > 0 || state.meal !== null;
}

/**
 * Apply meal filter and search. With no query terms the original (index)
 * order is kept; otherwise results are sorted by score, ties keep index order.
 */
export function search<T extends Pick<IndexEntry, 'text' | 'meal'>>(prepared: Prepared<T>[], state: SearchState): T[] {
  const terms = queryTerms(state.q);
  const pool = state.meal ? prepared.filter((p) => p.entry.meal.includes(state.meal as Meal)) : prepared;
  if (terms.length === 0) return pool.map((p) => p.entry);
  return pool
    .map((p, i) => ({ p, i, score: scoreEntry(p, terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.p.entry);
}

// ---------------------------------------------------------------------------
// Build-time helpers

/** Standard section headings that every recipe has; not useful to search. */
const SECTION_HEADINGS = /^#{1,6}\s*(?:אופן ההכנה|הערות|מצרכים)\s*:?\s*$/gm;

/** Markdown to plain text, good enough for search (markup is dropped by normalize()). */
export function markdownToText(md: string): string {
  return md
    .replace(SECTION_HEADINGS, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> text
    .replace(/<[^>]+>/g, ' ') // html tags
    .replace(/https?:\/\/\S+/g, ' ');
}

// ---------------------------------------------------------------------------
// UI text

/** Text for the result-count live region. */
export function resultMessage(count: number, active: boolean): string {
  if (!active) return count === 1 ? 'מתכון אחד' : `${count} מתכונים`;
  if (count === 0) return 'לא נמצאו מתכונים';
  if (count === 1) return 'נמצא מתכון אחד';
  return `נמצאו ${count} מתכונים`;
}
