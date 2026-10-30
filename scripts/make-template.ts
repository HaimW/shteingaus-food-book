// Generates docs/recipe-template.docx — the recipe template the family copies in
// Google Drive (upload it, open with Google Docs, File -> Save as Google Docs).
// Run: npm run template. Hebrew, right-to-left, real heading styles (build-plan R7).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeZip } from './drive-sync/zip.ts';

const OUT = resolve(import.meta.dirname, '../docs/recipe-template.docx');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (text: string, extra = '') =>
  `<w:r><w:rPr>${extra}<w:rtl/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

const para = (text: string, opts: { style?: string; numId?: number; hint?: boolean; bold?: boolean } = {}) => {
  const pPr = [
    opts.style ? `<w:pStyle w:val="${opts.style}"/>` : '',
    opts.numId ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${opts.numId}"/></w:numPr>` : '',
    '<w:bidi/>',
  ].join('');
  const rPr = opts.hint ? '<w:i/><w:iCs/><w:color w:val="7A6455"/>' : opts.bold ? '<w:b/><w:bCs/>' : '';
  return `<w:p><w:pPr>${pPr}</w:pPr>${text ? run(text, rPr) : ''}</w:p>`;
};

const cell = (content: string, width: number, shade = false) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="FBEBDD"/>' : ''}</w:tcPr>${content}</w:tc>`;

// Labels: the converter ignores the text in parentheses, so the hints can stay in the table.
const ROWS: Array<[string, string]> = [
  ['ארוחה', '(ארוחת בוקר / ארוחת צהריים / ארוחת ערב / קינוח — אפשר כמה, עם פסיק)'],
  ['סוג מנה', '(מנה עיקרית / תוספת / סלט / קינוח / אחר — אפשר כמה, עם פסיק)'],
  ['מאת', '(ממי המתכון)'],
  ['מנות', ''],
  ['זמן הכנה', ''],
  ['זמן בישול', ''],
  ['slug', '(כתובת באנגלית לאתר, לא חובה — למשל grandma-cheesecake)'],
];

const table = `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="C9B8A6"/>`)
  .join('')}</w:tblBorders><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid><w:gridCol w:w="3600"/><w:gridCol w:w="5400"/></w:tblGrid>${ROWS.map(
  ([label, hint]) =>
    `<w:tr>${cell(
      `<w:p><w:pPr><w:bidi/></w:pPr>${run(label, '<w:b/><w:bCs/>')}${hint ? run(` ${hint}`, '<w:color w:val="7A6455"/><w:sz w:val="18"/><w:szCs w:val="18"/>') : ''}</w:p>`,
      3600,
      true,
    )}${cell(para(''), 5400)}</w:tr>`,
).join('')}</w:tbl>`;

const body = [
  para('הנחיה: שם המסמך הוא שם המתכון באתר. ממלאים את הטבלה, מדביקים תמונות וכותבים מתחת לכותרות. שורות שמתחילות ב"הנחיה:" לא מופיעות באתר — אפשר למחוק אותן.', { hint: true }),
  table,
  para(''),
  para('הנחיה: כאן מדביקים את התמונה הראשית של המנה (התמונה הראשונה במסמך). אפשר להוסיף עוד תמונות בכל מקום.', { hint: true }),
  para(''),
  para('מצרכים', { style: 'Heading2' }),
  para('הנחיה: מצרך אחד בכל שורה — כמות ואז מצרך, למשל "2 כוסות קמח". אפשר כותרות קטנות כמו "לבצק:".', { hint: true }),
  para('', { numId: 1 }),
  para('', { numId: 1 }),
  para('', { numId: 1 }),
  para('אופן ההכנה', { style: 'Heading2' }),
  para('הנחיה: שלב אחד בכל שורה.', { hint: true }),
  para('', { numId: 2 }),
  para('', { numId: 2 }),
  para('', { numId: 2 }),
  para('הערות', { style: 'Heading2' }),
  para('הנחיה: טיפים, החלפות, איך מגישים (לא חובה).', { hint: true }),
  para(''),
].join('');

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>`;

const heading = (id: string, name: string, size: number) =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:bidi/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="${id.endsWith('1') ? 0 : 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="9A4321"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="he-IL" w:bidi="he-IL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:bidi/></w:pPr></w:style>${heading('Heading1', 'heading 1', 36)}${heading('Heading2', 'heading 2', 30)}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:start="720"/></w:pPr></w:style></w:styles>`;

const level = (fmt: 'bullet' | 'decimal') =>
  `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${fmt === 'bullet' ? '•' : '%1.'}"/><w:lvlJc w:val="start"/><w:pPr><w:bidi/><w:ind w:start="720" w:hanging="360"/></w:pPr></w:lvl>`;
const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>${level('bullet')}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/>${level('decimal')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`;

const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>תבנית מתכון</dc:title><dc:language>he-IL</dc:language></cp:coreProperties>`;

writeFileSync(
  OUT,
  writeZip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['word/document.xml', document],
    ['word/styles.xml', styles],
    ['word/numbering.xml', numbering],
    ['word/_rels/document.xml.rels', docRels],
    ['docProps/core.xml', core],
  ]),
);
console.log(`wrote ${OUT}`);
