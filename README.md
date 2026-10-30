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
| `npm test` | Unit tests (search, meal builder, Drive converter and sync) |
| `npm run sync` | Pull recipes from the Google Drive folder (needs `GOOGLE_SERVICE_ACCOUNT_KEY` + `DRIVE_FOLDER_ID`; see [`docs/google-drive-setup.md`](docs/google-drive-setup.md)). Try it without Google: `npm run sync -- --mock-drive tests/fixtures/drive` (don't commit the result) |
| `npm run template` | Regenerate `docs/recipe-template.docx` |

## Project layout

```
src/content.config.ts      recipe schema (frontmatter fields, see build plan R2)
src/content/recipes/       hand-written sample recipes (<slug>.md) + images/
src/content/recipes/<slug>/ recipes synced from Google Drive: index.md + photo-N.webp (generated — edit the Google Doc)
src/pages/                 home, recipe pages (/recipes/<slug>/), meal pages, random, meal builder,
                           /needs-fixing/ (unlisted, noindex), 404
scripts/drive-sync/        Google Doc -> Markdown converter, Drive client, `npm run sync`
src/layouts/, src/components/, src/styles/
scripts/check-links.mjs    post-build link / base-path / RTL check
.github/workflows/deploy.yml  build + deploy to GitHub Pages on push to main (also called by sync.yml)
.github/workflows/sync.yml    daily + manual Drive sync -> commit to main -> deploy
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

`meal`, `dishType` and `ingredients` may be left out — the recipe still publishes; a recipe without ingredients shows a red "מצרכים חסרים" section. Family recipes come from the shared Google Drive folder instead — see [`docs/google-drive-setup.md`](docs/google-drive-setup.md) (setup, the recipe template, and the "needs fixing" page).

In links and asset paths, always use the `withBase()` / `recipeUrl()` helpers from `src/lib/paths.ts` so they work under the base path.

## Deployment

Every push to `main` builds and deploys via GitHub Actions; so does every Drive sync that changed something. One-time setup in the GitHub repo: **Settings → Pages → Build and deployment → Source = "GitHub Actions"**.

## Sample content

The sample recipes and their SVG illustrations are placeholders made for this repo (no third-party images).
