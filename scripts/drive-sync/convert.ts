// Google Doc (HTML export) -> recipe draft (fields, ingredients, Markdown body with
// image placeholders). Pure and DOM-free; never throws on content: anything it does
// not recognise goes to the body. See docs/build-plan.md R2, R3, R7.
import { parseGoogleDocHtml, splitLines, type Block, type Seg } from './gdoc-html.ts';
import { allBold, escapeMd, markdown, normLabel, plain, plainLine } from './text.ts';

export interface RecipeFields {
  meal: string[];
  dishType: string[];
  author?: string;
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  /** Raw value of the doc's slug field (validated by the sync). */
  slug?: string;
  tags: string[];
}

export type BodyPart = { md: string } | { image: string };

export interface RecipeDraft {
  title: string;
  fields: RecipeFields;
  ingredients: string[];
  /** Body in document order; image parts are placeholders resolved when written. */
  body: BodyPart[];
  /** Image sources (relative paths inside the export) in order of appearance. */
  images: string[];
  /** Notes about the conversion, for the sync summary. */
  notes: string[];
}

type FieldKey = 'meal' | 'dishType' | 'author' | 'servings' | 'prepTime' | 'cookTime' | 'slug' | 'tags';
type SectionKey = 'ingredients' | 'steps' | 'notes';

const FIELD_LABELS: Record<FieldKey, string[]> = {
  meal: ['ארוחה', 'ארוחות', 'הארוחה', 'סוג ארוחה', 'סוג הארוחה', 'לאיזו ארוחה', 'meal'],
  dishType: ['סוג מנה', 'סוג המנה', 'סוג מנות', 'סוג', 'מנה', 'dish type', 'dishtype', 'type'],
  author: ['מאת', 'מחבר', 'מחברת', 'ממי', 'מקור', 'המתכון של', 'מתכון של', 'author', 'from'],
  servings: ['מנות', 'מספר מנות', 'כמות מנות', 'כמות', 'מספר סועדים', 'סועדים', 'servings', 'yield'],
  prepTime: ['זמן הכנה', 'זמן ההכנה', 'prep', 'prep time', 'preptime'],
  cookTime: ['זמן בישול', 'זמן הבישול', 'זמן אפייה', 'זמן אפיה', 'זמן האפייה', 'זמן האפיה', 'זמן בישול אפייה', 'cook time', 'cooktime'],
  slug: ['slug', 'כתובת', 'כתובת באנגלית', 'כתובת url', 'url', 'שם באנגלית', 'כתובת לאתר'],
  tags: ['תגיות', 'תגים', 'תגית', 'tags'],
};

const SECTION_LABELS: Record<SectionKey, string[]> = {
  ingredients: ['מצרכים', 'המצרכים', 'רכיבים', 'הרכיבים', 'מרכיבים', 'המרכיבים', 'חומרים', 'החומרים', 'רשימת מצרכים', 'מצרכים למתכון', 'ingredients'],
  steps: ['אופן ההכנה', 'אופן הכנה', 'הוראות הכנה', 'הוראות ההכנה', 'הכנה', 'ההכנה', 'דרך ההכנה', 'דרך הכנה', 'שלבי הכנה', 'שלבי ההכנה', 'preparation', 'instructions', 'method'],
  notes: ['הערות', 'הערה', 'טיפים', 'טיפ', 'הערות וטיפים', 'טיפים והערות', 'notes', 'tips'],
};

const SECTION_TITLES: Record<SectionKey, string> = { ingredients: 'מצרכים', steps: 'אופן ההכנה', notes: 'הערות' };

const lookup = <K extends string>(table: Record<K, string[]>) => {
  const m = new Map<string, K>();
  for (const [k, labels] of Object.entries(table) as Array<[K, string[]]>) for (const l of labels) m.set(normLabel(l), k);
  return (s: string): K | undefined => m.get(normLabel(s));
};
const fieldFor = lookup(FIELD_LABELS);
const sectionFor = lookup(SECTION_LABELS);

/** Split a multi-value field ("ארוחת צהריים, ארוחת ערב" / list lines / "a או b"). */
export function splitValues(raw: string): string[] {
  return raw
    .split(/[,،;/|\n]+|\s+או\s+|\s+or\s+/)
    .map((v) => v.replace(/^[\s\-–—•*#]+|[\s.]+$/g, '').trim())
    .filter((v) => v !== '' && !/^[-–—_.]+$/.test(v));
}

const BULLET = /^[\s\-–—•*·▪●○◦]+(?=\S)/;

interface Ctx {
  fields: RecipeFields;
  seen: Set<FieldKey>;
  notes: string[];
}

/** Store a field value; returns false when the field was already set (the line then stays in the body). */
function setField(ctx: Ctx, key: FieldKey, value: string): boolean {
  if (ctx.seen.has(key)) return false;
  ctx.seen.add(key);
  const v = value.trim();
  if (key === 'meal' || key === 'dishType') ctx.fields[key] = splitValues(v);
  else if (key === 'tags') ctx.fields.tags = splitValues(v.replace(/#/g, ''));
  else if (v && !/^[-–—_.]+$/.test(v)) ctx.fields[key] = v.replace(/\s*\n\s*/g, ' ');
  return true;
}

/** "label: value" on one line, with a known label. */
function labelValue(line: string): { key: FieldKey; value: string } | undefined {
  const m = /^([^:：]{1,40})[:：](.*)$/s.exec(line);
  if (!m) return undefined;
  const key = fieldFor(m[1]);
  return key ? { key, value: m[2].trim() } : undefined;
}

/** A heading or a single short line that names a known section (bold or "name:" form). */
function sectionOf(block: Block): { key: SectionKey; level: number } | undefined {
  if (block.kind === 'heading') {
    const key = sectionFor(plainLine(block.runs));
    return key ? { key, level: block.level } : undefined;
  }
  if (block.kind === 'paragraph') {
    const text = plain(block.runs);
    if (text.includes('\n') || text.length > 40) return undefined;
    // A line that is exactly a section name ("מצרכים", bold or not, with or without ":") acts as a heading.
    const key = sectionFor(text);
    if (key) return { key, level: 99 };
  }
  return undefined;
}

/** Details table: label | value rows (or a header row of labels over a row of values). */
function readDetailsTable(rows: Seg[][][][], ctx: Ctx): { leftovers: string[]; matched: number } {
  const cellText = (cell: Seg[][]) => cell.map(plain).join('\n').trim();
  const text = rows.map((r) => r.map(cellText));
  const leftovers: string[] = [];
  let matched = 0;
  const twoRowLayout = text.length === 2 && isLabelRow(text[0]) && !fieldFor(text[1][0] ?? '');
  const pairs: Array<[string, string]> = twoRowLayout
    ? text[0].map((label, i) => [label, text[1][i] ?? ''])
    : text.map((r) => {
        if (r.length >= 2) return [r[0], r.slice(1).filter(Boolean).join(', ')];
        const lv = /^([^:：]{1,40})[:：](.*)$/s.exec(r[0] ?? '');
        return lv ? [lv[1], lv[2]] : [r[0] ?? '', ''];
      });
  for (const [label, value] of pairs) {
    const key = fieldFor(label);
    if (key && setField(ctx, key, value)) matched++;
    else if (label.trim() || value.trim()) {
      leftovers.push(value.trim() ? `**${escapeMd(label.trim())}:** ${escapeMd(value.trim())}` : escapeMd(label.trim()));
    }
  }
  return { leftovers, matched };
}

/** A header row: at least two cells, each a known field label. */
function isLabelRow(cells: string[]): boolean {
  return cells.length >= 2 && cells.filter((c) => fieldFor(c)).length >= 2;
}

function tableLooksLikeDetails(rows: Seg[][][][]): boolean {
  const text = rows.map((r) => r.map((cell) => cell.map(plain).join('\n').trim()));
  if (text.length > 0 && isLabelRow(text[0])) return true;
  return text.some((r) => r.length > 0 && (fieldFor(r[0]) !== undefined || labelValue(r[0]) !== undefined));
}

function tableMarkdown(rows: Seg[][][][]): string {
  const cells = rows.map((r) => r.map((cell) => cell.map((l) => markdown(l)).join(' / ').replace(/\s*\n\s*/g, ' ')));
  const width = Math.max(...cells.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
  const line = (r: string[]) => `| ${pad(r).join(' | ')} |`;
  return [line(cells[0]), line(Array(width).fill('---')), ...cells.slice(1).map(line)].join('\n');
}

function listMarkdown(block: Extract<Block, { kind: 'list' }>): string {
  let n = block.start;
  return block.items
    .map((item) => {
      const indent = '   '.repeat(Math.min(item.depth, 4));
      const text = markdown(item.runs).replace(/ {2}\n/g, ' ');
      if (block.ordered && item.depth === 0) return `${indent}${n++}. ${text}`;
      return `${indent}${block.ordered ? '1.' : '-'} ${text}`;
    })
    .join('\n');
}

function ingredientText(segs: Seg[]): string {
  return plainLine(segs).replace(BULLET, '').trim();
}

export interface ConvertInput {
  /** The Google Doc's name = recipe title. */
  title: string;
  html: string;
}

/** Template instruction lines: "הנחיה: ..." or "(הנחיה ...)". */
const HINT = /^\(?\s*הנחיה(?=[\s:：)]|$)/;
export const TEMPLATE_NAME = 'תבנית מתכון';

export function convertDoc({ title: rawTitle, html }: ConvertInput): RecipeDraft {
  // "עותק של ..." / "Copy of ..." is what Drive calls a copied template.
  const title =
    rawTitle
      .replace(/\.(docx?|gdoc)$/i, '')
      .replace(/^\s*(עותק של|copy of)\s+/i, '')
      .trim() || 'מתכון ללא שם';
  const ctx: Ctx = { fields: { meal: [], dishType: [], tags: [] }, seen: new Set(), notes: [] };
  if (normLabel(title) === normLabel(TEMPLATE_NAME)) ctx.notes.push('שם המסמך עדיין "תבנית מתכון" — יש לשנות אותו לשם המתכון');
  const ingredients: string[] = [];
  const body: BodyPart[] = [];
  const images: string[] = [];
  let blocks: Block[] = [];
  try {
    blocks = parseGoogleDocHtml(html);
  } catch (e) {
    ctx.notes.push(`לא ניתן היה לקרוא את המסמך (${(e as Error).message})`);
  }

  // Drop a leading title (Title style or heading) that repeats the doc name.
  const firstText = blocks.findIndex((b) => b.kind !== 'image');
  const first = blocks[firstText];
  if (first && (first.kind === 'heading' || first.kind === 'paragraph') && normLabel(plainLine(first.runs)) === normLabel(title)) {
    blocks.splice(firstText, 1);
  }

  let section: { key: SectionKey; level: number } | undefined;
  let seenSection = false;
  let detailsTableDone = false;
  let foundIngredients = false;

  for (const block of blocks) {
    // Template instructions ("הנחיה: ...") never reach the site.
    if ((block.kind === 'paragraph' || block.kind === 'heading') && HINT.test(plainLine(block.runs))) continue;
    if (block.kind === 'image') {
      if (!images.includes(block.src)) images.push(block.src);
      body.push({ image: block.src });
      continue;
    }

    const sec = sectionOf(block);
    if (sec) {
      section = sec;
      seenSection = true;
      if (sec.key === 'ingredients') foundIngredients = true;
      else body.push({ md: `## ${SECTION_TITLES[sec.key]}` });
      continue;
    }

    // An unknown heading at the same or a higher level ends the current section.
    if (block.kind === 'heading' && section && (section.level === 99 || block.level <= section.level)) {
      section = undefined;
    }

    if (section?.key === 'ingredients') {
      if (block.kind === 'list') ingredients.push(...block.items.map((i) => ingredientText(i.runs)).filter(Boolean));
      else if (block.kind === 'paragraph' || block.kind === 'heading') {
        const lines = splitLines(block.runs).map(ingredientText).filter(Boolean);
        // A sub-heading inside the ingredients ("לבצק") becomes a group label.
        if (block.kind === 'heading' || (lines.length === 1 && allBold(block.runs) && lines[0].length <= 30)) {
          ingredients.push(lines.join(' ').replace(/[:：]?$/, ':'));
        } else ingredients.push(...lines);
      } else if (block.kind === 'table') {
        for (const row of block.rows) {
          const item = row.map((cell) => cell.map(ingredientText).join(' ')).filter(Boolean).join(' ');
          if (item) ingredients.push(item);
        }
      }
      continue;
    }

    // Details before the first section: the template table, or "label: value" lines.
    if (!seenSection && block.kind === 'table' && !detailsTableDone && tableLooksLikeDetails(block.rows)) {
      detailsTableDone = true;
      const { leftovers } = readDetailsTable(block.rows, ctx);
      if (leftovers.length) body.push({ md: leftovers.join('  \n') });
      continue;
    }
    if (!seenSection && block.kind === 'paragraph') {
      const kept: Seg[][] = [];
      for (const line of splitLines(block.runs)) {
        const lv = labelValue(plain(line));
        if (!(lv && setField(ctx, lv.key, lv.value))) kept.push(line);
      }
      if (kept.length) body.push({ md: kept.map((l) => markdown(l)).join('  \n') });
      continue;
    }

    body.push({ md: blockMarkdown(block) });
  }

  if (!foundIngredients) ctx.notes.push('לא נמצאה כותרת "מצרכים"');
  else if (ingredients.length === 0) ctx.notes.push('הכותרת "מצרכים" ריקה');
  if (!detailsTableDone && ctx.seen.size === 0) ctx.notes.push('לא נמצאה טבלת פרטים (ארוחה, סוג מנה...)');

  return { title, fields: ctx.fields, ingredients, body: dropEmptySectionHeadings(body), images, notes: ctx.notes };
}

function blockMarkdown(block: Block): string {
  switch (block.kind) {
    case 'heading':
      return `${'#'.repeat(Math.min(Math.max(block.level, 2), 4))} ${markdown(block.runs, { plainStyle: true }).replace(/ {2}\n/g, ' ')}`;
    case 'paragraph':
      return markdown(block.runs);
    case 'list':
      return listMarkdown(block);
    case 'table':
      return tableMarkdown(block.rows);
    default:
      return '';
  }
}

/** Remove "## אופן ההכנה" / "## הערות" headings that have nothing under them. */
function dropEmptySectionHeadings(body: BodyPart[]): BodyPart[] {
  const canonical = new Set(Object.values(SECTION_TITLES).map((t) => `## ${t}`));
  const out: BodyPart[] = [];
  body.forEach((part, i) => {
    if ('md' in part && part.md.trim() === '') return;
    if ('md' in part && canonical.has(part.md)) {
      const next = body.slice(i + 1).find((p) => !('md' in p) || p.md.trim() !== '');
      if (!next || ('md' in next && next.md.startsWith('#'))) return;
    }
    out.push(part);
  });
  return out;
}
