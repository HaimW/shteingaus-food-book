// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages project site: https://haimw.github.io/shteingaus-food-book/
// Every internal link must go through `withBase()` (src/lib/paths.ts) so it
// works under the /shteingaus-food-book/ base path.
export default defineConfig({
  site: 'https://haimw.github.io',
  base: '/shteingaus-food-book/',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
