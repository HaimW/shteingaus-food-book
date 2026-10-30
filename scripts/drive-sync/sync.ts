// Drive folder -> src/content/recipes/ (build-plan R7).
//
// - new or changed (modifiedTime) Google Docs are exported (ZIP: HTML + images),
//   converted and written to src/content/recipes/<slug>/index.md + photos;
// - docs no longer in the folder have their recipe folder removed;
// - unchanged docs are not touched;
// - only recipes with a `driveId` are managed; hand-written recipes are left alone.
// All network work and conversion happens before anything is written, so a real
// error (credentials, API down) leaves the working tree untouched.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { recipeIssues } from '../../src/lib/recipe-issues.ts';
import { convertDoc, type RecipeDraft } from './convert.ts';
import { DriveError, GOOGLE_DOC_MIME, type DriveClient, type DriveFile } from './drive.ts';
import { processImage } from './images.ts';
import { renderRecipe } from './render.ts';
import { cleanSlug, isValidSlug, slugFromTitle, uniqueSlug } from './slug.ts';
import { readZip } from './zip.ts';

export interface ExistingRecipe {
  /** Absolute path of the Markdown file. */
  path: string;
  /** Entry id = URL slug. */
  id: string;
  data: Record<string, unknown>;
  driveId?: string;
}

export interface SyncItem {
  title: string;
  slug: string;
  driveId: string;
  /** Previous slug when the doc's slug field changed the URL. */
  previousSlug?: string;
  issues: string[];
  notes: string[];
}

export interface SyncResult {
  folderName: string;
  added: SyncItem[];
  updated: SyncItem[];
  removed: SyncItem[];
  unchanged: SyncItem[];
  skipped: Array<{ name: string; reason: string }>;
  changed: boolean;
}

export interface SyncOptions {
  drive: DriveClient;
  folderId: string;
  /** Absolute path of src/content/recipes. */
  recipesDir: string;
  /** Re-convert every doc even if unchanged (e.g. after a converter update). */
  force?: boolean;
  /** Allow removing every Drive recipe when the folder looks empty. */
  allowEmpty?: boolean;
  log?: (line: string) => void;
}

/** Read the frontmatter of a recipe file; null when it has none or it is not valid YAML. */
export function readFrontmatter(text: string): Record<string, unknown> | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return null;
  try {
    const data = parseYaml(m[1]);
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function walkMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walkMarkdown(p);
    return name.endsWith('.md') ? [p] : [];
  });
}

export function scanRecipes(recipesDir: string): ExistingRecipe[] {
  return walkMarkdown(recipesDir).map((path) => {
    const data = readFrontmatter(readFileSync(path, 'utf8')) ?? {};
    const rel = relative(recipesDir, path).replace(/\\/g, '/').replace(/\.md$/, '');
    const id = isValidSlug(data.slug) ? data.slug : rel;
    const driveId = typeof data.driveId === 'string' && data.driveId ? data.driveId : undefined;
    return { path, id, data, driveId };
  });
}

const asList = (v: unknown): string[] | undefined =>
  v === undefined || v === null ? undefined : (Array.isArray(v) ? v : [v]).map((x) => String(x));

function issuesOf(rec: ExistingRecipe): string[] {
  const image = typeof rec.data.image === 'string' ? rec.data.image : undefined;
  const imageFound = Boolean(image && existsSync(resolve(dirname(rec.path), image)));
  return recipeIssues({
    meal: asList(rec.data.meal),
    dishType: asList(rec.data.dishType),
    ingredients: asList(rec.data.ingredients),
    image,
    imageFound,
  }).issues;
}

const sameTime = (a: unknown, b: string) => {
  const ta = a instanceof Date ? a.getTime() : Date.parse(String(a));
  return Number.isFinite(ta) && ta === Date.parse(b);
};

interface Prepared {
  file: DriveFile;
  draft: RecipeDraft;
  slug: string;
  previous: ExistingRecipe[];
  /** File name -> processed bytes, in the order they are written. */
  images: Map<string, Uint8Array>;
  markdown: string;
  item: SyncItem;
}

/** Delete a managed recipe: its own folder (<slug>/index.md layout) or just the file. */
function removeRecipeFiles(rec: ExistingRecipe, recipesDir: string): void {
  const dir = dirname(rec.path);
  const ownFolder = basename(rec.path) === 'index.md' && dir !== recipesDir && !relative(recipesDir, dir).startsWith('..');
  if (ownFolder) rmSync(dir, { recursive: true, force: true });
  else rmSync(rec.path, { force: true });
}

export async function syncRecipes(opts: SyncOptions): Promise<SyncResult> {
  const { drive, folderId, force = false, allowEmpty = false } = opts;
  const recipesDir = resolve(opts.recipesDir);
  const log = opts.log ?? (() => {});

  const existing = scanRecipes(recipesDir);
  const managed = new Map<string, ExistingRecipe[]>();
  for (const rec of existing) if (rec.driveId) managed.set(rec.driveId, [...(managed.get(rec.driveId) ?? []), rec]);

  const folder = await drive.getFolder(folderId);
  const listing = await drive.listFolder(folderId);
  const docs = listing.filter((f) => f.mimeType === GOOGLE_DOC_MIME);
  const skipped = listing
    .filter((f) => f.mimeType !== GOOGLE_DOC_MIME)
    .map((f) => ({
      name: f.name,
      reason: f.mimeType.endsWith('.folder')
        ? 'תיקייה — רק מסמכים שנמצאים ישירות בתיקייה מסונכרנים'
        : 'לא מסמך Google Docs — יש לפתוח ב-Google Docs ולבחור "קובץ ← שמירה כ-Google Docs"',
    }));

  if (docs.length === 0 && managed.size > 0 && !allowEmpty) {
    throw new DriveError(
      `The Drive folder "${folder.name}" has no Google Docs, but ${managed.size} recipes came from it. ` +
        'Refusing to delete them all (wrong folder or lost sharing?). Set SYNC_ALLOW_EMPTY=1 to confirm.',
    );
  }

  // Slugs that belong to someone else: hand-written recipes and any top-level name
  // in the recipes folder (e.g. images/), plus Drive recipes that stay put.
  const inFolder = new Set(docs.map((d) => d.id));
  const taken = new Set<string>();
  for (const rec of existing) if (!rec.driveId) taken.add(rec.id);
  for (const name of existsSync(recipesDir) ? readdirSync(recipesDir) : []) {
    const owner = existing.find((r) => r.driveId && dirname(r.path) === join(recipesDir, name));
    if (!owner) taken.add(name.replace(/\.md$/, ''));
  }
  for (const [driveId, recs] of managed) if (inFolder.has(driveId)) taken.add(recs[0].id);

  const result: SyncResult = { folderName: folder.name, added: [], updated: [], removed: [], unchanged: [], skipped, changed: false };
  const prepared: Prepared[] = [];

  // Stable order: known docs first (by slug), then new docs by name.
  const ordered = [...docs].sort((a, b) => {
    const sa = managed.get(a.id)?.[0]?.id;
    const sb = managed.get(b.id)?.[0]?.id;
    if (sa && sb) return sa.localeCompare(sb);
    if (sa || sb) return sa ? -1 : 1;
    return a.name.localeCompare(b.name, 'he') || a.id.localeCompare(b.id);
  });

  for (const file of ordered) {
    const previous = managed.get(file.id) ?? [];
    const current = previous[0];
    if (current && !force && previous.length === 1 && sameTime(current.data.driveModified, file.modifiedTime)) {
      result.unchanged.push({
        title: String(current.data.title ?? file.name),
        slug: current.id,
        driveId: file.id,
        issues: issuesOf(current),
        notes: [],
      });
      continue;
    }

    log(`converting "${file.name}"`);
    const files = readZip(await drive.exportZip(file));
    const htmlName = [...files.keys()].find((n) => /\.html?$/i.test(n) && !n.includes('/'));
    if (!htmlName) throw new DriveError(`The export of "${file.name}" contains no HTML document.`);
    const draft = convertDoc({ title: file.name, html: Buffer.from(files.get(htmlName)!).toString('utf8') });
    const notes = [...draft.notes];

    // Slug: valid doc field > slug this doc already has > transliterated title. Always unique.
    if (current) taken.delete(current.id);
    let slug: string | undefined;
    if (draft.fields.slug) {
      const wanted = cleanSlug(draft.fields.slug);
      if (!isValidSlug(wanted)) notes.push(`ה-slug "${draft.fields.slug}" לא תקין (רק אותיות באנגלית, ספרות ומקפים)`);
      else if (taken.has(wanted)) notes.push(`ה-slug "${wanted}" כבר בשימוש במתכון אחר`);
      else slug = wanted;
    }
    slug ??= uniqueSlug(current && isValidSlug(current.id) ? current.id : slugFromTitle(draft.title), taken);
    taken.add(slug);

    // Photos: decode + compress; a broken image is a content note, not an error.
    const images = new Map<string, Uint8Array>();
    const imageFiles = new Map<string, string>();
    let n = 0;
    for (const src of draft.images) {
      let key = src.replace(/^\.\//, '');
      try {
        key = decodeURIComponent(key);
      } catch {
        // keep the raw name
      }
      const bytes = files.get(key) ?? files.get(src);
      const out = bytes ? await processImage(bytes) : null;
      if (!out) {
        notes.push(`תמונה ${key} לא נקראה ולכן דולגה`);
        continue;
      }
      const name = `photo-${++n}.webp`;
      images.set(name, out);
      imageFiles.set(src, name);
    }

    const rendered = renderRecipe(draft, { slug, driveId: file.id, driveModified: file.modifiedTime, imageFiles });
    const issues = recipeIssues({
      meal: draft.fields.meal,
      dishType: draft.fields.dishType,
      ingredients: draft.ingredients,
      image: rendered.image,
      imageFound: Boolean(rendered.image),
    }).issues;
    const item: SyncItem = { title: draft.title, slug, driveId: file.id, issues, notes };
    if (current && current.id !== slug) item.previousSlug = current.id;
    prepared.push({ file, draft, slug, previous, images, markdown: rendered.markdown, item });
  }

  // ---- apply (only after every export and conversion succeeded) --------------------
  for (const [driveId, recs] of managed) {
    if (inFolder.has(driveId)) continue;
    for (const rec of recs) removeRecipeFiles(rec, recipesDir);
    result.removed.push({ title: String(recs[0].data.title ?? ''), slug: recs[0].id, driveId, issues: [], notes: [] });
  }
  for (const p of prepared) for (const rec of p.previous) removeRecipeFiles(rec, recipesDir);
  for (const p of prepared) {
    const dir = join(recipesDir, p.slug);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const [name, bytes] of p.images) writeFileSync(join(dir, name), bytes);
    // Frontmatter last: it only references photos that now exist on disk.
    writeFileSync(join(dir, 'index.md'), p.markdown);
    (p.previous.length ? result.updated : result.added).push(p.item);
  }

  result.changed = result.added.length + result.updated.length + result.removed.length > 0;
  return result;
}

/** Human-readable summary (Markdown; also fine as plain text in a log). */
export function formatSummary(r: SyncResult, siteUrl?: string): string {
  const lines: string[] = [];
  lines.push(`## Drive sync — "${r.folderName}"`);
  lines.push('');
  lines.push(`added ${r.added.length} · updated ${r.updated.length} · removed ${r.removed.length} · unchanged ${r.unchanged.length}`);
  const link = (slug: string) => (siteUrl ? ` — ${siteUrl}recipes/${slug}/` : '');
  const section = (title: string, items: SyncItem[], withLink: boolean) => {
    if (!items.length) return;
    lines.push('', `### ${title}`);
    for (const it of items) {
      const moved = it.previousSlug ? ` (was ${it.previousSlug})` : '';
      lines.push(`- ${it.title} [${it.slug}]${moved}${withLink ? link(it.slug) : ''}`);
      for (const note of it.notes) lines.push(`  - note: ${note}`);
    }
  };
  section('Added', r.added, true);
  section('Updated', r.updated, true);
  section('Removed', r.removed, false);
  if (r.skipped.length) {
    lines.push('', '### Skipped files');
    for (const s of r.skipped) lines.push(`- ${s.name}: ${s.reason}`);
  }
  const withIssues = [...r.added, ...r.updated, ...r.unchanged].filter((i) => i.issues.length);
  if (withIssues.length) {
    lines.push('', `### Needs fixing (${withIssues.length})${siteUrl ? ` — ${siteUrl}needs-fixing/` : ''}`);
    for (const it of withIssues) {
      lines.push(`- ${it.title} [${it.slug}] — https://docs.google.com/document/d/${it.driveId}/edit`);
      for (const issue of it.issues) lines.push(`  - ${issue}`);
    }
  }
  lines.push('', r.changed ? 'Changes written to src/content/recipes/.' : 'Nothing changed.');
  return lines.join('\n');
}
