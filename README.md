# ספר המתכונים משפחת שטיינגאוס

The Shteingaus family recipe book — a Hebrew (RTL) static site built with [Astro](https://astro.build) and published on GitHub Pages:

https://haimw.github.io/shteingaus-food-book/

The full plan (requirements and phases) is in [`docs/build-plan.md`](docs/build-plan.md).

## Running locally

Requirements: Node.js 22.23.4 or newer (the repo pins Node 24 in `.nvmrc`; with nvm run `nvm use`).

```sh
npm ci              # install exact dependencies from package-lock.json
npm run dev         # dev server with live reload
```

Open http://localhost:4321/shteingaus-food-book/ — note the `/shteingaus-food-book/` base path; the bare root `/` does not serve the site.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Build the static site into `dist/` |
| `npm run preview` | Serve the built `dist/` locally (also under `/shteingaus-food-book/`) |
| `npm run check` | Type-check Astro/TypeScript files and validate the content schema |
| `npm run check:links` | After a build: verify every page has `lang="he" dir="rtl"` and every internal link/asset resolves under the base path |

## Project layout

```
src/content.config.ts      recipe schema (frontmatter fields, see build plan R2)
src/content/recipes/       one Markdown file per recipe
src/content/recipes/images/ recipe photos
src/pages/                 home page, recipe pages (/recipes/<slug>/), 404
src/layouts/, src/components/, src/styles/
scripts/check-links.mjs    post-build link / base-path / RTL check
.github/workflows/deploy.yml  build + deploy to GitHub Pages on push to main
```

## Adding a recipe by hand

Create `src/content/recipes/<slug>.md`:

```md
---
title: שם המתכון
slug: english-url-name        # lowercase English words joined by "-"
meal: [lunch, dinner]         # breakfast | lunch | dinner | dessert
dishType: [main]              # main | side | salad | dessert | other
ingredients:
  - 2 כוסות קמח
author: סבתא
image: ./images/english-url-name.jpg
---

## אופן ההכנה

1. ...

## הערות
```

`meal`, `dishType` and `ingredients` may be left out — the recipe still publishes; a recipe without ingredients shows a red "מצרכים חסרים" section. (From phase 4 on, recipes come from the shared Google Drive folder instead.)

In links and asset paths, always use the `withBase()` / `recipeUrl()` helpers from `src/lib/paths.ts` so they work under the base path.

## Deployment

Every push to `main` builds and deploys via GitHub Actions. One-time setup in the GitHub repo: **Settings → Pages → Build and deployment → Source = "GitHub Actions"**.

## Sample content

The sample recipes and their SVG illustrations are placeholders made for this repo (no third-party images).
