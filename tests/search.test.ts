import { describe, expect, it } from 'vitest';
import {
  FIELD_WEIGHT,
  isActive,
  markdownToText,
  matchField,
  normalize,
  parseState,
  prepare,
  queryTerms,
  resultMessage,
  search,
  stateToSearch,
  tokenize,
  variants,
} from '../src/lib/search';
import type { IndexEntry } from '../src/lib/index-schema';
import type { Meal } from '../src/lib/labels';

type Doc = Pick<IndexEntry, 'slug' | 'meal' | 'text'>;
const doc = (slug: string, meal: Meal[], title: string, ingredients = '', body = ''): Doc => ({
  slug,
  meal,
  text: { title: normalize(title), ingredients: normalize(ingredients), body: normalize(body) },
});
const slugs = (docs: Doc[]) => docs.map((d) => d.slug);
const field = (text: string) => prepare([doc('x', [], text)])[0].fields.title;

describe('normalize', () => {
  it('strips niqqud and cantillation', () => {
    expect(normalize('בָּצָל')).toBe('בצל');
    expect(normalize('שָׁלוֹם')).toBe('שלומ');
  });

  it('maps final letters to regular forms', () => {
    expect(normalize('ךםןףץ')).toBe('כמנפצ');
    expect(normalize('לימון')).toBe(normalize('לימונ'));
  });

  it('strips punctuation and splits on maqaf / hyphens', () => {
    expect(normalize('בצל, שום; (ועגבניות)!')).toBe('בצל שומ ועגבניות');
    expect(normalize('כ־15 דקות')).toBe('כ 15 דקות');
    expect(normalize('ל-170 מעלות.')).toBe('ל 170 מעלות');
  });

  it('joins words around geresh / gershayim / apostrophes', () => {
    expect(normalize("מג'דרה")).toBe('מגדרה');
    expect(normalize('מג׳דרה')).toBe('מגדרה');
    expect(normalize('צה"ל')).toBe('צהל');
  });

  it('lowercases Latin, keeps digits, drops control chars', () => {
    expect(normalize('Pesto 5%‏')).toBe('pesto 5');
    expect(tokenize('  ')).toEqual([]);
  });
});

describe('variants (attached prefixes)', () => {
  it('strips single and combined prefixes', () => {
    expect(variants('ובצל')).toContain('בצל');
    expect(variants('הבצל')).toContain('בצל');
    expect(variants('לבצל')).toContain('בצל');
    expect(variants('והבצל')).toContain('בצל');
    expect(variants('שבבצל')).toContain('בצל');
    expect(variants('מהבצל')).toContain('בצל');
    expect(variants('כשהבצל')).toContain('בצל');
  });

  it('keeps the word itself and never leaves less than 3 letters', () => {
    expect(variants('בצל')[0]).toBe('בצל');
    expect(variants('של')).toEqual(['של']);
    expect(variants('ובצל')).toEqual(['ובצל', 'בצל']);
    expect(variants('לחם')).toEqual(['לחם']);
  });

  it('stops at the first non-prefix letter', () => {
    expect(variants('עגבניה')).toEqual(['עגבניה']);
    expect(variants('בצלים')).toEqual(['בצלים', 'צלים']);
  });
});

describe('matchField', () => {
  it('matches words with attached prefixes exactly', () => {
    for (const w of ['בצל', 'ובצל', 'הבצל', 'לבצל', 'והבצל']) {
      expect(matchField(field(`מטגנים את ${w} בשמן`), 'בצל')).toBe(1);
    }
  });

  it('matches word starts (plural, still typing) more weakly', () => {
    expect(matchField(field('3 בצלים גדולים'), 'בצל')).toBeGreaterThan(0);
    expect(matchField(field('3 בצלים גדולים'), 'בצל')).toBeLessThan(1);
    expect(matchField(field('שמן זית'), 'זי')).toBeGreaterThan(0);
  });

  it('accepts a prefix typed in the query, also with a plural in the text', () => {
    expect(matchField(field('3 בצלים'), 'הבצל')).toBeGreaterThan(0);
    expect(matchField(field('1 בצל גדול'), 'הבצל')).toBeGreaterThan(0);
    expect(matchField(field('1 בצל גדול'), 'ובצל')).toBeGreaterThan(0);
  });

  it('does not match unrelated words', () => {
    expect(matchField(field('עגבניות ומלפפונים'), 'בצל')).toBe(0);
    expect(matchField(field('צלי בקר'), 'בצל')).toBe(0);
    // 2-letter stems are not indexed: "hot" must not find bread / salt.
    expect(matchField(field('לחם ומלח'), 'חמ')).toBe(0);
    expect(matchField(field('לחם ומלח'), 'לח')).toBeGreaterThan(0); // word start of לחם is fine
  });
});

describe('queryTerms', () => {
  it('normalizes, de-duplicates and drops 1-letter words', () => {
    expect(queryTerms('  בָּצָל ו בצל, שום ')).toEqual(['בצל', 'שומ']);
    expect(queryTerms('ו')).toEqual([]);
  });
});

describe('search', () => {
  const docs = [
    doc('a-body', ['dinner'], 'מג׳דרה', 'עדשים, אורז', 'מוסיפים את הבצל בסוף'),
    doc('b-ingredient', ['lunch', 'dinner'], 'שקשוקה', '1 בצל גדול, 4 ביצים', 'מטגנים'),
    doc('c-title', ['lunch'], 'בצל ממולא', 'אורז', 'ממלאים'),
    doc('d-none', ['dessert'], 'עוגת גבינה', 'גבינה, סוכר', 'אופים'),
    doc('e-prefixed', ['breakfast'], 'סלט', 'עגבניות ובצל', ''),
  ];
  const prepared = prepare(docs);

  it('finds every recipe containing the word with or without prefixes', () => {
    const r = slugs(search(prepared, { q: 'בצל', meal: null }));
    expect(r).toHaveLength(4);
    expect(r).not.toContain('d-none');
    expect(r).toContain('e-prefixed');
  });

  it('ranks title > ingredients > body', () => {
    const r = slugs(search(prepared, { q: 'בצל', meal: null }));
    expect(r[0]).toBe('c-title');
    expect(r.indexOf('b-ingredient')).toBeLessThan(r.indexOf('a-body'));
    expect(r.indexOf('e-prefixed')).toBeLessThan(r.indexOf('a-body'));
    expect(FIELD_WEIGHT.title).toBeGreaterThan(FIELD_WEIGHT.ingredients);
    expect(FIELD_WEIGHT.ingredients).toBeGreaterThan(FIELD_WEIGHT.body);
  });

  it('a prefix match in the title still beats an exact ingredient match', () => {
    const p = prepare([doc('ing', [], 'פשטידה', 'בצל'), doc('title', [], 'בצלים מקורמלים')]);
    expect(slugs(search(p, { q: 'בצל', meal: null }))).toEqual(['title', 'ing']);
  });

  it('requires every query word (AND)', () => {
    expect(slugs(search(prepared, { q: 'בצל ביצים', meal: null }))).toEqual(['b-ingredient']);
    expect(search(prepared, { q: 'בצל שוקולד', meal: null })).toEqual([]);
  });

  it('meal filter alone keeps index order', () => {
    expect(slugs(search(prepared, { q: '', meal: 'dinner' }))).toEqual(['a-body', 'b-ingredient']);
    expect(slugs(search(prepared, { q: '', meal: null }))).toEqual(slugs(docs));
  });

  it('combines meal filter with search', () => {
    expect(slugs(search(prepared, { q: 'בצל', meal: 'lunch' }))).toEqual(['c-title', 'b-ingredient']);
    expect(slugs(search(prepared, { q: 'בצל', meal: 'dessert' }))).toEqual([]);
  });

  it('matches regardless of niqqud and final letters in the query', () => {
    expect(slugs(search(prepared, { q: 'גְּבִינָה', meal: null }))).toEqual(['d-none']);
    expect(slugs(search(prepared, { q: "מג'דרה", meal: null }))).toEqual(['a-body']);
  });

  it('ties keep index order', () => {
    const p = prepare([doc('x', [], 'סלט א', 'מלח'), doc('y', [], 'סלט ב', 'מלח')]);
    expect(slugs(search(p, { q: 'מלח', meal: null }))).toEqual(['x', 'y']);
  });
});

describe('URL state', () => {
  it('parses q and a known meal', () => {
    expect(parseState('?q=%D7%91%D7%A6%D7%9C&meal=dinner')).toEqual({ q: 'בצל', meal: 'dinner' });
    expect(parseState(new URLSearchParams('q=+x+'))).toEqual({ q: 'x', meal: null });
  });

  it('ignores unknown or empty meals', () => {
    expect(parseState('?meal=brunch').meal).toBeNull();
    expect(parseState('?meal=').meal).toBeNull();
    expect(parseState('').meal).toBeNull();
  });

  it('round-trips through the query string', () => {
    const state = { q: 'בצל ירוק', meal: 'lunch' as const };
    expect(parseState(stateToSearch(state))).toEqual(state);
    expect(stateToSearch({ q: '  ', meal: null })).toBe('');
    expect(stateToSearch({ q: '', meal: 'dessert' })).toBe('?meal=dessert');
  });

  it('isActive is false for empty or 1-letter queries without a meal', () => {
    expect(isActive({ q: '', meal: null })).toBe(false);
    expect(isActive({ q: 'ו', meal: null })).toBe(false);
    expect(isActive({ q: 'בצל', meal: null })).toBe(true);
    expect(isActive({ q: '', meal: 'dinner' })).toBe(true);
  });
});

describe('resultMessage', () => {
  it('uses correct Hebrew singular/plural', () => {
    expect(resultMessage(6, false)).toBe('6 מתכונים');
    expect(resultMessage(1, false)).toBe('מתכון אחד');
    expect(resultMessage(0, true)).toBe('לא נמצאו מתכונים');
    expect(resultMessage(1, true)).toBe('נמצא מתכון אחד');
    expect(resultMessage(3, true)).toBe('נמצאו 3 מתכונים');
  });
});

describe('markdownToText', () => {
  it('drops standard headings, link targets and html', () => {
    const t = normalize(markdownToText('## אופן ההכנה\n\n1. [בצל](https://x.y/z) <b>טרי</b>\n\n## הערות\nטעים ![תמונה](a.png)'));
    expect(t).toBe('1 בצל טרי טעימ תמונה');
  });

  it('keeps custom headings', () => {
    expect(normalize(markdownToText('### לציפוי\nשוקולד'))).toBe('לציפוי שוקולד');
  });
});
