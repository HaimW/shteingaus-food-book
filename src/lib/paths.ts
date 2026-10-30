/**
 * Prefix an internal path with the site base (/shteingaus-food-book/).
 * Use for every internal href/src so links survive the GitHub Pages base path.
 *   withBase('/')                 -> /shteingaus-food-book/
 *   withBase('recipes/foo/')      -> /shteingaus-food-book/recipes/foo/
 */
export function withBase(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const rest = path.replace(/^\/+/, '');
  return `${base}/${rest}`;
}

export function recipeUrl(id: string): string {
  return withBase(`recipes/${id}/`);
}
