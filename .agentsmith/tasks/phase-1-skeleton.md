# Phase 1 — Skeleton, layout, deploy, schema, sample recipes
Status: in-progress      Path: standard
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
