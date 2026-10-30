import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { MEALS, DISH_TYPES } from './lib/labels';

/** Accept a single value or a list, always yield a list. */
const oneOrMany = <T extends z.ZodType>(item: T) =>
  z.union([item, z.array(item)]).transform((v) => (Array.isArray(v) ? v : [v]));

const text = z.union([z.string(), z.number()]).transform((v) => String(v));

// Recipe model: see docs/build-plan.md R2.
// meal / dishType / ingredients are "expected" but optional: a recipe missing
// them still publishes (R2, R3). driveId / driveModified are written by the
// Drive sync (phase 4); optional until then.
const recipes = defineCollection({
  // The glob loader uses the `slug` frontmatter field as the entry id when
  // present, otherwise the file name. The id is the URL slug.
  loader: glob({ pattern: '**/*.md', base: './src/content/recipes' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase English words joined by "-"').optional(),
      meal: oneOrMany(z.enum(MEALS)).optional(),
      dishType: oneOrMany(z.enum(DISH_TYPES)).optional(),
      ingredients: z.array(text).optional(),
      servings: text.optional(),
      prepTime: text.optional(),
      cookTime: text.optional(),
      author: z.string().optional(),
      image: image().optional(),
      tags: z.array(z.string()).optional(),
      driveId: z.string().optional(),
      driveModified: z.coerce.date().optional(),
    }),
});

export const collections = { recipes };
