import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DriveError } from '../scripts/drive-sync/drive';
import { loadFixtureDrive, MemoryDrive, type MockDoc } from '../scripts/drive-sync/mock-drive';
import { formatSummary, readFrontmatter, syncRecipes } from '../scripts/drive-sync/sync';

const FOLDER = 'folder-1';
let png: Uint8Array;
let dir: string;

beforeAll(async () => {
  png = new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: '#c0582f' } }).png().toBuffer());
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'recipes-'));
  // A hand-written sample recipe and the shared images folder: must never be touched.
  writeFileSync(join(dir, 'tahini.md'), '---\ntitle: טחינה\nslug: tahini\n---\nגוף\n');
  mkdirSync(join(dir, 'images'));
  writeFileSync(join(dir, 'images', 'tahini.svg'), '<svg/>');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const html = (opts: { meal?: string; slug?: string; ingredients?: string[]; image?: boolean; extra?: string } = {}) =>
  `<html><body>` +
  (opts.image ? '<p><img src="images/image1.png"></p>' : '') +
  `<table><tr><td>ארוחה</td><td>${opts.meal ?? 'ארוחת ערב'}</td></tr><tr><td>סוג מנה</td><td>מנה עיקרית</td></tr>` +
  (opts.slug ? `<tr><td>slug</td><td>${opts.slug}</td></tr>` : '') +
  `</table><h2>מצרכים</h2><ul>${(opts.ingredients ?? ['2 ביצים']).map((i) => `<li>${i}</li>`).join('')}</ul>` +
  `<h2>אופן ההכנה</h2><p>מבשלים.${opts.extra ?? ''}</p></body></html>`;

const doc = (id: string, name: string, modifiedTime: string, opts: Parameters<typeof html>[0] = {}): MockDoc => ({
  id,
  name,
  modifiedTime,
  html: html(opts),
  images: opts.image ? { 'image1.png': png } : {},
});

const run = (drive: MemoryDrive, extra: Partial<Parameters<typeof syncRecipes>[0]> = {}) =>
  syncRecipes({ drive, folderId: FOLDER, recipesDir: dir, ...extra });

const fm = (slug: string) => readFrontmatter(readFileSync(join(dir, slug, 'index.md'), 'utf8'))!;
const untouchedSamples = () => {
  expect(readFileSync(join(dir, 'tahini.md'), 'utf8')).toContain('title: טחינה');
  expect(existsSync(join(dir, 'images', 'tahini.svg'))).toBe(true);
};

describe('syncRecipes with a mocked Drive', () => {
  it('adds new docs: Markdown + compressed photo, driveId / driveModified, transliterated slug', async () => {
    const drive = new MemoryDrive(FOLDER, [doc('d1', 'שקשוקה חריפה', '2026-10-01T10:00:00Z', { image: true })]);
    const r = await run(drive);
    expect(r.changed).toBe(true);
    expect(r.added.map((i) => i.slug)).toEqual(['shkshoka-chrifa']);
    const data = fm('shkshoka-chrifa');
    expect(data).toMatchObject({
      title: 'שקשוקה חריפה',
      slug: 'shkshoka-chrifa',
      meal: ['ארוחת ערב'],
      dishType: ['מנה עיקרית'],
      ingredients: ['2 ביצים'],
      image: './photo-1.webp',
      driveId: 'd1',
      driveModified: '2026-10-01T10:00:00Z',
    });
    const photo = await sharp(readFileSync(join(dir, 'shkshoka-chrifa', 'photo-1.webp'))).metadata();
    expect(photo.format).toBe('webp');
    expect(r.added[0].issues).toEqual([]);
    untouchedSamples();
  });

  it('leaves unchanged docs alone (no export, no write)', async () => {
    const drive = new MemoryDrive(FOLDER, [doc('d1', 'שקשוקה', '2026-10-01T10:00:00Z')]);
    await run(drive);
    const before = readFileSync(join(dir, 'shkshoka', 'index.md'), 'utf8');
    drive.exports = [];
    const r = await run(drive);
    expect(r.changed).toBe(false);
    expect(r.unchanged.map((i) => i.slug)).toEqual(['shkshoka']);
    expect(drive.exports).toEqual([]);
    expect(readFileSync(join(dir, 'shkshoka', 'index.md'), 'utf8')).toBe(before);
    // unchanged recipes still report their issues (no photo here)
    expect(r.unchanged[0].issues).toContain('חסרה תמונה');
  });

  it('re-converts an edited doc and keeps its slug, also when the doc is renamed', async () => {
    const drive = new MemoryDrive(FOLDER, [doc('d1', 'שקשוקה', '2026-10-01T10:00:00Z', { image: true })]);
    await run(drive);
    drive.docs = [doc('d1', 'שקשוקה של אבא', '2026-10-05T10:00:00Z', { ingredients: ['3 ביצים', 'עגבניות'] })];
    const r = await run(drive);
    expect(r.updated.map((i) => [i.slug, i.title])).toEqual([['shkshoka', 'שקשוקה של אבא']]);
    const data = fm('shkshoka');
    expect(data.title).toBe('שקשוקה של אבא');
    expect(data.ingredients).toEqual(['3 ביצים', 'עגבניות']);
    expect(data.driveModified).toBe('2026-10-05T10:00:00Z');
    // the photo was removed from the doc -> old photo file is gone too
    expect(data).not.toHaveProperty('image');
    expect(readdirSync(join(dir, 'shkshoka'))).toEqual(['index.md']);
    expect(existsSync(join(dir, 'shel-aba'))).toBe(false);
  });

  it('uses the doc slug field (cleaned) and moves the recipe when it changes', async () => {
    const drive = new MemoryDrive(FOLDER, [doc('d1', 'שקשוקה', '2026-10-01T10:00:00Z')]);
    await run(drive);
    drive.docs = [doc('d1', 'שקשוקה', '2026-10-02T10:00:00Z', { slug: ' Dad Shakshuka ' })];
    const r = await run(drive);
    expect(r.updated[0]).toMatchObject({ slug: 'dad-shakshuka', previousSlug: 'shkshoka' });
    expect(existsSync(join(dir, 'shkshoka'))).toBe(false);
    expect(fm('dad-shakshuka').slug).toBe('dad-shakshuka');
  });

  it('rejects an invalid or taken slug field with a note and keeps the stable slug', async () => {
    const drive = new MemoryDrive(FOLDER, [doc('d1', 'שקשוקה', '2026-10-01T10:00:00Z')]);
    await run(drive);
    drive.docs = [doc('d1', 'שקשוקה', '2026-10-02T10:00:00Z', { slug: 'tahini' })];
    let r = await run(drive);
    expect(r.updated[0].slug).toBe('shkshoka');
    expect(r.updated[0].notes.join()).toContain('כבר בשימוש');
    drive.docs = [doc('d1', 'שקשוקה', '2026-10-03T10:00:00Z', { slug: 'שקשוקה' })];
    r = await run(drive);
    expect(r.updated[0].slug).toBe('shkshoka');
    expect(r.updated[0].notes.join()).toContain('לא תקין');
    untouchedSamples();
  });

  it('makes slugs unique against hand-written recipes, folders and other docs', async () => {
    const drive = new MemoryDrive(FOLDER, [
      doc('a', 'Tahini', '2026-10-01T10:00:00Z'),
      doc('b', 'Images', '2026-10-01T10:00:00Z'),
      doc('c', 'עוגה', '2026-10-01T10:00:00Z'),
      doc('d', 'עוגה', '2026-10-01T10:00:00Z'),
    ]);
    const r = await run(drive);
    expect(r.added.map((i) => i.slug).sort()).toEqual(['images-2', 'oga', 'oga-2', 'tahini-2']);
    untouchedSamples();
    // a later sync keeps every slug where it is
    drive.docs = drive.docs.map((d) => ({ ...d, modifiedTime: '2026-10-09T10:00:00Z' }));
    const again = await run(drive);
    expect(again.updated.map((i) => i.slug).sort()).toEqual(['images-2', 'oga', 'oga-2', 'tahini-2']);
  });

  it('removes recipes whose doc left the folder, and only those', async () => {
    const drive = new MemoryDrive(FOLDER, [
      doc('d1', 'שקשוקה', '2026-10-01T10:00:00Z', { image: true }),
      doc('d2', 'סלט', '2026-10-01T10:00:00Z'),
    ]);
    await run(drive);
    drive.docs = [drive.docs[1]];
    const r = await run(drive);
    expect(r.removed.map((i) => i.slug)).toEqual(['shkshoka']);
    expect(r.unchanged.map((i) => i.slug)).toEqual(['slt']);
    expect(existsSync(join(dir, 'shkshoka'))).toBe(false);
    expect(existsSync(join(dir, 'slt', 'index.md'))).toBe(true);
    untouchedSamples();
  });

  it('refuses to empty the site when the folder suddenly has no docs, unless allowed', async () => {
    const drive = new MemoryDrive(FOLDER, [doc('d1', 'שקשוקה', '2026-10-01T10:00:00Z')]);
    await run(drive);
    drive.docs = [];
    await expect(run(drive)).rejects.toThrow(DriveError);
    expect(existsSync(join(dir, 'shkshoka', 'index.md'))).toBe(true);
    const r = await run(drive, { allowEmpty: true });
    expect(r.removed).toHaveLength(1);
    expect(existsSync(join(dir, 'shkshoka'))).toBe(false);
  });

  it('writes nothing when a real Drive error happens mid-sync', async () => {
    const drive = new MemoryDrive(FOLDER, [
      doc('d1', 'אחת', '2026-10-01T10:00:00Z'),
      { id: 'd2', name: 'שתיים', modifiedTime: '2026-10-01T10:00:00Z' }, // export fails
    ]);
    await expect(run(drive)).rejects.toThrow(DriveError);
    expect(readdirSync(dir).sort()).toEqual(['images', 'tahini.md']);
  });

  it('fails clearly when the folder is missing / not shared', async () => {
    await expect(syncRecipes({ drive: new MemoryDrive(FOLDER), folderId: 'other', recipesDir: dir })).rejects.toThrow(
      /not found/,
    );
  });

  it('re-converts everything with force', async () => {
    const drive = new MemoryDrive(FOLDER, [doc('d1', 'שקשוקה', '2026-10-01T10:00:00Z')]);
    await run(drive);
    drive.exports = [];
    const r = await run(drive, { force: true });
    expect(drive.exports).toEqual(['d1']);
    expect(r.updated).toHaveLength(1);
    expect(r.changed).toBe(true);
  });

  it('never fails on content: broken photo and missing parts become issues', async () => {
    const drive = new MemoryDrive(FOLDER, [
      { id: 'x', name: 'משהו', modifiedTime: '2026-10-01T10:00:00Z', html: '<p>רק טקסט<img src="images/bad.png"></p>', images: { 'bad.png': new Uint8Array([1, 2, 3]) } },
    ]);
    const r = await run(drive);
    const item = r.added[0];
    expect(item.issues).toEqual(expect.arrayContaining(['חסרים מצרכים', 'חסרה תמונה']));
    expect(item.notes.join()).toContain('לא נקראה');
    expect(fm(item.slug)).not.toHaveProperty('image');
  });

  it('end-to-end on the fixture Drive: template, messy and broken docs, skipped .docx', async () => {
    const drive = loadFixtureDrive(join(import.meta.dirname, 'fixtures/drive'), FOLDER);
    const r = await run(drive);
    expect(r.added.map((i) => i.slug).sort()).toEqual(['baked-cheesecake', 'mrk-adshim-ktomot', 'shnitzl-shl-ama']);
    expect(r.skipped.map((s) => s.name)).toEqual(['חומוס.docx']);
    expect(r.added.find((i) => i.slug === 'baked-cheesecake')!.issues).toEqual([]);
    expect(r.added.find((i) => i.slug === 'shnitzl-shl-ama')!.issues).toEqual([]);
    expect(r.added.find((i) => i.slug === 'mrk-adshim-ktomot')!.issues).toHaveLength(4);
    expect(readdirSync(join(dir, 'baked-cheesecake')).sort()).toEqual(['index.md', 'photo-1.webp', 'photo-2.webp']);
    const summary = formatSummary(r, 'https://example.org/');
    expect(summary).toContain('added 3 · updated 0 · removed 0 · unchanged 0');
    expect(summary).toContain('Needs fixing (1) — https://example.org/needs-fixing/');
    expect(summary).toContain('https://docs.google.com/document/d/1GhImissingSoup/edit');
  });
});
