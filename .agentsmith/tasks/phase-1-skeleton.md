# Phase 1 — Skeleton, layout, deploy, schema, sample recipes
Status: done      Path: standard
Iteration: 1 of 3

## Request
Implement Phase 1 of docs/build-plan.md: Astro site at repo root for GitHub Pages (base /shteingaus-food-book/), RTL Hebrew, recipe collection with R2 schema, home grid + basic recipe page (minimal R3 red state), 4-6 sample recipes, Pages deploy workflow, README local-run section. Branch phase-1-skeleton, commit, no push.

## Acceptance criteria
- `npm run build` passes.
- All internal links/assets resolve under /shteingaus-food-book/.
- Every page has <html lang="he" dir="rtl">; title "ספר המתכונים משפחת שטיינגאוס".
- Schema: title req; slug, meal[], dishType[], ingredients[], servings, prepTime, cookTime, author, image, tags, driveId, driveModified optional.
- Samples cover breakfast/lunch/dinner/dessert and main/side/salad/dessert/other; one with no ingredients shows red "מצרכים חסרים".
- Workflow deploys on push to main via actions/deploy-pages, pinned versions.

## Decisions & constraints
- Out of scope: search, filters, random, meal builder, sync, print style.
- Placeholder images: self-made SVGs (no copyright).
- URL: /recipes/<slug>/ from `slug` field else file id.

## Findings by role
## Open risks
## Verification log
### frontend (orchestrator implemented directly; small greenfield slice)
- Astro 7.4.4, content layer glob loader; entry id = `slug` frontmatter else filename; URL /recipes/<id>/.
- `image()` schema helper with images in src/content/recipes/images/; SVG placeholders self-generated.
- withBase()/recipeUrl() helpers for all internal links; trailingSlash 'always'.
- Emoji no-photo placeholder rendered as tofu in headless Chromium -> replaced with inline SVG.
- Added scripts/check-links.mjs (lang/dir/title + base-path + existence of every href/src/srcset/url()) and run it in CI.
### platform
- deploy.yml: checkout v7.0.1, setup-node v7.1.0 (.nvmrc=24), configure-pages v6.0.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.1, all pinned to commit SHAs; perms contents:read, pages:write, id-token:write; concurrency group pages, no cancel.

## Verification log
- rm -rf node_modules dist && npm ci: ok, 0 vulnerabilities
- npm run check: 0 errors, 0 warnings, 0 hints
- npm run build: 8 pages built
- npm run check:links: 8 html, 77 internal refs, 0 problems
- astro preview: /, /recipes/tahini/, /recipes/shakshuka/, /favicon.svg -> 200 under /shteingaus-food-book/; html tag `<html lang="he" dir="rtl">`
- Headless Chromium screenshots at 390px and 1280px: RTL layout, cards, red missing-ingredients section OK.
### code-reviewer
- Verdict: approve with nits; no must-fix.
- Applied: hero sizes 48rem; back arrow aria-hidden; per-job workflow permissions (build: contents read; deploy: pages+id-token).
- Not applied (advisory, deferred): PR build trigger; withBase guard for absolute URLs.

## Open risks (for phase 4, plan not changed)
- `image()` helper fails the build if the referenced file is missing; sync must write image before frontmatter or the schema should become a tolerant string path (R7 "never fails on content").
- Strict `z.enum` for meal/dishType: an unknown value fails the build; sync must map/drop unknown values before writing (or schema uses .catch).
- `ingredients` must be a YAML list; sync must always write a list.
- Sync must always write an explicit English `slug` (Hebrew filenames would yield poor/colliding ids); duplicate slugs only warn.
- GitHub Pages serves 404.html only at domain root for project sites; our 404 page may not show for unknown paths.
