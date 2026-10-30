# Build Plan — Shteingaus Food Book

Status: **approved by owner** (2026-10-30). Sample existing doc to be shared in phase 4, once Drive is connected.

## Goal

A public Hebrew (RTL) family recipe website on GitHub Pages:
https://haimw.github.io/shteingaus-food-book/

Recipes live in a shared Google Drive folder of Google Docs. The website picks them up automatically.

## Requirements

### R1. Site
- Astro static site, `lang="he"` `dir="rtl"`, Hebrew web font (e.g. Heebo/Assistant), mobile-first.
- Pages: home (recipe card grid), recipe page, meal-category pages, search, random recipe, meal builder, "needs fixing" page.
- "סנכרן עכשיו" (sync now) button (R8) and "הוסף מתכון" (add recipe) button opening the recipe form (R12).
- Print-friendly recipe page (one clean page, no nav).
- English URL slugs, e.g. `/recipes/grandma-cheesecake` (from the doc's `slug` field, else transliterated from the title; stable once assigned).
- Repo and site are public.

### R2. Recipe model
Each Google Doc becomes one Markdown file in `src/content/recipes/` plus its images. Frontmatter:

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Hebrew title (the doc's title) |
| `slug` | no | English URL; generated if missing, then kept stable |
| `meal` | expected | one or more of: `breakfast` (ארוחת בוקר), `lunch` (ארוחת צהריים), `dinner` (ארוחת ערב), `dessert` (קינוח) |
| `dishType` | expected | **one or more** of: `main` (מנה עיקרית / חלבון), `side` (תוספת), `salad` (סלט), `dessert` (קינוח), `other` — used by the meal builder |
| `ingredients` | expected | list of ingredients (quantity + item), e.g. `2 כוסות קמח`; may be missing (see R3) |
| `servings`, `prepTime`, `cookTime` | no | |
| `author` | no | family member the recipe comes from |
| `image` | no | main photo (first image in the doc) |
| `tags` | no | |
| `driveId`, `driveModified` | yes (auto) | link back to the source doc; written by the sync |

Body: אופן ההכנה (steps), הערות (notes).

Recipe content never fails the build:
- `meal` / `dishType` accept the English key or the Hebrew label (e.g. `ארוחת ערב`). Missing or unknown values (not in the allowed list) still publish; the recipe page shows a yellow **"צריך לתקן"** box naming the value and the allowed choices, and the recipe is left out of meal filters / the meal builder for that value until fixed.
- A missing photo, or an `image` path that doesn't exist, still publishes; the page shows a red "חסרה תמונה" placeholder and the issue is listed in the "צריך לתקן" box.
- Recipe cards show a "צריך לתקן (n)" badge, and every such recipe is listed on the "needs fixing" page (R9).

### R3. Ingredients section
- Every recipe page shows a dedicated **מצרכים** section, rendered from `ingredients`.
- A recipe without ingredients still builds and publishes; its page shows a **red "מצרכים חסרים" (missing ingredients) section** in place of the list. Missing ingredients never fail the build or the sync.

### R4. Search and filters
- Full-text search across **all words in all recipes** (title, ingredients, steps, notes, author, tags).
- Custom client-side search over a build-time JSON index (no Pagefind), Hebrew-aware:
  - strips niqqud and punctuation, normalizes final letters (ך/כ, ם/מ, ן/נ, ף/פ, ץ/צ);
  - matches words with attached prefixes (ו, ה, ב, ל, מ, ש, כ and combinations such as וה, וב, שב), so **בצל** finds **ובצל / הבצל / לבצל**;
  - ranks title matches above ingredient matches above body matches.
- Filter by meal: ארוחת בוקר / צהריים / ערב / קינוח, combinable with search.
- One shared recipe index powers search, filters, random recipe and meal builder.

### R5. Random recipe
- "מתכון אקראי" button: picks a random recipe (within the active meal filter, if any) and opens it; "another one" re-rolls.

### R6. Meal builder
- "בנה לי ארוחה" picks a full meal so nobody has to decide:
  - default: **main + side + salad**, optional **+ dessert** toggle;
  - user chooses which courses to include (2, 3 or more);
  - optional meal filter (lunch/dinner);
  - re-roll the whole meal or a single course; "lock" a course and re-roll the rest;
  - the same recipe is never picked twice in one meal (a recipe tagged `side` + `salad` can fill either course, not both);
  - shareable link to the generated meal (recipe slugs in the URL).
- If a course has no recipes, it is skipped with a friendly message.
- No kosher (meat/dairy) rules.
- Runs entirely in the browser from the shared recipe index.

### R7. Google Drive sync
- **Source of truth:** a Google Drive folder (e.g. "מתכונים לאתר") of Google Docs, one recipe per doc. Family members add/edit recipes there; no GitHub account needed. Editing happens only in Drive (no `/admin` editor).
- **Recipe template** (a Google Doc to copy):
  - top details table: ארוחה (meal), סוג מנה (dish type), מאת (author), מנות, זמן הכנה, זמן בישול, slug (optional);
  - headings (real Google Docs heading styles): מצרכים / אופן ההכנה / הערות;
  - photos pasted anywhere in the doc; the first one is the main photo.
  - Parser also tolerates the existing docs' layout (to be matched against a sample from the owner) and plain bold lines as headings.
- **Sync job** — GitHub Action:
  - runs **daily** on a schedule, and on demand (R8);
  - lists the folder via the Google Drive API (service account with read-only access to the shared folder);
  - for each doc: if new or `modifiedTime` changed → export (HTML), convert to Markdown + frontmatter, download and compress images;
  - doc deleted/removed from the folder → recipe removed;
  - nothing changed → no commit, no deploy;
  - commits changes and builds + deploys in the same workflow (Action commits don't trigger other workflows).
- **Never fails on content:** unparseable parts go into the body; missing fields → red section / "needs fixing" page. The job fails only on real errors (bad credentials, Drive API down), and then the live site stays as it was.
- **Existing recipes:** the owner moves/copies the existing Google Docs into the folder (uploaded `.docx` files get converted to Google Docs format); the first sync imports them all. No separate import step.
- **Credentials:** Google service account key stored as a GitHub Actions secret (`GOOGLE_SERVICE_ACCOUNT_KEY`); read-only Drive scope. Setup guide in `docs/google-drive-setup.md`.

### R8. "Sync now" button
- A public static site cannot hold a GitHub token, so the button calls a small **Google Apps Script web app** owned by the owner:
  - the Apps Script stores a fine-grained GitHub token (scope: this repo, Actions write only) in its script properties — never in the website;
  - on request it triggers the sync workflow (`workflow_dispatch`);
  - cooldown: at most one sync per 5 minutes; extra presses get "סנכרון כבר רץ".
- Button shows: "הסנכרון התחיל — האתר יתעדכן בעוד כ־3 דקות" and links to the run status.
- Pressing it is harmless (sync is idempotent), so it is open to any visitor; it can be restricted to signed-in Google accounts later.
- Setup steps included in `docs/google-drive-setup.md`.

### R12. "הוסף מתכון" recipe form (no AI)
- A **Google Form** owned by the owner, for adding a new recipe quickly from a phone:
  - שם המתכון (required);
  - ארוחה — checkboxes: ארוחת בוקר / צהריים / ערב / קינוח;
  - סוג מנה — checkboxes: מנה עיקרית / תוספת / סלט / קינוח / אחר (fixed choices, so categories can't be mistyped);
  - מצרכים — paragraph, one ingredient per line;
  - אופן ההכנה — paragraph, one step per line;
  - הערות, מאת, מנות, זמן הכנה, זמן בישול — optional;
  - תמונות — file upload (images only; requires the person to be signed in to Google).
- A **Google Apps Script** bound to the form runs on each submission and creates a **Google Doc in the recipes folder in the exact template layout** (details table + מצרכים / אופן ההכנה / הערות headings + photos inserted), named after the recipe. The Doc stays the single source of truth for later edits (R7); the form is only a fast way to create it.
- The script then triggers the sync (same mechanism as R8), so the recipe appears on the site within a few minutes; otherwise the daily sync picks it up.
- Website: a "הוסף מתכון" button (header/home) linking to the form.
- The Apps Script code and form setup steps are committed in the repo (e.g. `apps-script/`) with a step-by-step guide; the owner installs it once.
- Tests: the Doc produced by the script is converted correctly by the R7 converter (fixture), including Hebrew, multiple photos and empty optional fields.

### R9. "Needs fixing" page
- An unlisted page (not in navigation, `noindex`) listing every recipe with problems: missing ingredients, missing photo, missing meal or dish type. Each item links to the recipe page and to its **Google Doc** for editing.

### R10. Deploy
- GitHub Actions build + deploy to Pages on push to `main` and after each sync that changed something.
- One-time manual step: repo Settings → Pages → Source = "GitHub Actions".

### R11. Quality bar
- Converter tests on sample exported docs: Hebrew text, images, template layout, existing-doc layout, missing sections, messy formatting.
- Sync tests with a mocked Drive API: new / edited / deleted / unchanged docs; slug stays stable on edit.
- Unit tests: Hebrew search normalization/prefix matching, random pick, meal builder (course filling, no duplicates, locking, empty courses).
- Build passes, no broken links (incl. the `/shteingaus-food-book/` base path), RTL verified on mobile + desktop, accessibility check passes.
- End-to-end check: add a doc to the Drive folder → press "sync now" → recipe appears on the site.

## Phases
1. Skeleton, layout, deploy, recipe schema + 4–6 sample recipes covering every meal and dish type.
2. Recipe page with ingredients section (incl. red missing state), shared recipe index, Hebrew search, meal filters.
3. Random recipe + meal builder.
4. Google Drive sync: Google Doc template, converter, daily sync Action, "needs fixing" page, setup guide. Owner does the Google Cloud setup (~15 min) and moves existing docs into the folder.
5. "Sync now" button (Apps Script), "הוסף מתכון" Google Form + Apps Script (R12), print style.

## Defaults (change if wanted)
- Site title: "ספר המתכונים משפחת שטיינגאוס" (confirmed by owner); warm, homey look with large food photos.

## Decisions log
- Google Drive folder is the single source of truth; `/admin` editor (Sveltia CMS) and `.docx` upload pipeline dropped — avoids two editing places overwriting each other, and family needs no GitHub accounts.
- Sync daily + on-demand button via Apps Script (keeps the GitHub token out of the public site).
- Added R12: Google Form → Apps Script creates a template-layout Google Doc in the folder → sync. Easiest no-AI way to add recipes; fixed category choices; Docs remain the source of truth for edits.
- Sync never fails on recipe content; problems surface as red sections and on the "needs fixing" page.
- Pagefind replaced by custom search (Hebrew attached prefixes; one shared index).
- `dishType` is multi-valued.
- No kosher rules in meal builder.
- Accepted: one secret (Google service account key) in GitHub Actions.
