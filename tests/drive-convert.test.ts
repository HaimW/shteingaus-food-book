import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertDoc, splitValues } from '../scripts/drive-sync/convert';
import { renderRecipe } from '../scripts/drive-sync/render';
import { readFrontmatter } from '../scripts/drive-sync/sync';

const FIX = join(import.meta.dirname, 'fixtures/drive');
const fixture = (id: string) => ({
  title: JSON.parse(readFileSync(join(FIX, id, 'meta.json'), 'utf8')).name as string,
  html: readFileSync(join(FIX, id, 'doc.html'), 'utf8'),
});
const bodyMd = (d: ReturnType<typeof convertDoc>) =>
  d.body.map((p) => ('md' in p ? p.md : `[img ${p.image}]`)).join('\n\n');

/** Minimal Google-Docs-like export wrapper. */
const gdoc = (inner: string, css = '.b{font-weight:700}.n{font-weight:400}') =>
  `<html><head><meta charset="utf-8"><style type="text/css">${css}</style></head><body class="doc-content">${inner}</body></html>`;

describe('convertDoc — template layout (fixture)', () => {
  const d = convertDoc(fixture('1AbCtemplateCheesecake'));

  it('uses the doc name as title and drops the repeated Title paragraph', () => {
    expect(d.title).toBe('עוגת גבינה אפויה');
    expect(bodyMd(d)).not.toContain('עוגת גבינה אפויה\n');
  });

  it('reads the details table (incl. nbsp and an annotated slug label)', () => {
    expect(d.fields).toMatchObject({
      meal: ['קינוח'],
      dishType: ['קינוח'],
      author: 'סבתא רחל',
      servings: '12',
      prepTime: '30 דקות',
      cookTime: 'שעה',
      slug: 'Baked Cheesecake',
    });
  });

  it('reads ingredients from the list, merging Google’s flattened nested levels', () => {
    expect(d.ingredients).toEqual([
      '1 חבילת ביסקוויטים טחונים',
      '100 גרם חמאה מומסת',
      '750 גרם גבינה לבנה 5%',
      'אפשר גם 9%',
      '4 ביצים',
      '1 כוס סוכר',
    ]);
  });

  it('keeps steps and notes in order, with formatting, unwrapped links and continued numbering', () => {
    const md = bodyMd(d);
    expect(md).toContain('## אופן ההכנה\n\n1. מערבבים');
    expect(md).toContain('2. מקציפים ביצים וסוכר, מוסיפים את **הגבינה** ומערבבים.');
    expect(md).toContain('[img images/image2.png]\n\n3. אופים');
    expect(md).toContain('## הערות');
    expect(md).toContain('*מעולה* עם תותים');
    expect(md).toContain('[המתכון לרוטב](https://example.com/strawberries?a=1)');
    expect(md).not.toContain('google.com/url');
  });

  it('drops comment markers and the comment thread', () => {
    expect(bodyMd(d)).not.toMatch(/\[a\]|הערה פנימית/);
  });

  it('lists images in order of appearance', () => {
    expect(d.images).toEqual(['images/image1.jpg', 'images/image2.png']);
    expect(d.notes).toEqual([]);
  });
});

describe('convertDoc — messy layout: bold lines as headings, "label: value" lines', () => {
  const d = convertDoc(fixture('1DeFmessySchnitzel'));

  it('reads details written as lines before the first section', () => {
    expect(d.fields.meal).toEqual(['ערב', 'צהריים']);
    expect(d.fields.dishType).toEqual(['עיקרית']);
    expect(d.fields.author).toBe('אמא');
  });

  it('treats bold "מצרכים:" / "אופן ההכנה" lines as headings, splits <br> lines, strips bullets', () => {
    expect(d.ingredients).toEqual(['1 ק"ג חזה עוף', '2 ביצים', 'פירורי לחם', 'לציפוי:', 'שומשום']);
    expect(bodyMd(d)).toContain('## אופן ההכנה');
  });

  it('keeps unknown text, images and headings in the body in order', () => {
    const md = bodyMd(d);
    expect(md.indexOf('המתכון הכי אהוב בבית.')).toBeLessThan(md.indexOf('[img images/image1.jpg]'));
    expect(md).toContain('1\\. פורסים');
    expect(md).toContain('**זהירות**: השמן חם \\*מאוד\\*');
    expect(md).toContain('### הגשה\n\nמגישים עם לימון.');
  });
});

describe('convertDoc — missing sections', () => {
  const d = convertDoc(fixture('1GhImissingSoup'));

  it('keeps found values as written and reports what is missing', () => {
    expect(d.fields.meal).toEqual(['ארוחת לילה']);
    expect(d.fields.dishType).toEqual([]);
    expect(d.ingredients).toEqual([]);
    expect(d.images).toEqual([]);
    expect(d.notes).toContain('לא נמצאה כותרת "מצרכים"');
  });

  it('moves unknown table rows and free text to the body', () => {
    expect(bodyMd(d)).toBe('**עונה:** חורף\n\nמבשלים עדשים כתומות עם בצל, גזר ותבלינים כ־30 דקות וטוחנים.');
  });
});

describe('convertDoc — filled-in copy of docs/recipe-template.docx', () => {
  const html = gdoc(
    '<p class="c1"><span class="i">הנחיה: שם המסמך הוא שם המתכון באתר.</span></p>' +
      '<table><tr><td><p><span class="b">ארוחה</span><span> (ארוחת בוקר / ארוחת צהריים / ארוחת ערב / קינוח — אפשר כמה, עם פסיק)</span></p></td><td><p>ארוחת ערב, ארוחת צהריים</p></td></tr>' +
      '<tr><td><p><span class="b">סוג מנה</span><span> (מנה עיקרית / תוספת / סלט / קינוח / אחר)</span></p></td><td><p>תוספת</p></td></tr>' +
      '<tr><td><p><span class="b">slug</span><span> (כתובת באנגלית לאתר, לא חובה — למשל grandma-cheesecake)</span></p></td><td><p></p></td></tr></table>' +
      '<p><span>הנחיה: כאן מדביקים את התמונה הראשית</span></p><p><img src="images/image1.png"></p>' +
      '<h2>מצרכים</h2><p>הנחיה: מצרך אחד בכל שורה</p><ul class="lst-kix_a-0 start"><li>2 כוסות אורז</li><li></li></ul>' +
      '<h2>אופן ההכנה</h2><p>הנחיה: שלב אחד בכל שורה.</p><ol class="lst-kix_b-0 start" start="1"><li>מבשלים.</li></ol>' +
      '<h2>הערות</h2><p>הנחיה: טיפים</p><p></p>',
  );
  const d = convertDoc({ title: 'עותק של אורז לבן', html });

  it('strips the "copy of" prefix, reads the annotated labels and drops the instructions', () => {
    expect(d.title).toBe('אורז לבן');
    expect(d.fields).toMatchObject({ meal: ['ארוחת ערב', 'ארוחת צהריים'], dishType: ['תוספת'] });
    expect(d.fields.slug).toBeUndefined();
    expect(d.ingredients).toEqual(['2 כוסות אורז']);
    expect(bodyMd(d)).toBe('[img images/image1.png]\n\n## אופן ההכנה\n\n1. מבשלים.');
  });

  it('flags a doc that still has the template name', () => {
    expect(convertDoc({ title: 'עותק של תבנית מתכון', html }).notes.join()).toContain('תבנית מתכון');
  });
});

describe('convertDoc — tolerance', () => {
  it('never throws on empty, broken or non-HTML input', () => {
    for (const html of ['', 'just text', '<table><tr></tr></table>', '<<<>>>', '\u0000\u0001', '<ul><li></li></ul><img>']) {
      expect(() => convertDoc({ title: 'x', html })).not.toThrow();
    }
    expect(convertDoc({ title: '', html: '' }).title).toBe('מתכון ללא שם');
  });

  it('reads a transposed details table (labels row over values row)', () => {
    const d = convertDoc({
      title: 'סלט',
      html: gdoc(
        '<table><tr><td><p>ארוחה</p></td><td><p>סוג מנה</p></td><td><p>מאת</p></td></tr>' +
          '<tr><td><p>ארוחת צהריים</p></td><td><p>סלט, תוספת</p></td><td><p>דודה מרים</p></td></tr></table>',
      ),
    });
    expect(d.fields).toMatchObject({ meal: ['ארוחת צהריים'], dishType: ['סלט', 'תוספת'], author: 'דודה מרים' });
  });

  it('real sub-headings inside מצרכים become group labels; same-level unknown heading ends the section', () => {
    const d = convertDoc({
      title: 'פשטידה',
      html: gdoc(
        '<h2>מצרכים</h2><h3>לבצק</h3><ul><li>2 כוסות קמח</li></ul><h3>למילוי:</h3><p>3 ביצים<br>גבינה</p>' +
          '<h2>היסטוריה</h2><p>סבתא הביאה מרומניה.</p><h1>הוראות הכנה</h1><p>אופים.</p>',
      ),
    });
    expect(d.ingredients).toEqual(['לבצק:', '2 כוסות קמח', 'למילוי:', '3 ביצים', 'גבינה']);
    expect(bodyMd(d)).toBe('## היסטוריה\n\nסבתא הביאה מרומניה.\n\n## אופן ההכנה\n\nאופים.');
  });

  it('reads ingredients written as a table (quantity | item)', () => {
    const d = convertDoc({
      title: 'x',
      html: gdoc('<p class="n"><span class="b">רכיבים</span></p><table><tr><td>2</td><td>ביצים</td></tr><tr><td>1 כוס</td><td>חלב</td></tr></table>'),
    });
    expect(d.ingredients).toEqual(['2 ביצים', '1 כוס חלב']);
  });

  it('drops empty section headings', () => {
    const d = convertDoc({ title: 'x', html: gdoc('<h2>אופן ההכנה</h2><p>מערבבים.</p><h2>הערות</h2><p> </p>') });
    expect(bodyMd(d)).toBe('## אופן ההכנה\n\nמערבבים.');
  });

  it('only the first value of a field is used; a repeated label stays in the body', () => {
    const d = convertDoc({ title: 'x', html: gdoc('<p>מאת: אבא</p><p>מאת: אמא</p>') });
    expect(d.fields.author).toBe('אבא');
    expect(bodyMd(d)).toContain('מאת: אמא');
  });

  it('escapes Markdown and HTML in text', () => {
    const d = convertDoc({ title: 'x', html: gdoc('<p># לא כותרת</p><p>&lt;script&gt;alert(1)&lt;/script&gt; [x](y)</p>') });
    const md = bodyMd(d);
    expect(md).toContain('\\# לא כותרת');
    expect(md).toContain('\\<script\\>alert(1)\\</script\\> \\[x\\](y)');
  });

  it('drops non-http links (javascript:) but keeps their text', () => {
    const d = convertDoc({ title: 'x', html: gdoc('<p><a href="javascript:alert(1)">לחצו</a></p>') });
    expect(bodyMd(d)).toBe('לחצו');
  });

  it('splits multi-value fields', () => {
    expect(splitValues('ארוחת צהריים, ארוחת ערב')).toEqual(['ארוחת צהריים', 'ארוחת ערב']);
    expect(splitValues('סלט / תוספת או אחר')).toEqual(['סלט', 'תוספת', 'אחר']);
    expect(splitValues(' - ')).toEqual([]);
  });
});

describe('renderRecipe', () => {
  it('writes frontmatter the content schema accepts, main photo first, other photos in the body', () => {
    const d = convertDoc(fixture('1AbCtemplateCheesecake'));
    const { markdown, image } = renderRecipe(d, {
      slug: 'baked-cheesecake',
      driveId: 'doc1',
      driveModified: '2026-10-01T09:30:00.000Z',
      imageFiles: new Map([
        ['images/image1.jpg', 'photo-1.webp'],
        ['images/image2.png', 'photo-2.webp'],
      ]),
    });
    expect(image).toBe('./photo-1.webp');
    const fm = readFrontmatter(markdown)!;
    expect(fm).toMatchObject({
      title: 'עוגת גבינה אפויה',
      slug: 'baked-cheesecake',
      meal: ['קינוח'],
      servings: '12',
      image: './photo-1.webp',
      driveId: 'doc1',
      driveModified: '2026-10-01T09:30:00.000Z',
    });
    expect(Array.isArray(fm.ingredients)).toBe(true);
    expect(markdown).toContain('![עוגת גבינה אפויה](./photo-2.webp)');
    expect(markdown).not.toContain('photo-1.webp)');
  });

  it('uses the next written photo as main when the first could not be read, and omits empty fields', () => {
    const d = convertDoc(fixture('1AbCtemplateCheesecake'));
    const { markdown } = renderRecipe(
      { ...d, ingredients: [], fields: { meal: [], dishType: [], tags: [] } },
      { slug: 's', driveId: 'd', driveModified: 't', imageFiles: new Map([['images/image2.png', 'photo-1.webp']]) },
    );
    const fm = readFrontmatter(markdown)!;
    expect(fm.image).toBe('./photo-1.webp');
    expect(fm).not.toHaveProperty('ingredients');
    expect(fm).not.toHaveProperty('meal');
    expect(markdown).not.toContain('images/image1.jpg');
  });
});
