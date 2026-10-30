# Phase 3 — Random recipe + meal builder
Status: done      Path: standard
Iteration: 1 of 3

## Request
Implement Phase 3 of docs/build-plan.md (R5 random recipe, R6 meal builder) on the shared
recipe index; DOM-free pick logic with injectable randomness + vitest; nav entries and
prominent buttons; mobile-first, RTL, accessible. Branch phase-3-meal-builder, commit, no push.

## Acceptance criteria
- R5: "מתכון אקראי" opens a random recipe, within the active meal filter (home filter state,
  meal pages); "another one" re-rolls and avoids the current recipe when possible.
- R6: default main+side+salad, dessert toggle, choose courses (min 2); optional meal filter;
  re-roll all / one course; lock a course; no recipe twice in a meal; shareable URL restored on
  load (unknown slugs re-picked); empty course skipped with Hebrew message; no kosher rules;
  recipes with issues eligible; each course shows a card (photo/placeholder, title, link).
- Pick logic DOM-free with injectable rng; vitest covers course filling, no duplicates incl.
  multi-dishType, locking, empty courses, meal filter, URL round-trip, random avoid-current.
- Every course has >= 2 sample options.
- npm test, check, build, check:links pass; Playwright at 390px and 1280px.

## Decisions & constraints
- Out of scope: Drive sync, sync button, needs-fixing page, print style.
- Index shape unchanged (version stays 1): the builder card uses image/title/url/author/issues
  already in the index; servings/times not shown.
- Courses = main, side, salad, dessert (one recipe each, canonical order); `other` is not a course.
- Meal filter in the builder offers breakfast/lunch/dinner; it does NOT apply to the dessert
  course (desserts are tagged meal=dessert, so a dinner filter would otherwise always empty it).
- Assignment = randomized maximum bipartite matching (courses x recipes), so a multi-dishType
  recipe is used where it does not starve another course; previous picks of re-rolled courses
  are tried last (avoid repeat when possible).
- Locked course keeps its recipe even if it no longer matches the meal filter; a lock on a
  removed/invalid recipe is dropped and the course re-picked.
- Random recipe: /random/?meal=X picks and location.replace()s to the recipe page with
  ?random=1[&meal=X]; the recipe page then shows a "עוד מתכון אקראי" bar -> /random/?meal=X&not=<slug>.
- Orchestrator implements directly (no subagents spawned: tool policy forbids spawning unless
  the user asks); self code review pass before commit.

## Findings by role
### frontend (orchestrator implemented directly)
- src/lib/random.ts: Rng type, randomInt, shuffle, pickRandom(meal, avoid), /random/ + recipe-page URL params.
- src/lib/meal-builder.ts: COURSES, fillMeal (locked -> kept -> randomized Kuhn max matching; avoided
  picks tried last), rerollAll / rerollCourse / toggleLock / setCourse (min 2), parsePlan / planToSearch,
  emptyMessage (0 / 1 / all-used variants), announce.
- src/lib/load-index.ts: shared memoized, version-checked index fetch (search now uses it too).
- Pages: /meal-builder/ (chips for courses + meal, "ארוחה אחרת", "שיתוף הארוחה" (share sheet on touch,
  else clipboard), per-course card + "החלף" + "נעל" (aria-pressed), role=status live region, URL kept with
  replaceState); /random/ (pick + location.replace to recipe ?random=1&meal=); recipe page "עוד מתכון
  אקראי" bar (avoids current). Nav entries + QuickActions on home (follows the meal filter) and meal pages.
- Samples: cabbage-salad (salad), rice-vermicelli (side), chocolate-cake (dessert) with generated SVG art.
- Index shape unchanged (version 1).
### self review (code-reviewer not spawned)
- All dynamic text via textContent; hrefs come from the build-time index; slugs regex-validated from URL.
- Fixed: duplicate live-region messages re-announced (clear + set); disabled button hover; [hidden] global rule.

## Open risks
- Breakfast filter: only one breakfast side/salad sample (israeli) -> one course skipped with a message (by design).
- Dessert course ignores the meal filter (decision above) — owner may confirm.
- /random/ is a JS redirect page; without JS it shows a message only.

## Verification log
- npm test: 63 passed (3 files). npm run check: 0/0/0. npm run build: 17 pages. check:links: 17 html, 407 refs, 0 problems.
- Playwright Chromium 390px + 1280px: ALL PASS (build meal, dessert toggle via keyboard, lock + reroll-all x6,
  single reroll, shared link restores meal + lock, unknown slug re-picked, breakfast skip message, min-2 courses,
  home random link follows dinner filter, random opens dinner recipes only, "another one" never repeats x8,
  Back skips /random/, meal page button, nav entries, no console errors, no horizontal overflow).
