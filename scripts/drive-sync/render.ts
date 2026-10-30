// Recipe draft -> Markdown file with YAML frontmatter (build-plan R2).
import { stringify } from 'yaml';
import type { RecipeDraft } from './convert.ts';

export interface RenderOptions {
  slug: string;
  driveId: string;
  driveModified: string;
  /** Export image src -> written file name (relative to the recipe folder); missing = not written. */
  imageFiles: Map<string, string>;
}

export interface Rendered {
  markdown: string;
  /** Frontmatter `image` value, when a main photo was written. */
  image?: string;
}

const HEADER = [
  '# Generated from a Google Doc by `npm run sync` — edit the Google Doc, not this file;',
  '# local changes are overwritten on the next sync.',
];

export function renderRecipe(draft: RecipeDraft, opts: RenderOptions): Rendered {
  // Main photo = first image that was actually written (build-plan R7: first one is the main photo).
  const mainSrc = draft.images.find((src) => opts.imageFiles.has(src));
  const image = mainSrc ? `./${opts.imageFiles.get(mainSrc)}` : undefined;
  const f = draft.fields;

  const data: Record<string, unknown> = { title: draft.title, slug: opts.slug };
  if (f.meal.length) data.meal = f.meal;
  if (f.dishType.length) data.dishType = f.dishType;
  if (f.author) data.author = f.author;
  if (f.servings) data.servings = f.servings;
  if (f.prepTime) data.prepTime = f.prepTime;
  if (f.cookTime) data.cookTime = f.cookTime;
  if (f.tags.length) data.tags = f.tags;
  if (f.tested !== undefined) data.tested = f.tested;
  if (f.rating !== undefined) data.rating = f.rating;
  if (image) data.image = image;
  if (draft.ingredients.length) data.ingredients = draft.ingredients;
  data.driveId = opts.driveId;
  data.driveModified = opts.driveModified;

  const yaml = stringify(data, { lineWidth: 0 });
  const parts: string[] = [];
  for (const part of draft.body) {
    if ('md' in part) parts.push(part.md);
    else if (part.image !== mainSrc && opts.imageFiles.has(part.image)) {
      const prev = parts[parts.length - 1];
      const md = `![${draft.title.replace(/[[\]\\]/g, '')}](./${opts.imageFiles.get(part.image)})`;
      if (prev !== md) parts.push(md);
    }
  }
  const body = parts.join('\n\n').trim();
  return { markdown: `---\n${HEADER.join('\n')}\n${yaml}---\n${body ? `\n${body}\n` : ''}`, image };
}
