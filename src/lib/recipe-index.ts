import { getCollection, type CollectionEntry } from 'astro:content';
import { getImage } from 'astro:assets';
import { recipeUrl } from './paths';
import { recipeView } from './recipe';
import { markdownToText, normalize } from './search';
import { INDEX_VERSION, type IndexEntry, type RecipeIndex } from './index-schema';

type Recipe = CollectionEntry<'recipes'>;

/** All recipes in display order (Hebrew alphabetical by title). Used by every listing and the index. */
export async function getSortedRecipes(): Promise<Recipe[]> {
  return (await getCollection('recipes')).sort((a, b) => a.data.title.localeCompare(b.data.title, 'he'));
}

async function toEntry(recipe: Recipe): Promise<IndexEntry> {
  const d = recipe.data;
  const view = recipeView(recipe);
  let image: string | null = null;
  if (view.image) {
    try {
      image = (await getImage({ src: view.image, width: 400 })).src;
    } catch {
      image = null; // content problems never fail the build
    }
  }
  return {
    slug: recipe.id,
    title: d.title,
    url: recipeUrl(recipe.id),
    meal: view.meal,
    dishType: view.dishType,
    ingredients: view.ingredients,
    author: d.author ?? null,
    image,
    issues: view.issues.length,
    text: {
      title: normalize(d.title),
      ingredients: normalize(view.ingredients.join(' ')),
      body: normalize([markdownToText(recipe.body ?? ''), d.author ?? '', ...(d.tags ?? [])].join(' ')),
    },
  };
}

export async function buildRecipeIndex(): Promise<RecipeIndex> {
  const recipes = await getSortedRecipes();
  return { version: INDEX_VERSION, recipes: await Promise.all(recipes.map(toEntry)) };
}
