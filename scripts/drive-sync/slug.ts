// English URL slugs for recipes (build-plan R1/R7): the doc's `slug` field when
// valid, otherwise a transliteration of the Hebrew title. Transliteration of
// unvowelled Hebrew is approximate — a nicer URL can always be set with the
// template's slug field.

/** Same rule as the content schema (src/content.config.ts). */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_LEN = 60;

export function isValidSlug(s: unknown): s is string {
  return typeof s === 'string' && s.length <= 80 && SLUG_RE.test(s);
}

/** Lower-case, trim and join words with "-" — turns "Grandma Cheesecake" into a valid slug. */
export function cleanSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const PLAIN: Record<string, string> = {
  א: 'a', ג: 'g', ד: 'd', ה: 'h', ז: 'z', ח: 'ch', ט: 't', ל: 'l', מ: 'm', ם: 'm', נ: 'n', ן: 'n',
  ס: 's', ע: 'a', צ: 'tz', ץ: 'tz', ק: 'k', ר: 'r', ש: 'sh', ת: 't', ך: 'ch', ף: 'f',
};
const GERESH: Record<string, string> = { ג: 'j', ז: 'zh', צ: 'ch', ץ: 'ch', ת: 't', ש: 'sh', ח: 'ch' };

function transliterateWord(word: string): string {
  const chars = [...word];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const next = chars[i + 1];
    const first = i === 0;
    const last = i === chars.length - 1;
    if (/[a-z0-9]/.test(c)) {
      out += c;
      continue;
    }
    if ((next === "'" || next === '׳') && GERESH[c]) {
      out += GERESH[c];
      i++;
      continue;
    }
    // Silent letters carrying a vowel: עוף -> of, אורז -> orz, אילן -> ilan.
    if ((c === 'א' || c === 'ע') && (next === 'ו' || next === 'י') && chars[i + 2] !== next) {
      out += next === 'ו' ? 'o' : 'i';
      i++;
      continue;
    }
    switch (c) {
      case 'ב':
        out += first ? 'b' : 'v';
        break;
      case 'כ':
        out += first ? 'k' : 'ch';
        break;
      case 'פ':
        out += first ? 'p' : 'f';
        break;
      case 'ו':
        if (next === 'ו') {
          out += 'v';
          i++;
        } else out += first ? 'v' : 'o';
        break;
      case 'י':
        if (next === 'י') {
          out += 'y';
          i++;
        } else out += first ? 'y' : 'i';
        break;
      case 'ה':
        out += last && !first ? 'a' : 'h';
        break;
      default:
        out += PLAIN[c] ?? '';
    }
  }
  return out;
}

/** Transliterate a (Hebrew) title into an English slug. Never returns an empty string. */
export function slugFromTitle(title: string): string {
  const words = title
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '') // niqqud and cantillation
    .toLowerCase()
    .replace(/[״"]/g, '')
    .split(/[^a-z0-9א-ת'׳]+/)
    .map(transliterateWord)
    .filter(Boolean);
  let slug = '';
  for (const w of words) {
    const next = slug ? `${slug}-${w}` : w;
    if (next.length > MAX_LEN) break;
    slug = next;
  }
  if (!slug && words[0]) slug = words[0].slice(0, MAX_LEN);
  return cleanSlug(slug) || 'recipe';
}

/** First of base, base-2, base-3, ... that is not taken. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
