# Phase 2 — Recipe page polish, shared recipe index, Hebrew search, meal filters
Status: done      Path: standard
Iteration: 1 of 3

## Request
Implement Phase 2 of docs/build-plan.md (R2, R3, R4): polish recipe page + ingredients
section (incl. red missing state); shared build-time JSON recipe index; custom client-side
Hebrew search (niqqud/punctuation stripping, final letters, attached prefixes, ranking
title > ingredients > body); meal filter combinable with search, reflected in the URL;
meal-category pages; vitest unit tests wired into the deploy workflow. Branch
phase-2-search, commit, no push.

## Acceptance criteria
- `npm test`, `npm run check`, `npm run build`, `npm run check:links` pass.
- /recipe-index.json (base-path-safe) contains slug, title, url, meal[], dishType[],
  ingredients, normalized searchable text, image thumb url, issues count; only known
  meal/dishType values.
- Search "בצל" finds recipes containing "הבצל"/"והבצל"/"בצלים"; title > ingredients > body.
- Meal filter combines with search; `?q=&meal=` round-trips via the URL.
- Accessible: labelled controls, live region for result count, keyboard-operable; RTL;
  works at 390px and 1280px.
- Content problems never fail the build (built on recipeView()).

## Decisions & constraints
- Out of scope: random recipe, meal builder, Drive sync, sync button, needs-fixing page, print.
- Search lives on the home page (progressive enhancement: server-rendered cards are
  filtered/reordered client-side; without JS all recipes show).
- Matching logic in src/lib/search.ts, no DOM / astro imports (unit-testable).
- Phase is "standard" path; orchestrator implements directly (small static-site slice),
  then code review.

## Findings by role
### frontend (orchestrator implemented directly)
- src/lib/search.ts: normalize (NFC, controls, maqaf->space, niqqud removed, geresh/gershayim/apostrophes join,
  final letters, non letter/digit -> space), variants() strips 1..3 prefix letters (stem >= 2),
  matchField: exact form 1, word-start 0.6, query-side stem (>=3) 0.5; weights title 100 / ingredients 10 / body 1;
  AND across query words; 1-letter words ignored; ties keep index (alphabetical) order.
- Index: /recipe-index.json {version, recipes[]}: slug,title,url,meal,dishType,ingredients,author,image(400px thumb|null),
  issues(count),text{title,ingredients,body} normalized. Standard headings (אופן ההכנה/הערות/מצרכים) dropped from body.
- Home: RecipeSearch (form role=search, label, radios fieldset/legend styled as chips, role=status live region,
  no-results + clear button) over server-rendered RecipeGrid; cards hidden/reordered; replaceState ?q=&meal=.
- /meals/<meal>/ static pages + header nav (aria-current) + link to /?meal=<meal>.
- Recipe page: meal chips link to meal pages, tags link to /?q=tag, facts as boxes, ingredient count,
  missing-ingredients red section with icon + how-to-fix hint, desktop two-column (sticky ingredients), smaller
  missing-photo placeholder.
- Headless check found tag list indented by body ul padding and desktop header/hero width mismatch -> fixed.
### code-reviewer
- Verdict: approve with nits; no must-fix. Security: no HTML injection (textContent/hidden only), meal param validated,
  tags encodeURIComponent'd, index not inlined. Build safety: getImage try/catch, recipeView never throws.
- Applied: prefix stems now need >= 3 letters (חם no longer matches לחם); query-prefix + plural (הבצל ~ בצלים);
  removed `any`; client checks index.version; filter chips 2.75rem tall; --accent darkened #c0582f -> #b5512a
  (white text 4.49:1 -> 5.03:1).
- Not applied (advisory): skip initial live-region announcement; 1-letter/numeric queries stay inactive;
  servings/prepTime/cookTime not in index (add in phase 3 if the meal builder shows them); split search text
  into a separate file if the index grows to hundreds of recipes.

## Open risks
- Without JS the form submits to / with ?q= but the server cannot filter: all recipes show (progressive enhancement).
- No spelling-variant handling (כתיב מלא/חסר, e.g. עגבניה/עגבנייה) — not in R4; could be added later.
- 2-letter words with an attached prefix (e.g. הלב) are only found by the full form or a word-start query.

## Verification log
- npm test: 28 passed.
- npm run check: 0 errors / 0 warnings / 0 hints.
- npm run build: 12 pages + recipe-index.json.
- npm run check:links: 12 html, 224 internal refs (incl. index url/image), 0 problems.
- Playwright Chromium (astro preview) at 390px and 1280px: "בצל" -> 4 recipes (incl. הבצל/והבצל/בצלים forms),
  +dinner -> 3, dinner only excludes dessert, shared URL ?q=ובצל&meal=breakfast restores input+radio,
  no-results + clear resets URL, arrow keys move radio selection, no console errors, no horizontal overflow.
- After review fixes: npm test 28 passed; check 0/0/0; build 12 pages; check:links 0 problems; Playwright 390/1280 ALL PASS.
